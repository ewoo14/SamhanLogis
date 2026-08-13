# D-G1 S1 SOL 5.6 코드 검토

검토일: 2026-08-11  
대상: PR #1165 미커밋 S1 / `accounting-service`  
판정: **HOLD — 차단 결함 1건**

## 1. 결함

### SOL-S1-01 — null 문서번호 조회가 번호 없는 DRAFT를 반환한다

**좌표**

- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/SalesCommissionSettlementService.java:35-40`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/repository/SalesCommissionSettlementRepository.java:12-13`
- 회귀 좌표: `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/SalesCommissionSettlementServiceTest.java`
- PostgreSQL 재현 좌표: `services/accounting-service/src/test/java/com/samhanair/logis/accounting/it/SalesCommissionSettlementNumberSequenceIT.java`
- 저장소 내 정상 비교본:
  - `CollectionPlanService.java:221-227`
  - `NotesReceivableService.java:125-131`

**불변식**

`findByDocumentNo`는 null/blank가 아닌 실제 업무 문서번호만 받아야 한다. 번호가 없는 DRAFT는
문서번호 조회로 절대 회수되면 안 되며, null/blank 입력은 repository를 호출하기 전에
`BusinessException(ErrorCode.INVALID_INPUT)`으로 닫혀야 한다.

**재현 데이터와 실제 결과**

1. Testcontainers PostgreSQL에서 `settlementDate=2099-12-28` DRAFT 한 건을 생성한다.
2. 생성 행은 `id=<UUID>`, `status=DRAFT`, `document_no=NULL`이다.
3. `settlementService.findByDocumentNo(null)`을 호출한다.
4. 기대: `INVALID_INPUT`.
5. 실제: 예외 없이 위 DRAFT가 반환된다.

독립 RED probe를 임시 추가해 실행했다.

```text
SalesCommissionSettlementNumberSequenceIT
  > findByDocumentNo_rejectsNullInsteadOfReturningDraft() FAILED
java.lang.AssertionError at SalesCommissionSettlementNumberSequenceIT.java:76
1 test completed, 1 failed
BUILD FAILED in 36s
```

probe는 제거했고, 원본 테스트 파일 SHA-256
`03BC265FB904A38B7ACB1EBAB3A4DF0829A0F873D2DE676C7F854A92135FE797` 복원을 확인했다.

**근본 원인**

서비스가 입력을 검증·trim하지 않고 Spring Data derived query에 그대로 넘긴다. null 인자는
`document_no IS NULL` 의미로 평가되므로, DRAFT가 한 건이면 그 행을 정상 조회 결과처럼 돌려준다.
기존 `CollectionPlanService`와 `NotesReceivableService`는 동일한 업무번호 조회 전에 null/blank를
`INVALID_INPUT`으로 차단하고 trim한 뒤 repository를 호출하지만, 신규 서비스만 이 가드가 빠졌다.

## 2. LUNA 수정 지시서

### RED-A — 서비스 단위 표적

`SalesCommissionSettlementServiceTest`에 다음을 고정한다.

1. `null`, `""`, `"   "` 각각이 `BusinessException`이며
   `getErrorCode() == ErrorCode.INVALID_INPUT`인지 검증한다.
2. 세 입력 모두 `verifyNoInteractions(repository)` 또는 동등한 검증으로 DB 조회가 시작되지 않음을
   증명한다.
3. `"  2026/08/11-1  "`은 trim된 `"2026/08/11-1"`로 repository를 조회하는지 검증한다.
4. 존재하지 않는 유효 비공백 번호는 기존대로 `NOT_FOUND`인지 검증한다.

### RED-B — PostgreSQL 표적

`SalesCommissionSettlementNumberSequenceIT`에 다음 조합을 고정한다.

1. DRAFT 1건 + null 조회 → `INVALID_INPUT`, DRAFT 회수 금지.
2. DRAFT 2건 + null 조회 → `INVALID_INPUT`; `IncorrectResultSizeDataAccessException`까지 내려가지 않음.
3. DRAFT 1건 + blank/whitespace 조회 → `INVALID_INPUT`.
4. DRAFT → CONFIRMED 후 정확한 번호 및 앞뒤 공백이 붙은 번호 조회 → 같은 확정 UUID 회수.
5. 알 수 없는 유효 형식 번호 → `NOT_FOUND`.

그 뒤 `SalesCommissionSettlementService.findByDocumentNo`를 기존
`CollectionPlanService.findByPlanNo` 패턴처럼 입력 가드 → trim → repository 조회 순서로 최소 수정한다.

**제 전제가 틀렸다면 고치지 말고 중단·보고하십시오.** 특히 이 메서드가 null을 받아 DRAFT를 찾는
의도된 API라면, 현재 Javadoc의 “문서번호로 활성 정산서를 되찾는다”와 DRAFT 번호 없음 정책이
충돌하므로 코드 수정 전에 그 계약부터 개발책임자에게 상정해야 한다.

