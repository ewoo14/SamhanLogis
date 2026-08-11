# D-G7 정산서 확정 취소 경로 — 착수 조사 보고서

> 조사일: 2026-08-11  
> 대상: PR #1169 / D-G7  
> 판정: **구현 중단 — 기존 전례로 미결 2건을 결정할 수 없음**

## 1. 결론

D-G7 구현을 시작하지 않았다.

기존 여섯 참조 문서 유형은 `ApprovalAttachment.ref_doc_no`로 연결되는 **단방향 참조**일 뿐이다. 업무문서 서비스가 그룹웨어의 첨부·결재선을 역조회하여 문서 상태 전이를 통제하는 공통 경로가 없다. 따라서 다음 두 미결을 기존 규칙으로 확정할 수 없다.

1. 결재 진행 중인 정산서의 확정 취소를 막을지, 결재 완료 후에도 취소를 허용할지
2. 재확정 시 기존 문서번호를 유지할지, 새 번호를 받을지

추가로, 현재 DRAFT 전용 재계산 경로를 그대로 둔 채 `CONFIRMED → DRAFT`만 추가하면 확정 snapshot을 다시 덮을 수 있다. 번호를 유지하면 `DRAFT 무번호`와 충돌하고, 번호를 지우고 새로 채번하면 기존 `ref_doc_no` 참조가 끊긴다. 이 세 가지를 함께 정하는 개발책임자 결정 없이는 안전한 구현이 불가능하다.

## 2. 기존 결재 6종 전례 조사

기준 enum은 `services/groupware-service/src/main/java/com/samhanair/logis/groupware/domain/ApprovalReferenceDocType.java:4-17`에 다음 여섯 유형을 정의한다.

| 문서 | 확인한 전례 | 결론 |
|---|---|---|
| 출고전표 | `SlipEditRequestService`의 `CONFIRMED/ACCEPTED/PROCESSING`은 수정·삭제 요청 후 WAREHOUSE 승인 1회가 있어야 mutation 가능. `INSPECTING/SHIPPING/DELIVERED`는 완전/영구 잠금 (`services/slip-service/src/main/java/com/samhanair/logis/slip/editrequest/service/SlipEditRequestService.java:71-78, 294-308`). | 그룹웨어 결재 첨부 상태를 조회하지 않는 별도 수정요청 전례다. |
| 입고전표 | 출고전표와 같은 slip 도메인 잠금·수정요청 계열이며, `ApprovalLineAuthorizeClient`는 단계 수행자 인가만 확인한다. | 결재선의 진행/완료 상태를 source slip에 역전파하지 않는다. |
| 분개장 | `AccountingLockPolicies.JOURNAL`은 `DRAFT` 자유, `POSTED`는 승인 필요, `REVERSED` 종결 (`services/accounting-service/src/main/java/com/samhanair/logis/accounting/editrequest/lock/AccountingLockPolicies.java:45-50`). `AccountingEditRequestService`가 승인 후 1회 mutation을 허용하고 soft-delete로 소진한다 (`.../AccountingEditRequestService.java:175-190`). | 별도 회계 수정요청 전례다. `ApprovalAttachment`의 결재 상태와는 연결되지 않는다. |
| 세금계산서 | `AccountingLockPolicies.TAX_INVOICE`는 `DRAFT` 자유, `ISSUED` 승인 필요, `CANCELLED` 종결 (`AccountingLockPolicies.java:36-42`). | 별도 수정요청/취소 전례이며 그룹웨어 첨부 결재의 취소 규칙이 아니다. |
| 거래명세서 | `ApprovalReferenceDocType.STATEMENT`와 검색/참조 모델은 있으나 source 문서의 결재 ID·결재 상태·취소 전파 경로가 없다. | 상태 전이 전례 없음. |
| 거래처원장 | `PARTNER_LEDGER`는 `partnerLedgerRef` 참조 첨부로 저장되며, 원장 자체는 조회 집계 결과다. | 수정·취소·결재 상태 전이 전례 없음. |

### 공통 확인

- `ApprovalAttachmentService.addReference()`는 참조 문서번호를 저장할 뿐(`.../ApprovalAttachmentService.java:54-88`), source 서비스에 상태 조회를 하지 않는다.
- `ApprovalAttachment.documentRef()`는 `refDocType`과 `refDocNo`를 검증·저장한다(`.../ApprovalAttachment.java:139-159`). 업무문서 존재나 결재 상태를 확인하지 않는다.
- `ApprovalLineBase`의 `documentType/documentId`는 “loose ref, FK 없음”이며(`shared/approval-core/src/main/java/com/samhanair/logis/approval/ApprovalLineBase.java:22, 89-92`), 첨부의 `ref_doc_no`와 source 문서를 묶는 공통 조회 계약이 없다.
- 그룹웨어 결재선 자체는 `PENDING/IN_PROGRESS`에서만 승인·반려 가능하고, 요청자 회수는 `WITHDRAWN`으로 전이되지만 `APPROVED/REJECTED/WITHDRAWN`은 종료 상태다(`ApprovalLineBase.java:104-150`). 이것은 결재선 자체의 회수 규칙이지, 이미 첨부된 업무문서의 확정 취소 규칙이 아니다.

