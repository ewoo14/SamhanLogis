# D-G7 교차 서비스 TOCTOU 수정 보고서

> 작업일: 2026-08-11  
> 대상: PR #1169, 워크트리 HEAD `fba6d246d` 기반  
> 범위: 영업수수료 정산 확정 취소 ↔ 그룹웨어 결재 참조 첨부  
> 제외: groupware V19 migration, 기존 결재 역조회 구현, S4 화면, 40% 규칙

## 1. 결론

`DRAFT + PENDING/IN_PROGRESS 결재 참조`가 저장되는 교차 서비스 TOCTOU를 claim/CAS 방식으로 닫았다.

- accounting 정산 행을 공통 직렬화 지점으로 사용한다.
- claim은 정산서 전체 1개가 아니라 `(settlement_id, approval_id)`별로 만든다.
- 첨부는 `RESERVED → groupware 로컬 첨부 row 준비 → ACTIVE` 순서다.
- 취소는 정산 행 `PESSIMISTIC_WRITE` 잠금 아래 기존 groupware 활성 참조 확인과 accounting claim 확인을 모두 통과해야 한다.
- claim 해제 실패는 유효기간 만료로 자가 치유한다.
- 분산 트랜잭션·2PC는 도입하지 않았다.

## 2. 수정 전 RED 원문 재현

SOL이 지적한 현행 순서는 다음과 같다.

```text
정산 S = CONFIRMED, documentNo = 2026/08/11-3
결재 A = PENDING, 아직 정산 참조 POST를 보내지 않음

1. A가 2026/08/11-3을 선택해 stale request로 보관한다.
2. B가 S 확정 취소를 호출한다.
3. accounting은 groupware 활성 참조 조회에서 false를 받는다.
4. S가 snapshot history 저장 후 DRAFT가 된다. documentNo는 유지된다.
5. A가 같은 stale request를 POST한다.
6. 현행 addReference()는 refDocNo 문자열만 만들고 201로 저장한다.

최종: S = DRAFT, A = PENDING, A가 2026/08/11-3을 참조
```

현행 결함 좌표는 SOL 원문과 동일하다.

- `SalesCommissionSettlementService.cancelConfirmation()`은 groupware boolean 조회 후 accounting mutation을 수행했다.
- `ApprovalAttachmentService.addReference()`와 `ApprovalAttachment.documentRef()`는 대상 정산 상태를 조회하지 않았다.
- `ApprovalLine.guardCollabModifiable()`은 PENDING/IN_PROGRESS 첨부를 허용했다.

이 수정의 RED 표적은 다음 테스트로 고정했다.

- stale DRAFT 정산 첨부는 accounting claim 예약 단계에서 `409 CONFLICT`가 된다.
- groupware 첨부 저장 예외가 나면 claim release 보상 호출이 실행된다.
- groupware 읽기가 false여도 accounting claim이 살아 있으면 취소가 `409 CONFLICT`다.
- 저장 실패 후 release 호출이 유실되어도 lease 만료 후 취소가 가능하다.

## 3. 직렬화 방식과 경합 창

### 3.1 accounting 직렬화 지점

새 저장소는 `V100__add_sales_commission_settlement_approval_claim.sql`의
`sales_commission_settlement_approval_claims`다.

`SalesCommissionSettlementRepository`에 다음 잠금 조회를 추가했다.

- `findByDocumentNoAndIsDeletedFalseForUpdate()`
- `findByIdAndIsDeletedFalseForUpdate()`

claim 예약과 취소 모두 같은 `sales_commission_settlements` 행을 `PESSIMISTIC_WRITE`로 잠근다.
claim 조회는 `(settlement_id, status, expires_at)` partial index를 사용한다.

단순 재조회는 groupware boolean을 읽은 뒤 accounting 저장 직전에 claim 첨부가 들어오는 창을
닫지 못한다. 정산 row의 낙관적 version도 양쪽 서비스가 같은 version을 저장하는 단일 transaction이
아니므로 저장 직전 상대 서비스의 참조를 배제하지 못한다. 따라서 이번 경계에서는 accounting 정산
row 잠금과 그 잠금 안의 claim 상태 검사를 함께 사용했다. 분산 transaction/2PC는 저장소 구조와
범위에서 배제했다.