## 3. 첫 각도 — 실제 채번 경로와 뮤테이션

- 왕복 IT는 document number를 fixture로 직접 심지 않는다.
- 실제 경로는 `createDraft(FIRST_DATE)` → `confirm(draft.id)` →
  `numberService.next(settlementDate)` → domain `confirm(documentNo)` → save →
  `findByDocumentNo(confirmed.documentNo)`이다.
- 생성 직후 DRAFT는 `status=DRAFT`, `documentNo=null`로 실 PostgreSQL에서 확인된다.
- 확정 뒤 `2099/12/28-1`이 채워지고 그 번호로 같은 UUID를 회수한다.

채번 호출 제거 뮤테이션:

```java
// 원문
return repository.save(settlement.confirm(numberService.next(settlement.getSettlementDate())));
// probe
return repository.save(settlement);
```

동일 왕복 IT 결과:

```text
expected: "2099/12/28-1"
actual:   null
SalesCommissionSettlementNumberSequenceIT.java:66
1 test completed, 1 failed
BUILD FAILED in 36s
```

즉 번호 기대 단언이 실제 채번 호출 제거를 잡아 RED가 된다. probe 제거 뒤 production 파일 SHA-256
`6CEB7820A5FFBD94572E3E08D8C44DCB3120F2F24C8475859DF59EE6AD290978` 복원을 확인했다.

## 4. Flyway V97 판정

- 로컬 `origin/main`과 GitHub `main`은 모두
  `a361ed66cb5a5a2d1009b95c8236bc92652c878e`였다.
- `git ls-tree -r origin/main -- services/accounting-service/src/main/resources/db/migration` 직접 집계:
  70개, 최대 `V96`, 중복 버전 0개.
- 저장소 설정에서 Flyway out-of-order 활성화는 찾지 못했다(기본값 false).
- 열린 PR 9개의 GitHub head tree를 전수 비교했다:
  `#1166`, `#1165`, `#1164`, `#1162`, `#1158`, `#1132`, `#1131`, `#1128`, `#1125`.
  어느 head에도 `origin/main` 대비 신규 accounting migration이 없었다.
- 따라서 현재 미커밋 후보 `V97__add_sales_commission_settlement.sql`은 번호 충돌이 없다.
- 실제 PostgreSQL에서 Flyway V1~V97 적용 및 Hibernate `ddl-auto=validate`가 완료된 S1/기존 IT가
  skip 없이 통과했다.

## 5. 좁힌 accounting 회귀 실행

LUNA의 전체 suite timeout을 PASS로 승격하지 않았다. 대신 다음을 새로 실행했다.

| 범위 | 결과 |
|---|---:|
| `domain.*`, `service.*`, `migration.*`, `repository.*` | 83 classes / 679 tests / 실패 0 / error 0 / skip 10 |
| 나머지 비-IT 패키지(`audit`, `client`, `collab`, `config`, `editrequest`, `report`, `util`, `vendor`, `web`) | 48 classes / 439 tests / 실패 0 / error 0 / skip 0 |
| 기존+신규 PostgreSQL IT (`ApplicationContextLoadIT`, `AccountingNumberServiceIT`, `CollectionPlanNumberSequenceIT`, 신규 sequence IT) | 4 classes / 8 tests / 실패 0 / error 0 / skip 0 |
| 원복 후 S1 지정 4 classes 최종 재실행 | 8 tests / 실패 0 / error 0 / skip 0 / 34s |

비-IT 합계는 1,118 tests, 실패/error 0, 기존 skip 10이다. 전체 accounting suite는 끝까지
실행하지 않았으므로 전체 PASS라고 판정하지 않는다.

### 실행하지 않은 기존 PostgreSQL IT 82개

`AbstractPostgresIT`는 추상 fixture라 목록에서 제외했다.

