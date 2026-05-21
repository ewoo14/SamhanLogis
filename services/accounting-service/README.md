# accounting-service

## Ecount MIG-4 Importers

MIG-4는 이카운트 영업·세무 raw 4종을 `staging`에 멱등 적재하고 필요한 범위만 도메인으로 보강한다.

| Importer | Endpoint | 처리 |
|---|---|---|
| `EcountTaxInvoiceImporter` | `POST /admin/accounting/tax-invoices/imports/ecount` | 세금계산서용 판매전표 → `TaxInvoice` OUTBOUND `MIGRATED` + `TaxInvoiceLine` |
| `EcountSalesSlipLineImporter` | `POST /admin/accounting/sales-slips/imports/ecount-line` | 판매전표 → `SalesAccountingSlipLine` 보강, 미존재 전표는 신규 `POSTED` 생성 |
| `EcountSalesPurchaseSummaryImporter` | `POST /admin/accounting/sales-purchase-summary/imports/ecount` | 매출매입내역 staging only + 일별 매출 합계 검증 |
| `EcountOrderImporter` | `POST /admin/accounting/orders/imports/ecount` | 주문서 staging only + 완료 주문서의 매출전표 연결 검증 |

공통 규칙은 MIG-3와 동일하다: `EcountCsvSupport` BOM strip, `데이터관리>` meta row, strict header, trailing empty column 1개 허용, SHA-256 `source_file_hash`, `(source_file_hash, source_row_no)` staging PK, `REQUIRES_NEW + READ_COMMITTED`, `pg_advisory_xact_lock`.

## Ecount MIG-5 Importers

MIG-5는 이카운트 입출금성 raw 2종을 accounting-service staging에 보존하고 Partner aging cross-check 근거를 남긴다.

| Importer | Endpoint | 처리 |
|---|---|---|
| `EcountExpenseVoucherImporter` | `POST /admin/accounting/expense-vouchers/imports/ecount` | 지출결의서 staging only + 미지급 Partner aging 검증 |
| `EcountDepositReportImporter` | `POST /admin/accounting/deposit-reports/imports/ecount` | 입금보고서 staging only + 미수 Partner aging 검증 |

CashDisbursement/CashReceipt 도메인 변환은 MIG-7에서 담당한다.

## Ecount MIG-6 Importers

MIG-6는 잔여 마스터 중 accounting-service 소유 2종을 staging과 도메인 테이블로 이관한다.

| Importer | Endpoint | 처리 |
|---|---|---|
| `EcountBankAccountImporter` | `POST /admin/accounting/bank-accounts/imports/ecount` | 통장계좌 → `bank_accounts` (`chart_account_code`, 외화 여부, 사용 여부 포함) |
| `EcountFixedAssetTypeImporter` | `POST /admin/accounting/fixed-asset-types/imports/ecount` | 고정자산유형 → `fixed_asset_types` |

공통 규칙은 MIG-5와 동일하다: SHA-256 `source_file_hash`, 1-base `source_row_no`, `REQUIRES_NEW + READ_COMMITTED`, importer별 `pg_advisory_xact_lock`, soft-delete CTE 복구, header mismatch 422.

## Ecount MIG-7 Cash Transforms

MIG-7는 MIG-5 staging에 적재된 지출결의서/입금보고서를 Cash 도메인으로 변환한다. CSV multipart upload는 없고, staging batch trigger endpoint만 제공한다.

| Transform | Endpoint | 처리 |
|---|---|---|
| `Mig7CashDisbursementTransformService` | `POST /admin/accounting/cash-disbursements/transform-from-staging` | `staging.ecount_expense_voucher_raw` → `cash_disbursements` (`EXPENSE_VOUCHER`) |
| `Mig7CashReceiptTransformService` | `POST /admin/accounting/cash-receipts/transform-from-staging` | `staging.ecount_deposit_report_raw` → `cash_receipts` (`DEPOSIT_REPORT`) |

