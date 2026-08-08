# PR #1106 / 이슈 #1074 S2 수정 보고서

## 결론

결함 1·2·3을 수정했다. 커밋·push는 하지 않았고, 공유 Docker 스택을 재기동하지 않았다. QA 전표 12건은 삭제·수정하지 않았다.

## 결함 1 — 과거 출고일 신규 생성 서버 차단

`OutboundCutoffGuard.assertWithinCutoffForCreation(tag, slipDate)`를 추가했다.

- 과거 출고일 신규 전표: `409 CONFLICT`, `과거 출고일 신규 전표는 생성할 수 없습니다`
- 오늘 출고일 신규 전표: 기존 배송태그별 KST 마감 가드 유지
- 미래 출고일 신규 전표: 기존처럼 허용
- 기존 전표 수정 및 배송태그 확정(`editHeader`, 배치 수정): 기존 `assertWithinCutoff` 유지. 따라서 과거 전표 수정은 차단하지 않는다.

신규 생성 경로 수동·견적 변환·모바일 주문·주문 발행 3경로·복제를 생성 전용 메서드로 전환했다. 마감 시각, 마감 행, DB 데이터는 변경하지 않았다.

회귀 테스트:

- 과거 신규 생성은 `BusinessException(CONFLICT)`
- 기존 과거 전표 수정용 가드는 통과
- 기존 6태그 마감 전/마감 후 당일/익일 계약 유지

## 결함 3 — KST 날짜 정본

원인은 계산 테스트의 기대값만이 아니라 FE가 실행 환경의 로컬 타임존을 사용한 것이었다.

- 폼의 오늘 날짜가 `getFullYear/getMonth/getDate` 기반 로컬 날짜였다.
- N 계산이 로컬 `Date`의 `getDay/getDate`에 의존했다.
- BE는 이미 `Clock.system(Asia/Seoul)`을 사용하고 있었다.

FE에 `toKstDateISO`를 추가해 폼의 M 기본값과 `min`을 KST로 고정했다. `computeUnloadDate`는 `Date` 로컬 API 대신 UTC 달력 산술(`getUTCDay`, `setUTCDate`)로 계산해 입력 날짜의 요일·월말 경계가 실행 환경에 무관하도록 했다. UTC는 계산 저장소가 아니라 타임존 독립 달력 산술의 구현 수단이다.

검증 원문:

```text
TZ=UTC
✓ SlipFormPage outbound date contract > allows next-day outbound creation
Test Files 1 passed (1); Tests 1 passed (96 skipped)

TZ=Asia/Seoul
✓ SlipFormPage outbound date contract > allows next-day outbound creation
Test Files 1 passed (1); Tests 1 passed (96 skipped)
```

추가로 KST 경계 입력 `2026-08-07T20:30:00Z`가 `2026-08-08`로 변환되는 회귀 테스트를 추가했다.

## 결함 2 — 사용자가 수정한 N 보존

N 입력의 `onChange`가 발생하면 `unloadDateManuallyEdited`를 기억한다.

- 직접 수정 전: M 변경 시 기존처럼 N을 자동 재계산
- 직접 수정 후: M 변경 시 N을 덮어쓰지 않음
- 직접 수정 후 새 M의 자동 일정과 N이 다름: `role=alert`로 `출고일(M)과 하차일(N)을 확인하세요`를 표시하고 저장 버튼을 비활성화
- 태그 변경 또는 당착 토글: 사용자가 일정 모드를 명시적으로 바꾼 동작이므로 자동 계산 상태를 새로 시작

잘못된 M/N 조합을 서버에 조용히 저장하지 않으며, 사용자가 새 M에 맞는 N으로 고치면 오류가 사라진다.

## 검증

```text
./gradlew.bat :services:slip-service:test --tests "com.samhanair.logis.slip.service.cutoff.OutboundCutoffGuardTest"
BUILD SUCCESSFUL

./gradlew.bat :services:slip-service:test --tests "com.samhanair.logis.slip.service.SlipServiceTest" --tests "com.samhanair.logis.slip.mobile.service.MobilePartnerOrderServiceTest" --tests "com.samhanair.logis.slip.service.SlipServiceAuditDiffTest"
BUILD SUCCESSFUL

npm run test -- src/renderer/routes/SlipFormPage.test.tsx src/renderer/utils/deliverySchedule.test.ts
Test Files 2 passed (2); Tests 135 passed (135)

npm run typecheck
exit 0
```

`typecheck`의 real-QA 단계는 기존 미추적 로컬 스펙 경고를 출력했지만 허용된 로컬 실행 모드로 계속됐고, 최종 테스트는 50/50 통과했다.

## 무훼손 확인

- A/B/C/D 마감 계약, 활성 태그 6개: 기존 검증 결과 유지
- 화면 UUID 0, 사용자 `슬립` 용어 0, 권한 풀네임 유지
- DB 직접 INSERT/UPDATE/DELETE 없음
- QA 전표 12건 정리하지 않음
- `git diff --stat`: 12 tracked files, `104 insertions(+), 22 deletions(-)` — 삭제 줄 수 **22**

## 신규 파일

- `docs/dev-reports/2026-08-08-1074-s2-server-guard-and-timezone.md`

기존 미추적 QA 산출물 `docs/dev-reports/2026-08-08-1074-verification-and-live-qa.md` 및 `docs/qa-shots/1074-live-qa/`는 이번 수정에서 생성·변경하지 않았다.
