# PR #1266 fix 라운드 2 — CODEX LUNA 보고서

검증일: 2026-08-18 (KST)  
브랜치: `fix/uuid-not-in-api-response`  
PR head: `f7c50fae40fe469879cbe29c15ce2e0cf793500b`  
비교 기준: `origin/main` = `7c534b8cc780585bcc999adb97cf01cb3a5e6e32`

게시 시도: `gh pr comment 1266 --body-file docs/qa/1266-fix-round2/report.md` 3회 모두 GitHub API `503 Service Unavailable`로 실패했다. 본문 파일은 로컬에 UTF-8로 보존했다.

## ① slip 실패 2건 귀속 판정 — main 대조 원문

처음 PR head에서 attestation 없이 실행한 결과는 환경 차단이었다.

```text
.\gradlew.bat :services:slip-service:test --tests 'com.samhanair.logis.slip.it.SlipCompensationAuditIT' --tests 'com.samhanair.logis.slip.it.SlipPartnerLedgerInternalControllerIT' --rerun-tasks --no-build-cache --no-daemon --console=plain
...
Caused by: java.lang.IllegalStateException at GatewayAttestationMockMvcConfig.java:24
5 tests completed, 5 failed
HEAD_TARGETED_EXIT=1
```

테스트 전용 attestation을 프로세스에만 주입해 같은 명령을 PR head와 별도 checkout한 `origin/main`에서 각각 재실행했다.

```text
PR head:
BUILD SUCCESSFUL in 1m 10s
18 actionable tasks: 18 executed
HEAD_TARGETED_ATTESTED_EXIT=0

origin/main:
BUILD SUCCESSFUL in 1m 13s
18 actionable tasks: 18 executed
MAIN_TARGETED_ATTESTED_EXIT=0
```

CI에서 관찰된 전량 실패는 `SlipSalesUpdateIT` 단독으로 재현했다.

```text
PR head:
.\gradlew.bat :services:slip-service:test --tests 'com.samhanair.logis.slip.it.SlipSalesUpdateIT' --rerun-tasks --no-build-cache --no-daemon --console=plain
SlipSalesUpdateIT > R9 RED-A GREEN: ... FAILED
    org.opentest4j.AssertionFailedError at SlipSalesUpdateIT.java:417
14 tests completed, 1 failed
HEAD_R9_EXIT=1

origin/main:
.\gradlew.bat :services:slip-service:test --tests 'com.samhanair.logis.slip.it.SlipSalesUpdateIT' --rerun-tasks --no-build-cache --no-daemon --console=plain
SlipSalesUpdateIT > R9 RED-A GREEN: ... FAILED
    org.opentest4j.AssertionFailedError at SlipSalesUpdateIT.java:417
14 tests completed, 1 failed
MAIN_R9_EXIT=1
```

양쪽 XML 원문은 동일하게 `expected: 2` / `but was: 1`, `SlipSalesUpdateIT.java:417`을 기록했다. 따라서 CI red의 이 실패는 PR #1266 귀속이 아닌 `origin/main` 기존 결함이다. 테스트 삭제·skip·CI 필터 변경은 하지 않았다.

## ② CI 처리

- PR head의 targeted 협업 테스트 5/5는 green.
- `SlipSalesUpdateIT` R9는 PR head와 main 모두 1건 실패하므로 코드 수정 대상에서 제외하고 PM 판단 대상으로 남겼다.
- 백엔드 compile: `:services:inventory-service:compileJava :services:slip-service:compileJava :services:groupware-service:compileJava --rerun-tasks --no-build-cache --no-daemon --console=plain` → `BUILD SUCCESSFUL`, `BACKEND_COMPILE_EXIT=0`.
- 데스크톱 typecheck: `npm run typecheck` → `DESKTOP_TYPECHECK_EXIT=0`.
- 따라서 이 라운드에서 CI hard gate를 green으로 바꿀 수 있는 PR 귀속 실패는 발견되지 않았다. main 기존 실패 때문에 CI green이라고 주장하지 않는다.

## ③ 미검증 3축 라이브 결과

브랜치 JAR를 빌드 산출물로 격리 PostgreSQL에 연결해 `28085` inventory, `28086` slip, `28092` groupware로 기동했다. 공유 DB에는 쓰지 않았다.

- 전표정리 목록→상세 복원: 브랜치 API 보호 경계에서 `401`이 반환되어 목록 행을 확보하지 못했다. 클릭 성공으로 세지 않는다.
- 일정 상세: 실제 브라우저에서 `/groupware/schedules`로 이동 클릭했으며 화면의 `404 페이지를 찾을 수 없습니다`를 확인했다. 지정 클라이언트에 일정 상세 route가 없는 기존 보고와 일치한다. 참석자 표시는 미검증이다.
- 인쇄·tooltip 전수: 인증된 목록/상세에 도달하지 못해 전수 클릭·인쇄·hover를 완료하지 못했다. 미검증이다.