따라서 “기존 6종과 같은 규칙”을 적용할 수 있는 정확한 전례는 **없다**. 별도 수정요청 전례를 정산서에 임의로 이식하는 것은 새 규칙을 만드는 것이므로 중단한다.

## 3. 현행 상태 사용처 전수표

| 사용처 | 현행 좌표 | 새 전이에 대한 조사 결과 |
|---|---|---|
| 생성 | `SalesCommissionSettlementService.createDraft()` → `SalesCommissionSettlement.createDraft()` (`SalesCommissionSettlementService.java:47-48`, `SalesCommissionSettlement.java:137-138`) | DRAFT 생성은 유지되어야 한다. |
| 확정 | `SalesCommissionSettlementService.confirm()` (`...Service.java:52-57`) | DRAFT만 허용하고 번호를 소비한다. CONFIRMED 재호출은 현재 CONFLICT다. |
| 재계산·계약 조회 | `SalesCommissionSettlementService.calculate()` (`...Service.java:60-74`) 및 `recordCalculation()` (`SalesCommissionSettlement.java:161-166`) | DRAFT만 허용한다. CONFIRMED snapshot은 현재 보호된다. 취소 후 DRAFT가 되면 그대로 snapshot을 덮을 수 있다. |
| 문서번호 채번 | `SalesCommissionSettlementNumberService.next()` (`...NumberService.java:22-32`) | 기준일 row lock으로 증가만 하며 번호 반환·재사용·취소 rollback 경로가 없다. |
| 문서번호 조회 | `findByDocumentNo()` + `findByDocumentNoAndIsDeletedFalse()` (`SalesCommissionSettlementService.java:80-87`, repository:15) | 번호로 조회하는 CONFIRMED 문서는 계속 읽을 수 있다. 다만 번호 유지/교체 정책이 미정이다. |
| 목록 | `SalesCommissionSettlement` 사용처 전수 검색 | 현재 settlement 목록 API/소비자가 없다. |
| 집계 | 같은 전수 검색 | 현재 settlement 집계 소비자가 없다. |
| 권한 | 같은 전수 검색 | 정산 전용 controller/page 권한 경로가 아직 없다. |
| 결재 연동 | `SalesCommissionSettlement` 및 `ApprovalReferenceDocType` 간 코드 연결 없음 | 결재 진행/완료를 확인할 내부 client·repository·역참조가 없다. |
| 상태 enum | `DRAFT`, `CONFIRMED`만 존재 (`SalesCommissionSettlementStatus.java:4-9`) | `CONFIRMED → DRAFT`를 추가하면 기존 상태를 소비하는 모든 경로와 snapshot·번호 semantics를 함께 바꿔야 한다. |

## 4. 현행 RED 원문

현행 구현에는 아래 세 동작이 존재하지 않는다.

```java
SalesCommissionSettlement settlement = SalesCommissionSettlement.createDraft(date);

// RED-A: 현행에는 확정 취소 메서드/API가 없다.
settlement.cancelConfirmation();

// RED-A: 현행에는 기준일 수정 도메인 메서드/API가 없다.
settlement.changeSettlementDate(otherDate);

// RED-A: 현행은 최초 confirm만 가능하다. 이미 CONFIRMED인 문서의 재확정은 거부된다.
settlement.confirm("2026/08/11-2"); // BusinessException(CONFLICT)
```

현재 `confirm()`은 `status != DRAFT`이면 `DRAFT 상태에서만 ... 확정` CONFLICT를 발생시키고(`SalesCommissionSettlement.java:147-150`), `recordCalculation()`도 `status != DRAFT`이면 재계산을 거부한다(`SalesCommissionSettlement.java:165-168`).

## 5. 미결 2건 판단

### 5.1 이미 결재에 붙은 정산서의 취소

**판단: 결정 불가. 구현하지 않는다.**

근거는 다음과 같다.

- 참조 첨부는 `approval_id + ref_doc_type + ref_doc_no`를 보관하지만 source 업무문서의 상태를 FK나 API로 묶지 않는다.
- 여섯 문서 전례 중 확인 가능한 승인 경로는 slip/accounting의 별도 수정요청 또는 액션 수행자 인가다. 그룹웨어 결재선의 `PENDING/IN_PROGRESS/APPROVED`를 업무문서 취소에 사용하는 사례가 없다.
- 그룹웨어의 `WITHDRAWN`은 요청자 본인이 결재선을 회수하는 상태이며, `APPROVED` 이후 회수는 금지된다. 이를 정산서 취소 정책으로 확대할 근거가 없다.

