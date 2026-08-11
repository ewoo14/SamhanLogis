# D-G7 fix3 — TF-4 원자 생성 transaction lease 예산

## 결론

TF-4 전제는 코드와 RED-A 실 재현에서 사실이었다. 원자 생성 경로에는 transaction timeout이 없었고(`-1`), 생성 request의 `references`에는 상한이 없었다. 이 상태에서는 accounting claim의 300초 lease가 먼저 만료된 뒤에도 groupware transaction이 살아 있을 수 있었다.

fix3은 원자 생성 경로에 120초 transaction timeout을 전파하고, 외부 claim 왕복까지 포함하는 monotonic deadline과 참조 상한을 추가했다. timeout/상한은 모두 사용자가 읽을 수 있는 오류로 반환한다. timeout 중 rollback은 groupware 승인과 참조를 남기지 않으며, claim은 즉시 해제를 시도한다.

## RED-A — 수정 전 원문

먼저 `Dg7ToctouFix3IT`를 추가하고, 구현 전 격리 Testcontainers PostgreSQL + Flyway 왕복으로 실행했다.

```text
.\gradlew.bat :services:groupware-service:test --tests com.samhanair.logis.groupware.it.Dg7ToctouFix3IT --rerun-tasks

2 tests completed, 2 failed

atomicCreate_transactionTimeoutIsFiniteAndShorterThanActiveClaimLease
Expecting:
 <120>
but was:
 <-1>

atomicCreate_rejectsReferencesBeyondTheLeaseBudget
Expecting actual not to be empty
```

첫 실패는 `ApprovalLineService.createWithActor`의 transaction timeout이 무제한임을, 둘째 실패는 `ApprovalLineCreateRequest.references`에 검증 상한이 없음을 증명했다. 수정 후 동일 RED-A는 2/2 PASS했다.

## 적용한 정책

`SettlementApprovalReferencePolicy`에 원자 생성의 공통 예산을 모았다.

| 항목 | 값 | 근거 |
|---|---:|---|
| accounting ACTIVE claim lease | 300초 | 기존 accounting 계약 보존 |
| groupware 원자 생성 transaction | 120초 | lease보다 짧게 고정 |
| claim connect timeout | 2초 | 기존 client 계약 |
| claim read timeout | 5초 | 기존 client 계약 |
| 원격 claim 1회 최악 예산 | 7초 | 2초 + 5초 |
| 원자 생성 참조 상한 | 7건 | 7건 × reserve/activate 2회 × 7초 = 98초, DB/결재선 처리 여유 22초 |

따라서 정상적인 다건 참조 7건까지는 원자 생성으로 통과한다. 7건을 초과하면 원자 transaction을 길게 늘리지 않고, 결재 생성 후 상세 화면에서 단건 참조 추가를 반복하거나 별도 결재로 나누도록 안내한다. 상세 화면의 기존 단건 추가 경로와 기존 활성 참조 7건은 변경하지 않았다.

120초 annotation만으로는 JDBC transaction timeout이 원격 accounting HTTP 왕복의 deadline을 자동으로 제한하지 않으므로, 원자 생성 시작 시 monotonic deadline을 계산하고 다음을 모두 검사한다.

- 각 참조 처리 전 deadline 검사
- reserve/activate 호출 전 최소 7초 잔여 예산 검사
- claim 활성화 및 로컬 저장 뒤 deadline 검사
- 생성 전 references 상한 검사

## 새로 가능해진 상태와 처리

### timeout rollback 뒤 claim

reserve가 성공한 뒤 timeout, activate 실패, 로컬 저장 실패가 나면 catch에서 accounting release를 즉시 시도한다. transaction rollback callback에도 보상 해제를 등록해 중복 호출은 멱등으로 처리한다.

release가 성공하면 claim은 즉시 `RELEASED`가 된다. release 네트워크 호출 자체가 실패하면 groupware transaction은 fail-closed로 rollback되고 claim은 accounting의 기존 300초 lease 만료/정리 경로가 회수한다. 어느 경우에도 groupware에 `DRAFT + 활성 정산 참조`가 남은 채 commit되는 경로는 없다.

### 참조 상한에 걸린 사용자

