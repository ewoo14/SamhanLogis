# PR #1266 CODEX SOL 적대검증 재판정 보고서 — 2회차

## ① 검증 SHA·main 병합

- 지정 검증 SHA: `1ae904494a39e960ef3eddde05e498f468c73f83`
- 검증 브랜치: `fix/uuid-not-in-api-response`
- 시작 시 `git fetch origin main` 뒤 `git merge origin/main --no-edit`를 실행했다. 충돌 없이 병합됐고, 병합한 main은 `eae5578fff8a4decf42c70ba9ca0f93ecc80c1b0`, 검증 HEAD는 병합 커밋 `bc23a8812d78cb9a5e7009e3675c8a980f3905a2`이다.
- 검증 말미 재조회 시 `origin/main`은 `ba1271b97af7fbd9d7590db2baba616193bbcc4a`까지 전진해 있었다. 시작 시 요구된 병합 이후 생긴 커밋이므로 작업트리에 다시 병합하지 않고, CI 및 파일 대조에만 사용했다.
- 별도 `git add`, `git commit`, `git push`는 실행하지 않았다. 위 병합 커밋은 사용자가 시작 전에 명시한 `git merge`가 만든 것이다.

## ② 기능 손실 — 경로별 클릭 결과

브랜치 JAR는 검증 HEAD 소스에서 다시 `bootJar`로 만들고, `SAMHAN_GATEWAY_ATTESTATION`과 내부 토큰을 환경변수로 주입했다. 공유 DB는 읽기 원본으로만 사용하고, 쓰기는 격리 PostgreSQL에서 수행했다.

| 경로 | 실제 클릭·네트워크 결과 | 판정 |
|---|---|---|
| 전표 코멘트 작성 → 목록 → 해결 → 삭제 | 출고전표 목록 20행 중 첫 행을 열었다. 상세 라인 1행에서 작성 201, 목록 1행, 해결 200, 삭제 200, 최종 코멘트 0행을 확인했다. | 기능 손실 없음 |
| 전표정리 저장내역 목록 → 상세 복원 | 생성 응답은 `savedAt`만 반환했다. 저장내역 목록 12행 중 첫 행을 클릭해 상세 200, 복원 배너와 결과 1행을 확인했다. | 기능 손실 없음 |
| DPS 저장내역 목록 → 상세 복원 | 생성 응답은 `savedAt`만 반환했다. 저장내역 목록 13행 중 첫 행을 클릭해 상세 200, 복원 배너와 불일치 결과 1행을 확인했다. | 기능 손실 없음 |
| 그룹웨어 일정 | 데스크톱 `#/groupware/schedules`는 404이며 데이터 행 0개였다. 코드에도 일정 화면 route가 없다. | 이 PR로 생긴 기능 손실 아님, 상세 클릭 불가 |
| **출고 마감시간 설정 목록 → 수정** | 현재 HEAD 소스로 재빌드한 브랜치 JAR에서 목록 4행을 표시했다. `경동화물` 행의 수정 버튼을 눌러 `15:00`을 `23:58`로 바꾸고 `수정`을 클릭하자 **`PATCH /admin/slip-cutoffs/undefined` → 400**, 화면에 **“요청 파라미터 형식이 올바르지 않습니다.”**가 표시됐다. | **도달 결함 1건** |

출고 마감시간 결함의 원인은 `SlipCutoffResponse.id` 제거다. 데스크톱은 이 UUID를 라벨이나 컬럼에 표시하지 않고 수정·삭제 URL의 wire key로만 쓴다. 목록 응답에서 이를 제거하면 `row.id`가 `undefined`가 되어 수정 및 삭제 경로가 깨진다. 이는 이 PR의 캐논인 **표시 금지·wire 허용**을 어긴 기능 손실이다.

첫 cutoff 시도에서 오래된 JAR가 UUID를 반환해 수정 200이 된 결과는 현재 소스와 불일치해 증거에서 폐기했다. 검증 HEAD에서 `:services:slip-service:bootJar`를 다시 실행한 뒤 위 400을 재현했고, 보고에는 재빌드 후 결과만 사용했다.

## ③ 인쇄·tooltip 전수

PR 영향 화면에서 실제 인쇄 3종과 hover 가능한 요소를 전수 확인했다.

| 화면·인쇄물 | 실데이터 행 | tooltip 대상/표시값/UUID 값 | 본문 UUID |
|---|---:|---:|---|
| DPS 복원 | 결과 1행 | 3 / 2 / 0 | 없음 |
| 전표정리 복원 | 결과 1행 | 11 / 4 / 0 | 없음 |
| 출고전표 상세·코멘트 | 라인 1행, 코멘트 왕복 | 26 / 23 / 0 | 없음 |
| 거래명세서 인쇄 | 표 15행 | 4 / 0 / 0 | 없음 |
| 세금계산서 인쇄 | 표 5행 | 4 / 0 / 0 | 없음 |
| 배차 인쇄 | 표 1행 | 6 / 2 / 0 | 없음 |