claim 상태는 다음과 같다.

```text
RESERVED  -- 30초 lease. groupware가 로컬 첨부 transaction을 진행 중
   |
   +--> ACTIVE -- 300초 lease. 첨부 row가 transaction 안에 준비된 뒤 승격
   |
   +--> RELEASED / EXPIRED
ACTIVE --> RELEASED / EXPIRED
```

claim owner는 `approval_id`, 멱등 키는 `(settlement_id, approval_id)`다. 따라서 같은 정산서에 결재 2건이 붙으면 claim 2행이 생기며, 그중 하나라도 유효하면 취소가 실패한다.

### 3.2 취소가 먼저 이기는 경우

```text
T-CANCEL: accounting 정산 행 잠금 획득
T-CANCEL: 기존 groupware 활성 참조 false 확인
T-CANCEL: 유효 claim 없음 확인
T-CANCEL: snapshot history 저장 + CONFIRMED → DRAFT 저장
T-ATTACH: claim 예약 시 DRAFT를 보고 409 실패
```

취소가 이긴 뒤에는 claim과 첨부가 저장되지 않는다.

### 3.3 첨부가 먼저 이기는 경우

```text
T-ATTACH: accounting 정산 행 잠금 아래 RESERVED claim 저장
T-CANCEL: 행 잠금 획득을 기다린다
T-ATTACH: groupware 첨부 row 준비
T-ATTACH: claim ACTIVE 승격 후 groupware transaction commit
T-CANCEL: groupware 활성 참조 true 또는 ACTIVE claim을 보고 409 실패
```

취소가 groupware 조회를 먼저 통과했더라도, accounting claim 검사가 같은 정산 행 잠금 아래 다시 실행되므로 `DRAFT` 전이가 저장되지 않는다.

### 3.4 남는 경합 창의 폭과 동작

경합 창을 없앴다고 표현하지 않는다. 다음 폭이 남고, 각 창의 승자는 결정론적이다.

| 창 | 폭/조건 | 결정 결과 |
|---|---|---|
| 취소 조회 후 첨부 예약 | groupware boolean 조회 완료부터 accounting 정산 행 잠금 획득까지 | 첨부가 먼저 claim을 저장하면 취소 409, 취소가 먼저 DRAFT를 저장하면 첨부 409 |
| RESERVED 중 groupware 저장 | RESERVED lease 최대 30초 | 취소가 30초 안이면 claim 때문에 409; 30초가 지나면 claim을 만료시키고 취소가 이김. 이후 첨부 `activate`가 DRAFT를 보고 실패하고 로컬 row는 rollback |
| ACTIVE 승격 후 groupware commit | groupware 첨부 transaction 최대 120초, accounting claim HTTP connect 2초/read 5초, ACTIVE lease 300초 | 취소는 ACTIVE claim 때문에 409. claim 호출이 5초 안에 끝나지 않으면 groupware transaction이 실패하고, transaction timeout도 120초로 제한되므로 ACTIVE lease 만료 뒤 stale row가 commit되는 경로를 차단 |
| release 보상 유실 | 네트워크/서비스 장애 | claim은 남지만 최대 30초(RESERVED) 또는 300초(ACTIVE) 뒤 EXPIRED. 사용자는 같은 취소를 재시도해 정상 진행 가능 |

groupware `addReference()`에는 120초 transaction timeout을 두고, accounting claim client에는 connect 2초/read 5초 timeout을 두었다. ACTIVE lease 300초보다 두 제한이 모두 짧으므로, ACTIVE 승격 후 local transaction이 lease 만료 뒤 commit하는 창은 허용하지 않는다.

## 4. 고아 claim 처리와 자가 치유

### 4.1 첨부 저장 실패