공통 규칙: `transform_status='PENDING'`, `external_ref = source_file_hash + '-' + source_row_no`, `REQUIRES_NEW + READ_COMMITTED`, transform별 `pg_advisory_xact_lock`, soft-delete CTE 복구, `DuplicateKeyException` row-level reject, `MIG7_*` ErrorCode 422 통일.

aging snapshot + Journal 자동 생성은 MIG-9+ 후속 슬라이스로 이연한다 (D-MIG-7-04 옵션 C).

## Ecount MIG-8 Order Transform

MIG-8는 MIG-4 주문서 staging에 적재된 주문 raw를 `Order`/`OrderLine` 도메인으로 변환한다. CSV multipart upload는 없고, staging batch trigger endpoint만 제공한다.

| Transform | Endpoint | 처리 |
|---|---|---|
| `Mig8OrderTransformService` | `POST /admin/accounting/orders/transform-from-staging` | `staging.ecount_order_raw` → `orders` + `order_lines` |

공통 규칙: `transform_status='PENDING'`, 동일 `order_no` grouping, `external_ref = source_file_hash + '-' + source_row_no`, `REQUIRES_NEW + READ_COMMITTED`, `pg_advisory_xact_lock`, Order/OrderLine soft-delete CTE 복구, `DuplicateKeyException` row-level reject, `MIG8_*` ErrorCode 422 통일.

`progress_status='완료'` 주문은 `SalesAccountingSlip.slip_no` cross-link를 시도한다. 매칭 실패는 reject가 아니라 `MIG8_SLIP_LINK_MISS` warning sample로 응답한다.

## Ecount MIG-9 Cash Journal + Aging Snapshot

MIG-9는 MIG-7 Cash 도메인의 `journal_id IS NULL` row를 회계 Journal로 자동 생성하고, Partner aging 조회용 materialized view를 추가한다.

| 기능 | Endpoint | 처리 |
|---|---|---|
| 지출 Journal 생성 | `POST /admin/accounting/cash-journals/generate-from-disbursements` | CashDisbursement → POSTED Journal + JournalLine 2건 |
| 입금 Journal 생성 | `POST /admin/accounting/cash-journals/generate-from-receipts` | CashReceipt → POSTED Journal + JournalLine 2건 |
| Aging snapshot refresh | `POST /admin/accounting/aging-snapshot/refresh` | `REFRESH MATERIALIZED VIEW CONCURRENTLY partner_aging_snapshot` |

공통 규칙: `REQUIRES_NEW + READ_COMMITTED`, `pg_advisory_xact_lock` 1 namespace, `journals(source_type, source_ref)` unique 멱등 키, `journal_no = 'J-' + slip_no`, `ROLE_MASTER`/`ROLE_MANAGER`, row-level reject, `DuplicateKeyException` constraint 분기.

기본 계정 lookup은 `ChartOfAccount.name` 기준으로 지출=`지급수수료`, 현금=`보통예금`, 매출채권=`외상매출금`을 사용한다. lookup miss는 `MIG9_DEFAULT_ACCOUNT_MISSING`, 0 이하 금액은 `MIG9_CASH_AMOUNT_INVALID`, source 중복은 `MIG9_JOURNAL_DUPLICATE`로 422 응답한다.

## Ecount MIG-10 Order Employee Cross-link + Aging Net

MIG-10은 MIG-8 Order의 `manager_name` snapshot을 user-service Employee와 연결하고, MIG-9 `partner_aging_snapshot`에 순잔액 컬럼을 추가한다.

| 기능 | Endpoint | 처리 |
|---|---|---|
| Order 담당자 Employee 연결 | `POST /admin/accounting/orders/backfill-employee-cross-link` | `manager_name` → user-service `/internal/users/by-name?name=` exact lookup 후 `manager_employee_id` backfill |
| Aging snapshot net | Flyway V30 | `net_receivable`, `net_payable`, `net_cash` 추가 + 기존 increase-only 컬럼 유지 |

