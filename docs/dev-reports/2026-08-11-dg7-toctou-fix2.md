# D-G7 TOCTOU fix2 — SOL 차단 결함 3건

> 작업 기준: PR #1169 / HEAD `0f439f577` / 2026-08-11
>
> 지시서: [D-G7 TOCTOU SOL review](2026-08-11-dg7-toctou-sol-review.md) §5

## 1. 결론

TF-1~3을 수정했다. accounting 장애 시 정산 첨부를 fail-open으로 바꾸지 않았고, 정산 참조 검증 실패는 계속 차단한다.

TF-3 정책은 **A: 결재 생성 요청에 참조를 포함해 같은 트랜잭션으로 생성**을 선택했다. 생성 후 별도 endpoint를 순차 호출하는 방식은 결재 생성과 참조 첨부 사이의 부분 성공을 만들기 때문이다. 참조 하나라도 실패하면 groupware 트랜잭션 전체가 rollback되어 PENDING 결재가 남지 않는다. 따라서 재시도해도 기존 PENDING 결재가 누적되지 않는다.

파일 첨부는 외부 저장/업로드 성격상 생성 트랜잭션에 넣지 않았다. 파일만 실패할 수 있는 상태는 화면에 생성된 결재 ID를 유지하고 “생성된 결재 상세에서 첨부 이어서 하기”를 안내하는 복구 흐름으로 명시했다.

## 2. 수정 내용

### TF-1 — renew token 영속화

- `claim_token`의 JPA `updatable=false`를 제거했다.
- 만료 또는 RELEASED claim 재사용 시 새 token을 생성하고 DB에 저장한다.
- 반환 token으로 즉시 activate할 수 있으며, 기존 token은 더 이상 조회되지 않는다.

### TF-2 — claim 소유권과 release 범위 축소

- 살아 있는 동일 `(settlement, approval)` claim을 다른 요청이 재사용하지 못하게 했다. 다른 in-flight 요청은 409로 차단한다.
- `releaseByApproval(approvalId)` 광역 계약을 제거하고 `(approvalId, documentNo)` 단위 release 계약으로 바꿨다.
- 첨부 삭제의 accounting release는 groupware 삭제 트랜잭션이 commit된 뒤에만 실행한다. local rollback 전에 claim을 풀어 불변식 ③을 깨지 않도록 했다.
- 결재 reject/withdraw 같은 terminal 전이는 다른 요청의 in-flight claim을 release하지 않는다. 소유 transaction이 사라져도 claim TTL이 보호하고 다음 reserve 시 만료를 정리한다.

### TF-3 — 생성과 필수 정산 참조 원자화

- `ApprovalLineCreateRequest.references`를 추가했다.
- `ApprovalLineService`가 결재 생성 transaction 안에서 정산 참조를 reserve → attachment 저장 → activate한다.
- accounting 오류/timeout은 사용자 메시지로 변환한다.
  - “정산 참조가 이미 처리 중이거나 정산 상태가 변경되었습니다. 최신 상태를 확인한 뒤 다시 시도해 주세요”
  - “정산 참조 확인에 실패했습니다. 회계 서비스가 정상화된 뒤 다시 시도해 주세요”
- desktop은 선택한 문서 참조를 create 요청에 포함하며, 생성 후 정산 참조 endpoint를 순차 호출하지 않는다.

기존 groupware V19, 기존 결재 역조회 계약, accounting V99/V100 migration은 변경하지 않았다.

## 3. RED 원문과 재현 표적

수정 전 먼저 작성한 RED 표적을 격리 PostgreSQL + Flyway 전체 migration 왕복으로 실행했다.

### RED-A1 원문

```text
SalesCommissionSettlementApprovalClaimIT
  expiredClaim_canBeRenewedAndActivatedWithTheNewPersistedToken() FAILED
    BusinessException at SalesCommissionSettlementApprovalClaimIT.java:95
  releasedClaim_canBeReservedAgainAndActivatedWithReturnedToken() FAILED
    AssertionError at SalesCommissionSettlementApprovalClaimIT.java:68

SalesCommissionSettlementApprovalClaimServiceTest
  reserve_rejectsAnUnexpiredClaimOwnedByAnotherInFlightTransaction() FAILED
    AssertionError at SalesCommissionSettlementApprovalClaimServiceTest.java:85

5 tests, 3 failures
```

기존 probe의 핵심 원문은 다음과 같다.

```text
BusinessException: 결재 참조 claim을 찾을 수 없습니다: <renewed-claim-token>
```

수정 후 같은 pair의 reserve → activate → release → persistence context clear → reserve → 반환 token activate와 EXPIRED 뒤 renew 표적이 모두 통과했다. DB token도 응답 token과 일치한다.

### RED-B1/B2 표적