첨부 흐름은 다음과 같다.

```text
1. accounting reserve(documentNo, approvalId)
2. groupware attachmentRepository.save() — 아직 local transaction 안
3. accounting activate(claimToken)
4. groupware transaction commit
```

2 또는 3에서 예외가 나면 즉시 `release(claimToken)`을 호출한다. transaction rollback callback도 등록해 commit 실패 시 같은 release를 재시도한다. release는 멱등이다.

### 4.2 release 자체 실패

보상 호출이 네트워크·서비스 장애로 실패하면 원래 첨부 실패를 유지하고 claim을 억지로 성공 처리하지 않는다. accounting row의 lease가 자가 치유 경로다.

- RESERVED 고아: 30초 후 `EXPIRED`
- ACTIVE 고아: 300초 후 `EXPIRED`
- 취소 재시도 시 만료 claim은 잠긴 정산 행 아래 즉시 `EXPIRED`로 바뀌고 취소가 진행된다.

따라서 사용자 스스로 취소를 다시 시도해 빠져나올 수 있고 관리자 수동 DB 조작은 필요 없다. 다만 lease 동안에는 안전을 위해 취소가 409일 수 있다.

### 4.3 결재 삭제·반려·회수

- 첨부 soft-delete 시 같은 `(approval, documentNo)`의 다른 활성 참조가 없으면 `releaseByApproval()`을 호출한다.
- REJECTED/WITHDRAWN 전이 시 결재선 owner의 모든 정산 claim을 해제한다.
- 이 release 호출이 실패해도 결재 반려·회수와 첨부 삭제의 정상 경로를 막지 않는다. claim lease가 자가 치유한다.
- APPROVED는 활성 상태이므로 claim을 유지한다.
- 현재 코드에는 결재선 자체를 삭제하는 endpoint가 없다. 실제 삭제 가능한 대상은 첨부 soft-delete이며 그 경로를 닫았다.

## 5. 모순 상태가 저장되지 않는 보장

`DRAFT + 활성 결재 참조`가 되려면 다음 두 저장이 모두 성공해야 한다.

1. accounting 정산이 DRAFT로 저장
2. groupware 활성 첨부 row가 저장

취소는 accounting 정산 행 잠금과 claim 검사를 통과해야 한다. 첨부는 CONFIRMED claim을 먼저 예약하고, 로컬 첨부 row가 준비된 transaction에서 claim을 ACTIVE로 올린다.

- 취소가 먼저 저장되면 이후 claim 예약이 DRAFT 조건에서 거부된다.
- claim이 먼저 있으면 취소가 claim 검사에서 거부된다.
- RESERVED가 만료되어 취소가 이기면 후속 activate가 DRAFT를 보고 실패하고 groupware transaction이 rollback된다.
- ACTIVE가 된 뒤에는 claim 호출이 connect 2초/read 5초 안에 끝나야 하고, groupware transaction도 120초 timeout이 있어 300초 lease보다 먼저 실패한다.
- 이미 커밋된 groupware 활성 첨부는 기존 역조회가 true를 반환하므로 claim lease가 만료되어도 취소가 거부된다.

따라서 정상 timeout/transaction 규약 안에서 두 저장이 동시에 모순 상태로 커밋되는 경로가 없다.

## 6. 기존 역조회·V19 충돌 확인

확인 결과 이번 fix는 다음만 추가했다.

- accounting V100 claim table와 internal claim API
- groupware의 accounting claim client 및 첨부 lifecycle 호출
- groupware 결재 terminal 상태의 claim release 호출

다음은 수정하지 않았다.

- `groupware-service` V19 migration
- `ApprovalAttachmentService.hasActiveSettlementApproval()`의 기존 역조회 SQL/상태 집합
- `/internal/groupware/settlement-approvals/active` endpoint

따라서 #1168의 V19·역조회 변경과 겹치는 수정은 없다.

## 7. 조합표