원자 생성 요청이 8건 이상이면 원격 호출과 approval 저장 전에 HTTP 400을 반환한다.

```text
결재 생성 시 참조는 최대 7건까지 가능합니다. 초과분은 결재 생성 후 상세 화면에서 나누어 추가해 주세요
```

사용자는 7건 이하로 먼저 결재를 생성한 뒤 상세 화면의 `문서 참조 추가`에서 남은 참조를 나누어 붙일 수 있다. 상한 거절은 생성 전에 일어나므로 결재 row와 파일 POST가 생기지 않는다.

### 느린 accounting

각 claim HTTP 호출은 connect 2초/read 5초로 제한하고, 호출 전에 7초 전체 예산이 남았는지 확인한다. 따라서 설정된 왕복 한도 안의 정상적인 느린 accounting은 7건까지 통과할 수 있다. 120초 예산이 부족해지는 순간에는 transaction을 더 기다리지 않고 다음 메시지로 500을 반환한다.

```text
정산 참조가 많거나 회계 서비스 응답이 지연되어 결재 생성 시간이 제한을 초과했습니다. 참조를 나누어 다시 시도해 주세요
```

이 균형은 `7건 × 2회 × 7초 = 98초`의 최대 원격 예산과 `120초 - 98초 = 22초`의 로컬 처리 여유로 잡았다. 120초는 300초 lease보다 짧으므로 transaction이 살아 있는 동안 claim 보호가 끊기는 상태를 허용하지 않는다.

## 구현 범위

- `ApprovalLineService.create/createWithActor`에 120초 transaction timeout 적용
- 원자 생성과 상세 참조 추가가 공유하는 deadline/claim timeout 정책 추가
- `ApprovalAttachmentService.addReferencesAtomically`에 동일 deadline 전달
- claim reserve/activate 이전 잔여 예산 검사 및 실패 시 즉시 release 보상
- `ApprovalLineCreateRequest.references`에 최대 7건 Bean Validation 추가
- accounting claim client timeout을 정책 상수로 통일
- transaction timeout/rollback 오류를 읽을 수 있는 500 메시지로 변환
- RED-A 통합 테스트와 deadline 초과 단위 테스트 추가

## 검증 결과

### Backend

- RED-A 수정 후: 2/2 PASS
- claim unit + RED-A: PASS
- `:services:groupware-service:test --rerun-tasks --no-daemon --max-workers=1`: **257 tests, 0 failures, 0 errors, 0 skipped**
- 격리 Testcontainers PostgreSQL에서 Flyway groupware V19/accounting V100 적용 확인

### 실제 격리 서비스 왕복

공유 DB는 조회하지 않고, 별도 PostgreSQL 두 개에만 write했다.

- CONFIRMED 정산 `2026/08/11-1` 1건 생성
- groupware 원자 생성 + settlement claim reserve/activate: **201**
- 격리 accounting DB에 ACTIVE claim과 격리 groupware DB에 활성 첨부 확인
- OUTBOUND 참조 7건 생성: **201**
- 참조 8건 생성: **400**, 위 사용자 메시지, approval 0건

### Desktop

- `GroupwareApprovalCreatePage.test.ts`: **9 passed**
- `GroupwareApprovalCreatePage.integration.test.tsx`: **5 passed**
- `npm run typecheck`: **PASS**
- Playwright: `clients/desktop`, headless Chromium-1217 직접 실행
- `/collab/stream`은 빈 SSE로 종료해 무기한 대기를 피함
- 상한 오류 화면에서 `/attachments/file` POST: **0회**

스크린샷:

- [01-create-page.png](../qa/2026-08-11-dg7-fix3/01-create-page.png)
- [02-reference-cap-error.png](../qa/2026-08-11-dg7-fix3/02-reference-cap-error.png)
- [03-atomic-created-detail.png](../qa/2026-08-11-dg7-fix3/03-atomic-created-detail.png)

## 정리

QA에 사용한 격리 accounting/groupware 애플리케이션, PostgreSQL 두 개, Docker network와 Vite 프로세스는 검증 후 종료한다. 공유 서비스와 공유 DB에는 write하지 않았다.
