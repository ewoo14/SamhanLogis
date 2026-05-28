# 이카운트 마이그레이션 import 화면 — PageCode 인벤토리 (Phase 0 audit)

> 2026-05-28 read-only audit. [README](./README.md) §audit 컬럼 기준 7 action 판정.
> 대상: 이카운트 마이그레이션(MIG-2 ~ MIG-21) import/transform endpoint + MIG-14 admin 조회 화면 + MIG-21 운영 대시보드.

## 핵심 성격 구분 (먼저 읽을 것)

이 그룹의 PageCode 대부분은 **운영자/cron 트리거형 admin IMPORT·TRANSFORM endpoint** 로, 전용 FE 업로드 화면이 없다.
모두 단일 `POST` (CSV/XLSX 적재 또는 staging→도메인 변환) 이며 `@RequirePermission(action="EDIT")` + `DynamicPermissionClient` 동적 가드로 보호된다.
표준 CRUD 페이지가 아니므로 VIEW/UPDATE/DELETE/RESTORE/DOWNLOAD/PRINT 는 대부분 부재가 정상이다.

- **순수 IMPORT/TRANSFORM (FE 화면 X, CREATE-only)**: `ecount.mig2.*`, `ecount.mig3.*`, `ecount.mig4.*`, `ecount.mig5.*`, `ecount.mig6.*`, `ecount.mig7.*`, `ecount.mig8.*`, `ecount.mig9.*`, `ecount.mig10.*`, `ecount.mig11.*`, `ecount.reimport` — POST 1개씩, FE route 없음. 이카운트 import 의미상 POST = "적재/변환" 이므로 본 audit 은 이를 **CREATE** 로 표기 (BE 가드는 EDIT action 사용).
- **실 admin VIEW 화면 (FE route + GET)**: `ecount.mig14.cash-list`, `ecount.mig14.order-list`, `ecount.mig14.aging-snapshot`, `ecount.mig14.ledger`, `ecount.mig.ops-dashboard` — `clients/desktop/src/renderer/routes/index.tsx` 에 `<PermissionGuard ... action="view">` route 존재. 이카운트 raw 의 우리 DB parity 조회용 읽기 화면.

### action 매핑 주의 (BE EDIT vs 인벤토리 CREATE)

import/transform endpoint 은 BE 에서 `action="EDIT"` 로 가드되지만 신규 데이터 적재(POST)가 본질이므로 본 audit 표에서는 **CREATE ✅** 로 기록하고 비고에 "(BE EDIT 가드)" 를 명시한다. 새 권한 체계 설계 시 IMPORT 류를 CREATE 로 정규화할지 EDIT 로 둘지 PM 결정 필요.

### PageCode 정의 vs 실제 가드 불일치 (중요 결함)

`ecount.mig2.product` / `ecount.mig2.warehouse` 는 `auth-service` `PageCode.java` (L483/L492) + seed SQL (`V15`/`V31`/`V32`) 에 **정의·시드되어 있으나, 실제 import endpoint 는 다른 PageCode 로 가드** 한다:
- 품목 import → `products.ecount-import` (`product-service` `EcountProductImportController#upload`)
- 창고 import → `ecount.import.inventory` (`inventory-service` `EcountWarehouseImportController#upload`)

즉 `ecount.mig2.product` / `ecount.mig2.warehouse` PageCode 를 enforce 하는 endpoint 가 **존재하지 않는다** (orphan PageCode). 새 체계에서 정리 대상.
(부서 import 만 `ecount.mig2.department` PageCode 를 실제 사용 — `user-service` `EcountDepartmentImportController#upload`.)

---

## 인벤토리 표