공통 규칙: `REQUIRES_NEW + READ_COMMITTED`, `pg_advisory_xact_lock`, `ROLE_MASTER`/`ROLE_MANAGER`, `manager_employee_id IS NULL` 대상만 처리, lookup miss/ambiguous는 warning sample로 응답하고 NULL을 유지한다.

service-per-DB 경계상 `employees`는 user-service 소유다. V30은 `orders.manager_employee_id` UUID와 index만 추가하고 FK는 선언하지 않는다. 참조 무결성은 user-service internal lookup을 통한 application-level 검증으로 보장한다.

## Ecount MIG-11 Sales/Purchase Ledger XLSX

MIG-11은 이카운트 출력물 `매출장.xlsx`, `매입장.xlsx`를 Apache POI로 파싱해 staging에만 적재하고 `DailyClosing` 일별 합계와 대조한다.

| Importer | Endpoint | 처리 |
|---|---|---|
| `EcountSalesLedgerImporter` | `POST /admin/accounting/sales-ledger/imports/ecount` | 매출장 XLSX → `staging.ecount_sales_ledger_raw` + `closing_kind='SALES'` DailyClosing warning |
| `EcountPurchaseLedgerImporter` | `POST /admin/accounting/purchase-ledger/imports/ecount` | 매입장 XLSX → `staging.ecount_purchase_ledger_raw` + `closing_kind='PURCHASE'` DailyClosing warning |

실제 raw는 sheet 0 row 0이 `회사명 ... / 매출장|매입장` meta row이고 row 1이 strict header다. 매입장에는 합계 컬럼이 없어 `매입공급가액 + 매입부가세`로 `total_amount`를 계산한다.

공통 규칙: Apache POI `XSSFWorkbook`, SHA-256 `source_file_hash`, source Excel row number 기반 `source_row_no`, `(source_file_hash, source_row_no)` staging PK, `REQUIRES_NEW + READ_COMMITTED`, importer별 `pg_advisory_xact_lock`, footer 정확 매칭(`합계`/`총계`) skip, DailyClosing 불일치는 reject가 아닌 warning sample.

## Ecount MIG-14 Admin 조회 API

MIG-14는 MIG-7~11 결과를 desktop admin UI에서 조회하기 위한 read endpoint를 추가한다. Import/transform endpoint가 아니라 운영 조회용 API이며, DTO에는 내부 UUID를 노출하지 않는다.

| 화면군 | Endpoint | 응답 식별자 |
|---|---|---|
| Cash 지출 | `GET /api/v1/accounting/cash-disbursements` | `slipNo`, `partnerName`, `journalNo`, `kind`, `amount` |
| Cash 입금 | `GET /api/v1/accounting/cash-receipts` | `slipNo`, `partnerName`, `journalNo`, `kind`, `amount` |
| Order 목록 | `GET /api/v1/accounting/orders` | `orderNo`, `partnerName`, `managerName`, `progressStatus`, `linkedSlipNo` |
| Order 상세 | `GET /api/v1/accounting/orders/{orderNo}` | `orderNo` + `lines[]`; 내부 `orderId` path 금지 |
| Aging snapshot | `GET /api/v1/accounting/aging-snapshot?page=0&size=100&sort=net_receivable_desc` | `partnerName`, `netReceivable`, `netPayable`, `netCash`, `lastRefreshedAt`; 기본 100 / 최대 500 |
| Ledger 매출 | `GET /api/v1/accounting/ledger/sales` | staging row 업무 컬럼 + DailyClosing 대조 결과 |
| Ledger 매입 | `GET /api/v1/accounting/ledger/purchase` | staging row 업무 컬럼 + DailyClosing 대조 결과 |

권한은 auth-service V25 MIG14 PageCode 4종과 desktop `PermissionGuard`를 사용한다. `DynamicPermissionClient` 테스트 mock은 deprecated service-local 타입 대신 shared/security 통합 인터페이스를 대상으로 정렬한다.

MIG-16 이후 Cash 조회의 `partnerName` 표시는 partner-service batch lookup으로 해결하며, aging snapshot은 Spring `Page` 응답을 반환한다.