| 조합 | 기대 결과 | 검증/보장 |
|---|---|---|
| 결재 없음 → 취소 | 성공, DRAFT, history 1행 | 기존 accounting 전체 suite + 기존 service test |
| PENDING/IN_PROGRESS/APPROVED → 취소 | 409 | 기존 groupware 역조회 + claim 검사 |
| REJECTED/WITHDRAWN → 취소 | 성공 | terminal 전이 claim release + 기존 역조회 false |
| 취소 확인 직후 첨부 | 첨부 409, attachment 0행 | claim reserve의 CONFIRMED 조건 |
| 첨부 직후 취소 | 취소 409 | groupware active 참조 또는 ACTIVE claim |
| DRAFT에 첨부 | 409, attachment 0행 | accounting reserve 상태 gate |
| 동시 실행 | 취소 승자 또는 첨부 승자 하나만 성공 | 정산 행 PESSIMISTIC_WRITE |
| claim 선점 후 groupware 첨부 실패 | 첨부 rollback, claim release | 즉시 보상 + rollback callback |
| release 자체 실패 | lease 후 취소 재시도 성공 | 30초/300초 EXPIRED 자가 치유 |
| 같은 정산서에 결재 2건 | claim 2행, 둘 중 하나라도 active면 취소 409 | approval별 claim 모델 |
| 첨부 삭제 | 마지막 동일 참조 삭제 시 owner claim release | soft-delete 후 releaseByApproval |
| 결재 반려/회수 | owner claim release | ApprovalLineService terminal transition |
| CONFIRMED 조회·목록·집계 | 기존 동작 유지 | settlement read path 미변경 |
| DRAFT 기존 동작 | 기존 동작 유지 | DRAFT 계산/기준일 경로 미변경 |
| S2 snapshot | history 보존, mutation 후 snapshot 덮어쓰기 없음 | 기존 snapshot tests |
| S1 채번 | 최초 DRAFT 무번호, CONFIRMED 시 채번 | 기존 number tests |

## 8. 테스트 결과

### accounting 강제 전체

실행:

```powershell
.\gradlew.bat :services:accounting-service:test --rerun-tasks --no-daemon --console=plain
```

결과:

```text
BUILD SUCCESSFUL in 10m 23s
21 actionable tasks: 21 executed
```

생성된 `services/accounting-service/build/test-results/test/TEST-*.xml` 227개를 전수 합산했다.

```text
기존 SOL 기준: 1,879 tests / failures 0 / errors 0 / skipped 10
이번 fix 신규 accounting tests: 7
이번 실행 실측: 1,886 tests / failures 0 / errors 0 / skipped 10
```

즉 SOL이 정정한 기존 분모 1,879는 그대로 모두 통과했고, fix 회귀 테스트 7개가 추가되어 현재 suite 합계가 1,886이다.

accounting 신규 검증:

- `SalesCommissionSettlementApprovalClaimServiceTest`
- `SalesCommissionSettlementApprovalClaimTest`
- `SalesCommissionSettlementApprovalClaimMigrationSqlTest`
- 기존 `SalesCommissionSettlementServiceTest`의 claim 취소 경합 케이스

### groupware 전체

실행:

```powershell
.\gradlew.bat :services:groupware-service:test --no-daemon --console=plain
```

최종 XML 전수 합산:

```text
252 tests / failures 0 / errors 0 / skipped 0
```

핵심 신규 검증:

- `ApprovalAttachmentSettlementClaimTest`
- `AccountingSettlementApprovalClaimClientTest`
- 기존 `GroupwareInternalControllerIT` 및 groupware 전체 suite

timeout 보강 후 claim client·첨부 focused 재실행:

```powershell
.\gradlew.bat :services:groupware-service:test --tests '*AccountingSettlementApprovalClaimClientTest' --tests '*ApprovalAttachmentSettlementClaimTest' --no-daemon --console=plain
```

결과: `BUILD SUCCESSFUL`, 2개 focused test class 통과.

공유 DB write와 배포는 수행하지 않았다. git commit/push/merge도 수행하지 않았다.