- 합계: hover 대상 54개, 실제 표시 tooltip 값 31개, UUID tooltip 값 0개.
- 데스크톱 전체 인쇄 소스에서 이번 PR 제거·복원 필드(`ownerId`, `participantIds`, `batchId`, `sourceTransferId`, `lotId`, `referenceId`, `actorUserId`, `requesterId`, `approverId`, `sourceLotId`, `destinationLotId`, `slipId`)의 출력 바인딩을 검색한 결과 0개였다.
- tooltip 정적 검색의 두 결과는 같은 줄의 일반 제목 조건과 주석 문자열이었고, UUID를 tooltip에 연결한 코드는 아니었다.
- 실제 출력물 3장을 직접 열어 데이터가 채워진 양식임을 확인했다. 로그인·404·빈 헤더 화면을 인쇄 증거로 세지 않았다.

## ④ 표시 축 유지

- DPS·전표정리 복원, 출고전표 상세·코멘트 왕복, cutoff 수정 실패 화면, 인쇄 3종의 본문에서 표준 UUID 정규식 일치 문자열은 0개였다.
- 복원된 협업 wire UUID는 React key, 컴포넌트 props, 해결·삭제 URL에만 쓰였고 화면 라벨·목록 ID 컬럼·placeholder·인쇄·tooltip에는 나타나지 않았다.
- cutoff의 올바른 계약도 동일하다. `id`는 수정·삭제 URL에 필요하지만 화면에는 표시하면 안 된다. 현재 PR은 표시 축은 지켰으나 wire 축까지 제거해 기능을 깨뜨렸다.

## ⑤ 테스트 약화 판정

변경된 네 테스트를 현재 병합 HEAD에서 `--rerun-tasks --no-build-cache --no-daemon`으로 다시 실행했다.

| 테스트 | 결과 | 판정 |
|---|---:|---|
| `DpsSaveHistoryIT` | 5/5 통과 | 주 경로가 생성 → 목록 `content[].id` → 상세로 바뀌어 실제 화면 경로를 지킨다. 타 사용자 접근 거부 보조 시나리오의 repository 직접 ID 조회는 접근 제어 성질만 격리해 검증하므로 단정 완화로 보지 않는다. |
| `SlipCleanupSaveHistoryIT` | 11/11 통과 | 주 경로는 생성 → 목록 → 상세다. repository 직접 조회는 접근 거부·soft-delete 보조 시나리오에 한정된다. |
| `MessageBulkSendIT` | 7/7 통과 | 응답 `batchId` 대신 저장 5행의 동일한 non-null batch와 수신자 집합을 검증한다. 내부 원자성 성질은 유지됐다. |
| `GroupwareAdminControllerIT` | 31/31 통과 | owner/participant 응답 단언을 제거했고, 일부는 제목 중복 단언으로 대체됐다. **참여자 축의 단정은 실제로 낮아졌다.** 다만 현재 데스크톱에 일정 route가 없어 이 약화만으로 도달 화면 결함을 재현할 수는 없다. |

합계 54/54 통과다. 그러나 이 네 테스트와 별개인 `SlipCutoffAdminControllerIT`가 PR의 wire 제거를 정확히 잡는다.

- PR 병합 HEAD: `SlipCutoffAdminControllerIT` 6개 중 1개 실패(`crud_happyPath`, `id 필드를 찾을 수 없습니다`), `SlipSalesUpdateIT` 14/14 통과.
- 병합 당시 main `eae5578ff`: 같은 두 클래스 20/20 통과.

증거 무결성 예외도 1건 확인했다. `scripts/verify-uuid-unused-removal.ps1`은 현재 HEAD에서 종료 코드 1을 내며, 의도적으로 복원한 협업 wire UUID 12개를 다시 위반으로 열거한다. 즉 라운드 보고의 “26 DTO 가드 통과”는 현재 캐논과 양립하지 않는다. 이는 화면 도달 결함 수에는 더하지 않았지만, 검증 증거로 재사용할 수 없다.

## ⑥ 스크린샷 — 행 수·경로

모든 캡처는 `resolveQaShotsDir()` 경유로 생성했고 PNG를 직접 열어 확인했다.