| PageCode | 프로그램 | VIEW | CREATE | UPDATE | DELETE | RESTORE | DOWNLOAD | PRINT |
|---|---|---|---|---|---|---|---|---|
| ecount.mig2.product | 품목 import | ❌ 없음 | ⚠️ orphan — endpoint 는 `products.ecount-import` 로 가드 (`product-service EcountProductImportController#upload`), 이 PageCode 미사용 | ❌ | ❌ | ❌ | ❌ | ❌ |
| ecount.mig2.account | 계정상세내역 import | ❌ | ✅ POST `/admin/accounts/imports/ecount` (`EcountAccountImportController#upload`, BE EDIT 가드) | ❌ | ❌ | ❌ | ❌ | ❌ |
| ecount.mig2.department | 부서 import | ❌ | ✅ POST `/admin/departments/imports/ecount` (`user-service EcountDepartmentImportController#upload`, BE EDIT) | ❌ | ❌ | ❌ | ❌ | ❌ |
| ecount.mig2.warehouse | 창고 import | ❌ 없음 | ⚠️ orphan — endpoint 는 `ecount.import.inventory` 로 가드 (`inventory-service EcountWarehouseImportController#upload`), 이 PageCode 미사용 | ❌ | ❌ | ❌ | ❌ | ❌ |
| ecount.mig2.card | 통장계좌/카드 import | ❌ | ✅ POST `/admin/cards/imports/ecount` (`EcountCardImportController#upload`, BE EDIT) | ❌ | ❌ | ❌ | ❌ | ❌ |
| ecount.mig3.purchase-slip | 매입전표 import | ❌ | ✅ POST `/admin/accounting/purchase-slips/imports/ecount` (`EcountPurchaseSlipImportController#upload`, BE EDIT + 동적가드) | ❌ | ❌ | ❌ | ❌ | ❌ |
| ecount.mig3.sales-slip | 매출전표 import | ❌ | ✅ POST `/admin/accounting/sales-slips/imports/ecount` (`EcountSalesSlipImportController#upload`, BE EDIT) | ❌ | ❌ | ❌ | ❌ | ❌ |
| ecount.mig3.general-voucher | 일반전표 import | ❌ | ✅ POST `/admin/accounting/general-vouchers/imports/ecount` (`EcountGeneralVoucherImportController#upload`, BE EDIT) | ❌ | ❌ | ❌ | ❌ | ❌ |
| ecount.mig3.journal-entry | 회계전표분개 import | ❌ | ✅ POST `/admin/accounting/journal-entries/imports/ecount` (`EcountJournalEntryImportController#upload`, BE EDIT) | ❌ | ❌ | ❌ | ❌ | ❌ |
| ecount.mig4.tax-invoice | 세금계산서용 판매전표 import | ❌ | ✅ POST `/admin/accounting/tax-invoices/imports/ecount` (`EcountTaxInvoiceImportController#upload`, BE EDIT) | ❌ | ❌ | ❌ | ❌ | ❌ |
| ecount.mig4.sales-slip-line | 판매전표 라인 보강 import | ❌ | ✅ POST `/admin/accounting/sales-slips/imports/ecount-line` (`EcountSalesSlipLineImportController#upload`, BE EDIT) | ❌ | ❌ | ❌ | ❌ | ❌ |
| ecount.mig4.summary | 매출매입내역 import | ❌ | ✅ POST `/admin/accounting/sales-purchase-summary/imports/ecount` (`EcountSalesPurchaseSummaryImportController#upload`, BE EDIT) | ❌ | ❌ | ❌ | ❌ | ❌ |
| ecount.mig4.order | 주문서 staging import | ❌ | ✅ POST `/admin/accounting/orders/imports/ecount` (`EcountOrderImportController#upload`, BE EDIT) | ❌ | ❌ | ❌ | ❌ | ❌ |
| ecount.mig5.stock-transfer | 재고이동 import | ❌ 없음 | ❌ accounting-service 에 해당 컨트롤러/endpoint 부재 (재고이동은 inventory-service 영역, 본 PageCode 로 가드된 endpoint 미발견) | ❌ | ❌ | ❌ | ❌ | ❌ |
| ecount.mig5.expense-voucher | 지출결의서 import | ❌ | ✅ POST `/admin/accounting/expense-vouchers/imports/ecount` (`EcountExpenseVoucherImportController#upload`, BE EDIT) | ❌ | ❌ | ❌ | ❌ | ❌ |
| ecount.mig5.deposit-report | 입금보고서 import | ❌ | ✅ POST `/admin/accounting/deposit-reports/imports/ecount` (`EcountDepositReportImportController#upload`, BE EDIT) | ❌ | ❌ | ❌ | ❌ | ❌ |
| ecount.mig6.bank-account | 통장계좌 import (MIG-6) | ❌ | ✅ POST `/admin/accounting/bank-accounts/imports/ecount` (`EcountBankAccountImportController#upload`, BE EDIT) | ❌ | ❌ | ❌ | ❌ | ❌ |
| ecount.mig6.employee | 사원 import | ❌ | ✅ POST `/admin/user/employees/imports/ecount` (`user-service EcountEmployeeImportController#upload`, BE EDIT, 동적가드 없음) | ❌ | ❌ | ❌ | ❌ | ❌ |
| ecount.mig6.employee-card | 인사카드 import | ❌ | ✅ POST `/admin/user/employee-cards/imports/ecount` (`user-service EcountEmployeeCardImportController#upload`, BE EDIT) | ❌ | ❌ | ❌ | ❌ | ❌ |
| ecount.mig6.payroll-employee | 급여관리사원 import | ❌ | ✅ POST `/admin/user/payroll-employees/imports/ecount` (`user-service EcountPayrollEmployeeImportController#upload`, BE EDIT) | ❌ | ❌ | ❌ | ❌ | ❌ |
| ecount.mig6.fixed-asset-type | 고정자산유형 import | ❌ | ✅ POST `/admin/accounting/fixed-asset-types/imports/ecount` (`EcountFixedAssetTypeImportController#upload`, BE EDIT) | ❌ | ❌ | ❌ | ❌ | ❌ |
| ecount.mig7.cash-disbursement | 지출결의서 staging→CashDisbursement 변환 | ❌ | ✅ POST `/admin/accounting/cash-disbursements/transform-from-staging` (`Mig7CashDisbursementTransformController#transform`, BE EDIT) | ❌ | ❌ | ❌ | ❌ | ❌ |
| ecount.mig7.cash-receipt | 입금보고서 staging→CashReceipt 변환 | ❌ | ✅ POST `/admin/accounting/cash-receipts/transform-from-staging` (`Mig7CashReceiptTransformController#transform`, BE EDIT) | ❌ | ❌ | ❌ | ❌ | ❌ |
| ecount.mig8.order | 주문서 staging→Order 변환 | ❌ | ✅ POST `/admin/accounting/orders/transform-from-staging` (`Mig8OrderTransformController#transform`, BE EDIT) | ❌ | ❌ | ❌ | ❌ | ❌ |
| ecount.mig9.cash-journal.disbursement | CashDisbursement→Journal 자동생성 | ❌ | ✅ POST `/admin/accounting/cash-journals/generate-from-disbursements` (`Mig9CashJournalController#generateFromDisbursements`, BE EDIT) | ❌ | ❌ | ❌ | ❌ | ❌ |
| ecount.mig9.cash-journal.receipt | CashReceipt→Journal 자동생성 | ❌ | ✅ POST `/admin/accounting/cash-journals/generate-from-receipts` (`Mig9CashJournalController#generateFromReceipts`, BE EDIT) | ❌ | ❌ | ❌ | ❌ | ❌ |
| ecount.mig10.order-employee-backfill | Order 담당자 Employee 연결 backfill | ❌ | ✅ POST `/admin/accounting/orders/backfill-employee-cross-link` (`Mig10OrderEmployeeBackfillController#backfill`, BE EDIT) | ❌ | ❌ | ❌ | ❌ | ❌ |
| ecount.mig11.sales-ledger | 매출장 XLSX import + DailyClosing 대조 | ❌ | ✅ POST `/admin/accounting/sales-ledger/imports/ecount` (`Mig11SalesLedgerImportController#upload`, BE EDIT) | ❌ | ❌ | ❌ | ❌ | ❌ |
| ecount.mig11.purchase-ledger | 매입장 XLSX import + DailyClosing 대조 | ❌ | ✅ POST `/admin/accounting/purchase-ledger/imports/ecount` (`Mig11PurchaseLedgerImportController#upload`, BE EDIT) | ❌ | ❌ | ❌ | ❌ | ❌ |
| ecount.mig14.cash-list | (admin VIEW) 지출결의서·입금보고서 목록 | ✅ GET `/api/v1/accounting/cash-disbursements`+`/cash-receipts` (`AccountingAdminQueryController#cashDisbursements`/`#cashReceipts`, action=VIEW) + FE route `/accounting/admin/cash-disbursements`·`/cash-receipts` (`index.tsx` L1118/1128, `CashDisbursementListPage`·`CashReceiptListPage`) | ❌ 변환은 별도 mig7/mig9 PageCode | ❌ | ❌ | ❌ | ❌ 화면에 export 없음 | ❌ |
| ecount.mig14.order-list | (admin VIEW) 주문서 목록·상세 | ✅ GET `/api/v1/accounting/orders`+`/orders/{orderNo}` (`AccountingAdminQueryController#orders`/`#orderDetail`, VIEW) + FE route `/accounting/admin/orders[/:orderNo]` (`index.tsx` L1138/1148, `OrderListPage`·`OrderDetailPage`) | ❌ | ❌ | ❌ | ❌ | ❌ export 없음 | ❌ |
| ecount.mig14.aging-snapshot | (admin VIEW+갱신) 거래처 잔액 스냅샷 | ✅ GET `/api/v1/accounting/aging-snapshot` (`AccountingAdminQueryController#agingSnapshot`, VIEW) + FE route `/accounting/admin/aging-snapshot` (`index.tsx` L1158, `PartnerAgingSnapshotPage`) | ⚠️ "스냅샷 새로고침" — POST `/admin/accounting/aging-snapshot/refresh` (`Mig9CashJournalController#refreshAgingSnapshot`, BE EDIT), FE `PartnerAgingSnapshotPage` action="edit" 가드 버튼. MATERIALIZED VIEW refresh = regenerate, 신규 row 생성 아님 → CREATE 인지 UPDATE 인지 모호 | ⚠️ refresh = view 재계산 (위 CREATE 셀과 동일 endpoint) | ❌ | ❌ | ❌ export 없음 | ❌ |
| ecount.mig14.ledger | (admin VIEW) 매출장·매입장 staging 조회 | ✅ GET `/api/v1/accounting/ledger/sales`+`/ledger/purchase` (`AccountingAdminQueryController#salesLedger`/`#purchaseLedger`, VIEW) + FE route `/accounting/admin/ledger/sales`·`/ledger/purchase` (`index.tsx` L1168/1178, `SalesLedgerPage`·`PurchaseLedgerPage`) | ❌ import 는 mig11 PageCode | ❌ | ❌ | ❌ | ❌ export 없음 | ❌ |
| ecount.reimport | 이카운트 raw slice 재import trigger (MIG-20) | ❌ FE route 없음 (cron/operator 트리거) | ✅ POST `/admin/ecount/reimport/{slice}` (`EcountReimportController#reimport`, BE EDIT, 동적가드 canEdit 단독) | ❌ | ❌ | ❌ | ❌ | ❌ |
| ecount.mig.ops-dashboard | (admin VIEW) 이카운트 마이그레이션 운영 대시보드 (MIG-21) | ✅ GET `/dashboard/ecount-mig` (`dashboard-service DashboardMigrationOpsController#ecountMigOps`, VIEW) + FE route `/accounting/admin/migration-ops` (`index.tsx` L1188, `MigOpsDashboardPage`) | ❌ 읽기 전용 메트릭 (reimport 이력 카드 포함, action 없음) | ❌ | ❌ | ❌ | ❌ export 없음 | ❌ |