따라서 진행 중 결재를 막을지, 완료 결재를 막을지, 결재를 자동 회수할지 모두 새 정책이다.

### 5.2 재확정 문서번호

**판단: 결정 불가. 구현하지 않는다.**

- 번호는 `settlementDate` 기준으로 확정 시 새로 소비한다.
- DRAFT는 현재 `documentNo == null`인 계약이다.
- 번호를 유지하면 `CONFIRMED → DRAFT` 동안 DRAFT가 번호를 갖게 되어 S1이 깨진다.
- 번호를 지우고 재확정 때 새로 채번하면 기존 `ApprovalAttachment.ref_doc_no`가 이전 번호에 남아 참조가 끊긴다.
- 번호 sequence에는 취소 번호를 되돌리거나 기존 번호를 예약하는 전례가 없다.

“유지”를 택하려면 DRAFT 무번호 규칙의 예외와 attachment 참조 유지 방식을 함께 결정해야 하고, “새로 채번”을 택하려면 기존 결재 첨부의 이관/무효화 규칙을 새로 만들어야 한다.

## 6. S2 snapshot 영향

현재 확정 snapshot은 `rateContract`와 계산 금액 필드들을 `recordCalculation()`이 저장하고, 해당 메서드는 DRAFT에서만 호출된다. 단순히 CONFIRMED를 DRAFT로 바꾸면 다음이 가능해진다.

```text
CONFIRMED(snapshot V1)
  → cancel
DRAFT
  → calculate(version V2)
CONFIRMED(snapshot V2)
```

이는 “CONFIRMED snapshot 불변”을 무력화한다. 반대로 취소 시 snapshot을 지우거나 재계산을 막으면 기존 DRAFT 동작과 새 취소 후 흐름의 의미가 달라진다. 취소 시 snapshot을 유지·폐기·재계산 허용 중 무엇으로 할지 결정 정본에 없다.

## 7. 새 조합 조사표

| 조합 | 현행/전례 결과 | 판정 |
|---|---|---|
| 결재 없는 정산 취소 | 취소 API 자체가 없다. | 구현 전 결정 필요 |
| 결재 진행 중 취소 시도 | 정산서가 결재에 붙었는지 역조회할 수 없다. | 전례 없음 |
| 결재 완료 후 취소 시도 | `ApprovalLine.APPROVED` 확인 계약과 정산 취소 계약이 없다. | 전례 없음 |
| 취소 후 기준일 수정 → 재확정 | 취소·기준일 수정 모두 현행에 없고, snapshot/번호 정책도 충돌한다. | 구현 보류 |
| 취소 후 재확정(수정 없이) | 번호 유지/재채번 양쪽 모두 기존 참조에 영향을 준다. | 결정 필요 |
| 같은 날 다른 정산서가 채번된 뒤 날짜 변경 후 재확정 | sequence는 증가만 하며 번호 회수·재사용 규칙이 없다. | 결정 필요 |
| 취소를 두 번 시도 | 첫 취소 API가 없고, 두 번째 시도 규칙도 없다. | 구현 보류 |
| 재확정을 두 번 시도 | 현행 두 번째 `confirm()`은 DRAFT guard로 CONFLICT다. 취소 후 재확정 경로는 없다. | 현행 RED 확인 |

## 8. 테스트 결과

코드 변경 전 현행 정산서 핵심 단위 테스트를 실행했다.

```text
명령:
./gradlew.bat :services:accounting-service:test \
  --tests com.samhanair.logis.accounting.domain.SalesCommissionSettlementTest \
  --tests com.samhanair.logis.accounting.service.SalesCommissionSettlementServiceTest \
  --no-daemon

결과: BUILD SUCCESSFUL
```

이 결과는 기존 S1 동작의 회귀가 없다는 뜻이며, D-G7 신규 동작이 구현되었다는 뜻이 아니다. 전례 부재로 구현을 중단했으므로 accounting 전체 회귀(직전 1,867 tests)는 실행하지 않았다.

## 9. 신규 파일 목록

- `docs/dev-reports/2026-08-11-dg7-implementation.md` — 본 조사 보고서

생산 코드·migration·테스트 파일은 변경하지 않았다. 개발책임자께서 결재 상태 연동 규칙, 재확정 번호 정책, 취소 후 snapshot 처리 정책을 결정해 주신 뒤에만 D-G7 설계와 RED 테스트를 다시 상정해야 한다.