브라우저에서 실제 확인한 API 원문 요약:

```text
200 /auth/login
200 /auth/me
401 /slips/cleanup/history?programType=SLIP_CLEANUP&mode=MANUAL_NAMED&page=0&size=50&from=2026-08-01&to=2026-08-18
401 /slips/cleanup/history/latest?programType=SLIP_CLEANUP
404 /groupware/schedules 화면
```

## ④ 타입 불일치 처리

실제 백엔드 record는 두 파일 모두 `savedAt`만 반환한다. 데스크톱 타입의 `id: string`은 호출부에서 읽히지 않았고, 목록 row의 `id`가 상세 path에 사용된다.

- `clients/desktop/src/renderer/api/dpsSaveHistoryApi.ts`: `DpsSaveHistorySaveResponse.id` 제거.
- `clients/desktop/src/renderer/api/slipCleanupSaveHistoryApi.ts`: `SlipCleanupSaveHistorySaveResponse.id` 제거.
- 두 백엔드 response record Javadoc의 존재하지 않는 `id` 설명을 사실에 맞게 정정.

호출부 역추적 결과 저장 생성 반환값의 `.id` 소비는 0곳이다.

## ⑤ 잃으면 안 되는 것 4가지

1. wire UUID 12개 복원 상태: 기존 head의 협업 comment 8·suggestion 4 경로는 코드에서 유지됐고, 이번 수정은 저장 생성 응답 타입만 좁혔다.
2. 표시 축: 타입 수정으로 화면 라벨·컬럼·tooltip·인쇄의 UUID 표시 로직은 건드리지 않았다. 다만 이번 라운드 인쇄·tooltip 라이브 전수는 미검증이다.
3. accounting/groupware/inventory 전량 및 desktop typecheck: 이번 라운드에서 확인 가능한 것은 백엔드 세 모듈 compile 성공과 desktop typecheck 0이다. 전체 서비스 전량은 실행하지 않았다.
4. 코멘트 왕복·상세·DPS 복원: 기존 적대검증 보고서의 실제 클릭 증거를 유지하며, 이번 라운드 코드 수정은 해당 경로를 변경하지 않았다. 이번 라운드에서는 인증 경계 때문에 재현하지 못했다.

## ⑥ 스크린샷 — 직접 열어 확인한 파일·행 수

이번 라운드 캡처는 `resolveQaShotsDir()`를 사용할 수 없는 임시 standalone Playwright 시도가 아니라 확정 경로 `docs/qa/1266-fix-round2/screenshots`에 저장했다. 세 장 모두 직접 열어 확인했다. 성공 증거가 아닌 차단 증거다.

| 파일 | 직접 확인 결과 | 행 수 |
|---|---|---:|
| `docs/qa/1266-fix-round2/screenshots/slip-cleanup-list.png` | 로그인 화면 / 브랜치 보호 API 401 | 0 |
| `docs/qa/1266-fix-round2/screenshots/schedule-candidate.png` | 실제 `/groupware/schedules` 이동 후 404 | 0 |
| `docs/qa/1266-fix-round2/screenshots/sales-print.png` | 인증 세션 복귀 화면, 인쇄 미도달 | 0 |

## ⑦ 남은 미검증

- 전표정리 저장내역 목록→복원 클릭.
- 일정 상세 목록→상세 및 참석자 표시. 현재 지정 desktop route가 없어 404.
- 인쇄 양식과 전체 tooltip hover 전수.
- mobile-staff 비진입 `SlipDetailScreen`.
- slip 전량 suite 최종 수치는 장시간 실행 중 R9를 확인한 뒤 회수했으며, 단독 R9의 main 동일 실패 증거를 확정했다.

## ⑧ `git status --porcelain` 원문

보고서 작성 후 최종 명령을 실행한 원문을 아래에 붙인다.

```text
 M clients/desktop/src/renderer/api/dpsSaveHistoryApi.ts
 M clients/desktop/src/renderer/api/slipCleanupSaveHistoryApi.ts
 M services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/dto/DpsSaveHistorySaveResponse.java
 M services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/SlipCleanupSaveHistorySaveResponse.java
?? docs/qa/1266-fix-round2/
?? docs/qa/1266-sol-merge-verdict/
```

## ⑨ 프로세스·컨테이너 회수

- 회수: 제가 기동한 inventory/slip/groupware branch JAR, Vite preview, 로컬 API proxy, Chromium/Playwright.
- 삭제: 격리 PostgreSQL `codex1266-r2-pg`, 임시 main checkout `C:\Temp\codex-pr1266-main`, 임시 dump/script.
- 회수 확인: 전용 listener `28126/5126/28085/28086/28092/15466` 0개, 격리 컨테이너 0개.
- 공유 `samhan-*` 컨테이너 수: 24개 유지.