범례: ✅ 구현 / ❌ 없음 / ⚠️ 부분·불일치. CREATE 셀의 "(BE EDIT)" = endpoint 는 POST 이나 `@RequirePermission(action="EDIT")` 로 가드됨.

---

## 신규 구현 필요 집계

본 그룹은 **이카운트 raw → 우리 DB parity 적재** 가 목적인 일회성/주기성 admin 도구라, 일반 CRUD 페이지의 7 action 완비가 설계 의도가 **아니다**. 따라서 대부분의 ❌ 는 "신규 구현 필요" 가 아니라 "성격상 불요" 다. 실제 조치가 필요한 항목만 분리한다.

### A. 권한 정의/가드 불일치 정리 (구현 아닌 정합성 결함 — 우선 처리)

1. **`ecount.mig2.product` orphan** — PageCode·seed 정의는 있으나 enforce 하는 endpoint 없음. 실제 가드는 `products.ecount-import`. → 새 체계에서 `ecount.mig2.product` 제거하거나 `products.ecount-import` 를 이 코드로 통일.
2. **`ecount.mig2.warehouse` orphan** — 동일. 실제 가드는 `ecount.import.inventory`. → 정리 필요.
3. **`ecount.mig5.stock-transfer`** — accounting-service 에 해당 import/transform endpoint 미발견. PageCode 만 존재(요구 목록)하고 구현 부재 → 구현 누락 여부 확인 필요 (재고이동은 inventory-service 영역일 수 있음).
4. **action 어휘 정규화** — IMPORT/TRANSFORM POST 가 전부 `EDIT` 로 가드됨. 새 7-action 체계에서 import 류를 `CREATE` 로 매핑할지 PM 결정 필요 (현재 표는 CREATE 로 분류, BE 는 EDIT).
5. **mig6 employee 3종 동적가드 부재** — `user-service` 의 employee/employee-card/payroll-employee import 는 `@RequirePermission(EDIT)` 만 있고 `DynamicPermissionClient` 런타임 가드 없음 (accounting-service MIG-3~11 패턴과 불일치). 동적 권한 미적용.

