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

aging snapshot + Journal 자동 생성은 MIG-8 후속 슬라이스로 이연한다 (D-MIG-7-04 옵션 C).