| 파일 | 직접 확인한 내용 |
|---|---|
| `screenshots/01-dps-restored.png` | DPS 복원 결과 1행, 복원 배너 |
| `screenshots/02-cleanup-restored.png` | 전표정리 복원 결과 1행, 복원 배너 |
| `screenshots/03-comment-resolved.png` | 전표 라인 1행, 해결된 코멘트 1행 |
| `screenshots/04-comment-deleted.png` | 전표 라인 1행, 코멘트 0행 |
| `screenshots/05-print-statement.png` | 실데이터 거래명세서, 표 15행 |
| `screenshots/05-print-invoice.png` | 실데이터 세금계산서, 표 5행 |
| `screenshots/05-print-dispatch.png` | 실데이터 배차 인쇄, 표 1행 |
| `screenshots/08-schedule-404.png` | 일정 route 404, 데이터 0행 |
| `screenshots/09-cutoff-edit-failed.png` | cutoff 목록 4행과 수정 모달의 400 오류 문구 |

## ⑦ 미검증 축

- 일정 상세: 데스크톱 route 자체가 없어 404까지만 확인했고 상세 클릭은 불가능했다.
- 현재 진입 route에 등록되지 않은 `mobile-staff`의 과거 `SlipDetailScreen`은 실행하지 않았다.
- 위 미검증 항목은 결함 0 또는 정상으로 계산하지 않았다.

기능 손실 우선축인 코멘트 왕복, DPS 복원, 전표정리 복원과 마지막 미검증축이었던 PR 영향 인쇄·tooltip은 이번 재판정에서 완료했다.

## ⑧ CI 귀속 — main 대조

PR head `1ae904494`의 GitHub checks를 REST로 직접 재조회했다.

- `빌드 + 테스트 (slip-it-core)`: 실패.
- 연결된 JUnit 결과: 741 tests, 740 passed, 1 failed.
- 실패 원문: `SlipCutoffAdminControllerIT.crud_happyPath`, `java.lang.IllegalStateException: id 필드를 찾을 수 없습니다`.
- 그 밖에 재조회한 빌드·프런트·모바일·Playwright·GitGuardian 잡은 성공이다. 이전의 phase9/groupware 및 arlogis 설치 단계 장애는 최종 재실행에서 성공했으며, 현재 남은 `Set up job` 장애는 없다.

귀속 대조 결과:

| 기준 | cutoff + R9 두 클래스 결과 | cutoff 응답 wire id |
|---|---:|---|
| PR 병합 HEAD `bc23a8812` | 20개 중 cutoff 1개 실패, R9 14/14 통과 | 없음 |
| 병합 당시 main `eae5578ff` | 20/20 통과 | 있음 |
| 최신 main `ba1271b9` | 최신 CI 전체 성공 | 있음 |

라운드2의 “R9가 PR과 main 양쪽에서 `expected: 2 / was: 1`”이라는 결과는 당시 SHA에서는 성립했지만 최신 main 병합 후에는 재현되지 않았다. 현재 R9는 PR 병합 HEAD와 main 모두 통과한다. 현재 CI red는 **PR이 cutoff wire `id`를 제거한 데 귀속**되며 main 기존 결함이 아니다.

## ⑨ 머지 가능/불가 — 도달 결함 N건

**판정: 머지 불가 — 실제 사용자가 화면을 통해 재현할 수 있는 도달 결함 1건.**

도달 결함은 `/admin/slip-cutoff`의 기존 행 수정·삭제 기능 손실이다. 이번 라이브에서는 수정 버튼으로 `PATCH .../undefined` 400을 직접 재현했다. 동일한 `row.id`를 쓰는 삭제도 같은 wire 결손의 영향을 받는다. CI hard gate도 같은 원인으로 red이므로 현재 상태로 머지할 수 없다.

확인한 다른 우선 경로인 코멘트 작성·목록·해결·삭제, 전표정리 목록→복원, DPS 목록→복원에서는 기능 손실을 발견하지 못했다. 표시·인쇄·tooltip UUID 노출도 발견하지 못했다.

## ⑩ 프로세스 회수

- 종료: 브랜치 slip-service `28086`, QA 프록시 `28126`, Vite `5126`, Playwright Chromium.
- 삭제: 격리 PostgreSQL `sol1266-reverdict2-cutoff-pg`, main 대조용 임시 clone, 임시 cutoff Playwright spec·proxy 디렉터리.
- 공유 `samhan-*` 컨테이너는 변경·재시작하지 않았다. 검증 전후 24개를 유지했다.
- 다른 작업의 `sol1265r2-pg` 등 컨테이너와 다른 워크트리는 건드리지 않았다.
- 코드 수정, `git add`, 별도 commit, push는 수행하지 않았다. 보고서와 이 보고서 전용 스크린샷만 남겼다.