### B. 신규 action 구현 후보 (필요 시점에만, 현재는 모두 미구현)

| action | 대상 | 비고 |
|---|---|---|
| RESTORE | 전 PageCode | ❌ 전무. 버전이력/롤백 화면 없음 — import 결과 되돌리기는 reimport(`ecount.reimport`) 로 재적재하는 운영 방식으로 갈음. 정식 RESTORE 요구 없음. |
| DOWNLOAD | mig14.* 4 화면 + ops-dashboard | ❌ 전무. 조회 결과 Excel/CSV export 미구현. parity 조회 화면이므로 운영상 다운로드 수요 있을 수 있음 → 후보. |
| PRINT | 전 PageCode | ❌ 전무. import/admin 조회 도구라 인쇄 view 불요. |
| UPDATE/DELETE | 전 PageCode | ❌ 전무. import 데이터 개별 수정/삭제 UI 없음 (재import 로 갱신). 정식 요구 없음. |

### C. 순수 IMPORT vs 실 VIEW 화면 분류 (요약)

- **순수 import/transform (FE 화면 없음, CREATE-only)**: mig2.account, mig2.department, mig2.card, mig3.* (4), mig4.* (4), mig5.expense-voucher, mig5.deposit-report, mig6.* (4), mig7.* (2), mig8.order, mig9.* (2), mig10.order-employee-backfill, mig11.* (2), ecount.reimport — **23 PageCode**. (+ orphan/누락 3: mig2.product, mig2.warehouse, mig5.stock-transfer)
- **실 admin VIEW 화면 (FE route + GET)**: mig14.cash-list, mig14.order-list, mig14.aging-snapshot, mig14.ledger, mig.ops-dashboard — **5 PageCode**. 이 중 `mig14.aging-snapshot` 만 VIEW + 갱신(refresh, EDIT) 의 2 action 보유.