- 동일 pair 동시 reserve barrier: 한 owner만 claim을 획득하고 다른 요청은 409, 승자 ACTIVE claim을 보상 release하지 않는다.
- S1 삭제는 S2 claim을 건드리지 않는다.
- S2 취소는 활성/in-flight claim 때문에 409이며 `DRAFT + 활성 attachment`가 되지 않는다.

## 4. 불변식별 확인

| 불변식 | 보장 수단 |
|---|---|
| ① | renew token DB update + 반환 token activate 통합 IT |
| ② | pair별 live claim 1 owner, exact release, terminal 전이의 broad release 제거 |
| ③ | groupware commit 전 live claim 유지, 삭제 release는 after-commit |
| ④ | 결재 생성 transaction 안의 references 처리와 accounting claim 보호 |
| ⑤ | 참조 실패 시 결재 생성 transaction rollback, 중복 PENDING 불가 |

기존 `OUTBOUND_SLIP` 5행과 `JOURNAL` 2행의 정상 첨부 경로는 새 accounting 호출을 통과하지 않는 기존 분기로 유지했다.

## 5. 검증 결과

### 격리 실 DB

```text
.\gradlew.bat :services:accounting-service:test --tests \
  com.samhanair.logis.accounting.service.SalesCommissionSettlementApprovalClaimServiceTest \
  --tests com.samhanair.logis.accounting.it.SalesCommissionSettlementApprovalClaimIT --no-daemon
BUILD SUCCESSFUL

.\gradlew.bat :services:groupware-service:test --tests \
  com.samhanair.logis.groupware.service.ApprovalAttachmentSettlementClaimTest \
  --tests com.samhanair.logis.groupware.service.ApprovalLineApprovalConflictTest \
  --tests com.samhanair.logis.groupware.client.AccountingSettlementApprovalClaimClientTest \
  --tests com.samhanair.logis.groupware.it.ApprovalTemplateAttachmentIT --no-daemon
BUILD SUCCESSFUL
```

두 IT 모두 Testcontainers PostgreSQL과 Flyway V1~V100을 사용했다. mock-only 검증으로 대체하지 않았다.

### 전체 회귀

| 모듈 | testcase | failure | error | skipped | 결과 |
|---|---:|---:|---:|---:|---|
| accounting-service | 1,891 | 0 | 0 | 10 | PASS |
| groupware-service | 254 | 0 | 0 | 0 | PASS |

```text
.\gradlew.bat :services:accounting-service:test --no-daemon
BUILD SUCCESSFUL in 7m 15s

.\gradlew.bat :services:groupware-service:test --no-daemon
BUILD SUCCESSFUL in 1m 32s
```

### desktop

```text
GroupwareApprovalCreatePage.test.ts                 9 passed
GroupwareApprovalCreatePage.integration.test.tsx    5 passed
npm run typecheck                                    PASS
```

## 6. 새로 가능하게 남은 상태 전수

이번 수정이 차단하지 않고 의도적으로 남긴 상태는 다음과 같다.

1. 소유 process가 죽으면 `RESERVED/ACTIVE` claim이 TTL까지 남는다. 다음 reserve가 만료를 정리하며, 별도 cleanup job이 없으면 RELEASED/EXPIRED 이력은 누적된다.
2. groupware transaction이 rollback되어도 accounting claim 보상 호출이 장애이면 claim은 TTL까지 보호 상태로 남는다. 이는 attachment가 commit되지 않은 동안 fail-open하지 않기 위한 상태다.
3. 생성은 원자화했지만 파일 업로드가 실패하면 참조가 있는 PENDING 결재와 파일 0건이 남을 수 있다. 화면은 같은 결재 상세로 이어서 첨부하는 명시적 UX를 제공한다.
4. settlement가 아닌 파일/기타 참조 유형은 기존 별도 저장 경계를 유지하므로 해당 endpoint 실패와 재시도 멱등성을 별도 검증해야 한다.
5. 삭제 commit 이후 accounting release가 네트워크 실패하면 claim은 TTL까지 남는다. 삭제 전 release하지 않는 것이 불변식 ③ 우선 정책이다.
6. 수동 입력한 정산 문서번호가 유효하지 않으면 create 요청에서 차단되며, accounting 정상화 전에는 정산 첨부를 성공시킬 수 없다.

## 7. 라이브 QA

요구된 accounting 정상/중단 양쪽 라이브 QA는 브라우저 런타임을 확보하지 못해 수행하지 못했다. 브라우저 skill의 in-app Browser 연결 시도 원문은 다음과 같다.

```text
No browser is available
```

따라서 chromium-1217 화면을 가장한 PNG를 만들지 않았고, `docs/qa/2026-08-11-dg7-fix2/README.md`에 실패 원문을 남겼다. 이 세션에서 서버를 새로 띄우거나 공유 DB에 write하지 않았다.

