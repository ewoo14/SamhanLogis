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

cash disbursement/receipt 도메인 신설은 후속 슬라이스로 둔다.