```text
AccountingAdminQueryControllerIT, AccountingAuditLogServiceMultiInstanceIT,
AccountingDocumentSearchWildcardIT, AccountingDynamicPermissionIT,
AccountingInternalJournalControllerIT, AccountingMig8OrderInternalControllerIT,
AccountingPartnerCodeWildcardIT, AccountingPermissionControllerIT, AccountingRealtimeIT,
AccountingSlipMultipleBagFetchRegressionIT, AccountStatementControllerIT,
BankDepositorPartnerMappingControllerIT, BankDepositorPartnerMappingMigrationIT,
BankDepositorPartnerMappingPermissionEnforcementIT, BankDepositReceiptIT,
BankTransactionControllerIT, BankTransactionPermissionEnforcementIT, CashReceiptControllerIT,
ChartOfAccountSeedIT, CodefAccountSelectionIT, CodefConnectionControllerIT,
CodefConnectionRepositoryIT, CodefConnectionServiceIT, CodefImportControllerIT,
collab/CashReceiptCoeditIT, collab/JournalCollabIT, CollectionPlanControllerIT,
CollectionPlanNumberMigrationIT, DailyClosingIT, DailyClosingRevalidationIT,
DepositMatchShellIT, EcountImportControllerIT, EcountMig10OrderEmployeeBackfillControllerIT,
EcountMig11LedgerImportControllerIT, EcountMig4ImportControllerIT,
EcountMig5AccountingImportControllerIT, EcountMig6AccountingImportControllerIT,
EcountMig7CashTransformControllerIT, EcountMig8OrderTransformControllerIT,
EcountMig9CashJournalControllerIT, EcountReimportControllerIT,
EcountVoucherImportControllerIT, FundsFlowComparisonControllerIT, FundsStatusControllerIT,
HometaxExportPreviewIT, JournalApprovalGateIT, JournalCashReceiptIdBackfillIT,
JournalControllerIT, JournalStatusReportControllerIT, LedgerControllerIT,
LedgerSnapshotPersistenceIT, Mig11LedgerPartnerCodeWidthImportIT, Mig9CashJournalLinkIT,
MonthEndCloseControllerIT, MonthlyIncomeStatementControllerIT, NotesReceivableControllerIT,
P04ValidationIT, PartnerCodeWidthMigrationIT, PartnerCodeWidthUpgradeIT,
Phase9VendorIntegrationIT, PurchaseAccountingSlipConcurrencyIT,
PurchaseAccountingSlipControllerIT, ReceivablesPayablesControllerIT,
ReceivablesPermissionEnforcementIT, ReportValidationSeedIT,
SalesAccountingSlipConcurrencyIT, SalesAccountingSlipControllerIT, SliceBValidationIT,
SliceCValidationIT, SupplierProfileControllerIT, SupplierProfileFEMatchIT,
TaxInvoiceBatchEndToEndIT, TaxInvoiceBatchFromSalesSlipsIT, TaxInvoiceBatchIT,
TaxInvoiceControllerIT, TaxInvoiceEmitNtsIT, TaxInvoiceInboundControllerIT,
TaxInvoiceLineSoftDeleteIT, TaxInvoiceP04IT, TaxInvoicePartnerChangeAuditIT,
TrialBalanceControllerIT, UserCodefImportScopeMigrationIT
```

## 6. 설계 판정

### settlementDate와 확정 번호

S1 aggregate에는 `settlementDate` setter나 변경 domain method가 없고 생성자에서만 대입된다.
`confirm`도 DRAFT에서 한 번만 허용한다. 따라서 현재 지원 계약에서는 기준일이 번호 발급 뒤 바뀌지
않고, 이미 결재 참조에 붙은 번호도 따라 바뀌지 않는다. DRAFT 날짜 정정도 현재는 새 DRAFT 재생성만
가능하다. 후속 슬라이스가 날짜 편집을 추가한다면 DRAFT만 변경 가능하고 CONFIRMED는 거부한다는
불변식을 별도 RED로 먼저 고정해야 한다.

### 40자 계산

- 고정부 `yyyy/MM/dd-`: 11자.
- `last_seq`/`next()`는 signed Java/PostgreSQL `INTEGER`: 정상 발급 최대
  `2,147,483,647`(10자리)/일.
- 구현상 최장 번호: 11 + 10 = **21자**.
- `ApprovalAttachment.ref_doc_no VARCHAR(40)` 대비 19자 여유가 있다.
- 1일 2,147,483,647건 미만이라는 운영 가정이면 길이 제한보다 integer 상한이 먼저 온다. 다음 1건은
  int overflow 후 `last_seq >= 0` DB CHECK에서 롤백된다. 현실 처리량과 비교하면 충분하지만, 이 상한
  자체를 바꿀 때는 `BIGINT`와 Java `long`을 함께 바꿔야 한다.

### 저장소 컨벤션

- 두 entity 모두 `BaseEntity` 상속.
- V97 두 테이블 모두 7 audit field와 `is_deleted`를 갖는다.
- 두 entity 모두 `@SQLRestriction("is_deleted = false")`; production hard delete 호출 없음.
- 공개 class/method에 한국어 Javadoc 존재.
- Lombok `@Getter`만 사용하며 직접 setter 없음. `createDraft`, `confirm`, `create`, `next` domain method로
  상태를 변경하고 `confirm`은 현재 aggregate를 반환해 chain을 지킨다.

## 7. 이번 판정의 경계

- S2 요율 계약·계산기, S3 그룹웨어 연결, S4 화면·버튼은 검토하지 않았다.
- 공유 DB에는 write하지 않았다. 모든 DB write probe는 Testcontainers PostgreSQL에서만 수행했다.
- 전체 accounting suite와 위 82개 기존 IT의 완주 결과는 이 라운드가 보증하지 않는다.
- LUNA가 SOL-S1-01의 RED-A/RED-B와 최소 수정을 제출하면 S1 재검토가 필요하다.
