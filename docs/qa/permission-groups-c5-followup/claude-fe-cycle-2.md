# FE 리뷰어 — 권한그룹 C5 후속 정리 사이클 2 (Claude)

PR: #417 `fix/permission-groups-c5-followup-cleanup`
리뷰어: Claude FE agent
head: `e96861c4`
diff 범위: `git diff 8c3ff6e4...e96861c4 -- clients`
날짜: 2026-06-07
기준: 사이클1 지적(FE-1~4, D-CX-001/002, P1-일원화) 해소 전수 검증 + 신규 결함 발굴

---

## 판정: CHANGES REQUESTED

신규 결함 D2-FE-001(P2) 1건 발견. 사이클1 P1 지적 전원 해소 확인.

---

## 1. 사이클1 지적사항 해소 전수 검증

### FE-1 / C-1 (P1) — `/admin/accounting-edit-requests` accounting.edit-requests.decide:VIEW 단일 수렴

판정: **완전 해소**

- 라우트 `routes/index.tsx:1338`: `<PermissionGuard pageCode="accounting.edit-requests.decide" action="view">` ✅
- 사이드바 `AppLayout.tsx:219`: `const showAccountingEditRequests = dynamicCanAccess('accounting.edit-requests.decide', 'view')` ✅
- Mock `mock.ts`: MANAGER DEFAULT_VIEW + EDIT 양쪽에 `'accounting.edit-requests', 'accounting.edit-requests.decide'` 포함 ✅
- Mock `SP_D1_PAGES` 에 `'accounting.edit-requests.decide'` 추가 ✅
- BE `AccountingEditRequestController.java:118`: `@RequirePermission(page = "accounting.edit-requests.decide", action = VIEW)` — GET /accounting/edit-requests?targetRole=MANAGER 완전 정합 ✅
- ACCOUNTANT DEFAULT_VIEW 에서 `'accounting.edit-requests.decide'` 미포함 → ACCOUNTANT FE 진입 후 BE 403 위험 제거 ✅

### FE-2 / C-2 (P1) — `/accounting/tax-invoices` accounting.tax-invoice.list:VIEW 정렬

판정: **완전 해소**

- 사이드바 `AppLayout.tsx:210`: `const showAccountingTaxInvoice = dynamicCanAccess('accounting.tax-invoice.list', 'view')` (구 4-code OR 제거) ✅
- 라우트 `/accounting/tax-invoices` (list): `PermissionGuard pageCode="accounting.tax-invoice.list" action="view"` ✅
- 라우트 `/accounting/tax-invoices/new`: `PermissionGuard pageCode="accounting.tax-invoice.list" action="create"` ✅
- 라우트 `/accounting/tax-invoices/:id/edit`: `PermissionGuard pageCode="accounting.tax-invoice.list" action="update"` ✅
- 라우트 `/accounting/tax-invoices/:id/print`, `/:id`: `accounting.tax-invoice.list:view` ✅
- 라우트 `/accounting/tax-invoices/batch`, `/inbound`: 별도 page-code (`batch-issue`, `inbound`) 유지 — 독립 사이드바/라우트 쌍 1:1 일치 ✅
- Mock SALES DEFAULT_VIEW 에서 `'accounting.tax-invoice.list'` 제거 ✅
- BE `TaxInvoiceController`: `TAX_INVOICE_LIST_PAGE_CODE = "accounting.tax-invoice.list"` — POST/PUT/GET 모두 정합 ✅
- `accounting.tax-invoice.emit-nts` 는 라우트 직접 가드에서 제거됨. TaxInvoiceDetailPage 내부 emit-nts 버튼 가시성은 `canAccessTaxInvoice(role)`(정적 role, ACCOUNTANT||MASTER) 로 잔류하나 이는 PRE-EXISTING 페이지 내부 로직이며 이 PR diff 의 범위 외임 (라우트 가드 + 사이드바 정합이 핵심 수정 대상). 후속 슬라이스 대상으로 등록 권고.

### FE-3 / D-CX-002 / C-4 (P2) — 직접 링크 show 조건 라우트 1:1 축소 (4건)

판정: **완전 해소**

| 링크 | 구 show 조건 | 현재 show 조건 | 라우트 PermissionGuard |
|------|------------|--------------|----------------------|
| `/admin/partners` | `showPartnersGroup` (list+block+edit-request OR) | `showPartnerManagement = showPartnersList = dynamicCanAccess('partners.list','view')` | `partners.list:view` ✅ |
| `/admin/blocked-partners` | `showBlockedPartners = showPartnersBlock || dynamicCanAccess('partners.block.bulk','view')` | `showBlockedPartners = showPartnersBlock = dynamicCanAccess('partners.block','view')` | `partners.block:view` ✅ |
| `/admin/regions` | `showRegionMgmt = showArologisRegionPage \|\| dynamicCanAccess('arologis.region.manage','view')` | `showRegionMgmt = showArologisRegionPage = dynamicCanAccess('arologis.region','view')` | `arologis.region:view` ✅ |
| `/inventory/stock-balance` | `showInventoryWarehouse \|\| showInventoryStockTransfer` | `showInventoryStockBalance = dynamicCanAccess('inventory.stock-balance','view')` | `inventory.stock-balance:view` ✅ |

- `showPartnersGroup` 변수 완전 제거 (코드 내 comment 로만 잔류) ✅
- `_showPartnersEditRequest`: 사이드바 show= prop 에 사용되지 않음. 라우트에도 partners.edit-request 를 page-code 로 사용하는 PermissionGuard 없음. 변수는 언더스코어 prefix 로 사용 의도(page 내부 action 가드 예약)를 표시. comment가 "라우트 가드 전용" 으로 부정확한 것은 Nit → 아래 Nit-N1 참조.

### FE-4 / C-5 (P2) — full-menu-contract SLIP_CLEANUP_ROLES stale 어서션 교체

판정: **완전 해소**

```
expect(appLayout).toMatch(/const showSlipCleanup = dynamicCanAccess\('slip\.cleanup', 'view'\)/)
expect(routes).toMatch(/path: '\/sales\/slip-cleanup'[\s\S]*<PermissionGuard pageCode="slip\.cleanup" action="view">[\s\S]*<SlipCleanupPage \/>/)
expect(slipCleanup).not.toContain('SLIP_CLEANUP_ROLES')
```

위 3개 어서션 모두 현재 head 소스와 정합 ✅. testIgnore('**/full-menu-contract/**') 상태이므로 격리 해제 시에도 통과.

### D-CX-001 / C-6 (P2) — 마감 3페이지 role 기반 문구 → 권한 기반 문구

판정: **3/4 페이지 해소. 1페이지(DailyClosingPage) 미처리 → 신규 결함 D2-FE-001 참조**

SalesClosingPage / MonthEndClosingPage / PeriodCloseListPage 3개:
- `disabled title`: "마감 실행 권한 필요" ✅
- 거부 문구: "마감 실행 권한이 없습니다 — 마감 실행 권한 보유자만 가능합니다." ✅
- Javadoc `@RequirePermission` 기준 현행화 ✅
- page-code / UUID 화면 노출 없음 ✅

DailyClosingPage: 미처리 → D2-FE-001.

### P1-1 (Claude FE cycle-1) — full-menu-contract blocked-partners/aligo-address-book spec 어서션

판정: **완전 해소 (사이클1 Claude fix 에서 처리됨)**

```
expect(routes).toMatch(/path: '\/admin\/blocked-partners'[\s\S]*PermissionGuard pageCode="partners\.block" action="view"/)
expect(routes).toMatch(/path: '\/admin\/aligo-address-book'[\s\S]*PermissionGuard pageCode="aligo\.address-book" action="view"/)
```

현재 spec `full-menu-contract.spec.ts:123-124` 에 이미 PermissionGuard 어서션 포함 ✅

### P1-2 (Claude FE cycle-1) — showDispatchSms dynamicCanAccess 복원

판정: **완전 해소**

현재 head `AppLayout.tsx`:
- `const showDispatchSmsPage = dynamicCanAccess('dispatch.batch', 'view')` (L274)
- `const showDispatchSmsSendAudit = dynamicCanAccess('notification.dispatch-sms.send-audit', 'view')` (L275)
- 사이드바 `/arologis/dispatch-sms`: `show={showDispatchSmsPage}` ✅
- 사이드바 `/arologis/dispatch-sms/send-audit`: `show={showDispatchSmsSendAudit}` ✅
- 라우트: `PermissionGuard pageCode="dispatch.batch"` / `PermissionGuard pageCode="notification.dispatch-sms.send-audit"` 각각 1:1 일치 ✅

---

## 2. 사이드바 show ↔ 라우트 PermissionGuard 1:1 전수 대조표

`AppLayout.tsx` 의 모든 `SidebarLink` / `NavLink(조건부)` 와 `routes/index.tsx` 의 대응 가드를 대조한다.

| # | 사이드바 링크 | show 변수 | dynamicCanAccess pageCode | 라우트 PermissionGuard pageCode | 일치 |
|---|------|-----------|--------------------------|--------------------------------|------|
| 1 | `/purchases/receipt-ocr` | `showReceiptOcr` | `purchases.receipt-ocr:view` | `purchases.receipt-ocr:view` | ✅ |
| 2 | `/sales/link-dispatch` | `showDeliveryBatch` | `slip.delivery-batch:view` | `slip.delivery-batch:view` | ✅ |
| 3 | `/dispatch-board` | `showDispatchBoard` | `dispatch.board:view` | `dispatch.board:view` | ✅ |
| 4 | `/sales/estimates` | `showEstimatesList` | `estimates.list:view` | `estimates.list:view` | ✅ |
| 5 | `/sales/partner-orders` | `showPartnerOrderList` | `sales.partner-order.list:view` | `sales.partner-order.list:view` | ✅ |
| 6 | `/sales/partner-dc-config` | `showPartnerDcConfig` | `sales.partner-dc-config:view` | `sales.partner-dc-config:view` | ✅ |
| 7 | `/admin/partners` | `showPartnerManagement` | `partners.list:view` | `partners.list:view` | ✅ |
| 8 | `/sales/slip-cleanup` | `showSlipCleanup` | `slip.cleanup:view` | `slip.cleanup:view` | ✅ |
| 9 | `/sales/closing` (판매 그룹) | `showAccountingPeriodClose` | `accounting.period-close:view` | `accounting.period-close:view` | ✅ |
| 10 | `/sales/next-day-slip` | `showNextDaySlip` | `slip.print.next-day:view` | `slip.print.next-day:view` | ✅ |
| 11 | `/sales/vendor-order-upload` | `showVendorOrderOcr` | `sales.vendor-order:view` | `sales.vendor-order:view` | ✅ |
| 12 | `/admin/blocked-partners` | `showBlockedPartners` | `partners.block:view` | `partners.block:view` | ✅ |
| 13 | `/accounting/sales-slips` | `showAccountingSalesSlip` | `accounting.sales-slip.list:view` | `accounting.sales-slip.list:view` | ✅ |
| 14 | `/accounting/purchase-slips` | `showAccountingPurchaseSlip` | `accounting.purchase-slip.list:view` | `accounting.purchase-slip.list:view` | ✅ |
| 15 | `/accounting/accounts` | `showAccountingAccounts` | `accounting.accounts:view` | `accounting.accounts:view` | ✅ |
| 16 | `/accounting/journals` | `showAccountingJournals` | `accounting.journals:view` | `accounting.journals:view` | ✅ |
| 17 | `/accounting/tax-invoices` | `showAccountingTaxInvoice` | `accounting.tax-invoice.list:view` | `accounting.tax-invoice.list:view` | ✅ |
| 18 | `/accounting/tax-invoices/batch` | `showAccountingTaxInvoiceBatch` | `accounting.tax-invoice.batch-issue:view` | `accounting.tax-invoice.batch-issue:view` | ✅ |
| 19 | `/accounting/tax-invoices/inbound` | `showAccountingTaxInvoiceInbound` | `accounting.tax-invoice.inbound:view` | `accounting.tax-invoice.inbound:view` | ✅ |
| 20 | `/accounting/balances` | `showAccountingBalances` | `accounting.balances:view` | `accounting.balances:view` | ✅ |
| 21 | `/accounting/reports` (그룹 내) | `showAccountingReports` (그룹) | `accounting.reports:view` | `accounting.reports:view` | ✅ |
| 22 | `/sales/closing` (회계 그룹) | `showAccountingPeriodClose` | `accounting.period-close:view` | `accounting.period-close:view` | ✅ |
| 23 | `/accounting/period-close` | `showAccountingPeriodClose` | `accounting.period-close:view` | `accounting.period-close:view` | ✅ |
| 24 | `/accounting/statement-batch` | `showAccountingStatBatch` | `accounting.statement-batch:view` | `accounting.statement-batch:view` | ✅ |
| 25 | `/accounting/partner-ledger` | `showAccountingPartnerLedger` | `accounting.partner-ledger:view` | `accounting.partner-ledger:view` | ✅ |
| 26 | `/accounting/hometax-export` | `showAccountingPartnerLedger` | `accounting.partner-ledger:view` | `accounting.partner-ledger:view` | ✅ |
| 27 | `/accounting/supplier-profiles` | `showAccountingPartnerLedger` | `accounting.partner-ledger:view` | `accounting.partner-ledger:view` | ✅ |
| 28 | `/accounting/deposit-match` | `showAccountingDepositMatch` | `accounting.deposit-match:view` | `accounting.deposit-match:view` | ✅ |
| 29 | `/accounting/daily-closing` | `showAccountingDailyClose` | `accounting.daily-closing:view` | `accounting.daily-closing:view` | ✅ |
| 30 | `/accounting/ledgers` | `showAccountingLedger` | `accounting.general-ledger:view` | `accounting.general-ledger:view` | ✅ |
| 31 | `/accounting/admin/cash-disbursements` | `showAccountingAdminCash` | `ecount.mig14.cash-list:view` | `ecount.mig14.cash-list:view` | ✅ |
| 32 | `/accounting/admin/cash-receipts` | `showAccountingAdminCash` | `ecount.mig14.cash-list:view` | `ecount.mig14.cash-list:view` | ✅ |
| 33 | `/accounting/admin/orders` | `showAccountingAdminOrder` | `ecount.mig14.order-list:view` | `ecount.mig14.order-list:view` | ✅ |
| 34 | `/accounting/admin/aging-snapshot` | `showAccountingAdminAging` | `ecount.mig14.aging-snapshot:view` | `ecount.mig14.aging-snapshot:view` | ✅ |
| 35 | `/accounting/admin/ledger/sales` | `showAccountingAdminLedger` | `ecount.mig14.ledger:view` | `ecount.mig14.ledger:view` | ✅ |
| 36 | `/accounting/admin/ledger/purchase` | `showAccountingAdminLedger` | `ecount.mig14.ledger:view` | `ecount.mig14.ledger:view` | ✅ |
| 37 | `/accounting/admin/migration-ops` | `showAccountingAdminMigOps` | `ecount.mig.ops-dashboard:view` | `ecount.mig.ops-dashboard:view` | ✅ |
| 38 | `/admin/accounting-edit-requests` | `showAccountingEditRequests` | `accounting.edit-requests.decide:view` | `accounting.edit-requests.decide:view` | ✅ |
| 39 | `/arologis/manual` | `showArologisManual` | `arologis.dispatch.admin:view` | `arologis.dispatch.admin:view` | ✅ |
| 40 | `/arologis/pre-classify` | `showArologisOps` | `arologis.dispatch.ops:view` | `arologis.dispatch.ops:view` | ✅ |
| 41 | `/arologis/unassigned` | `showArologisOps` | `arologis.dispatch.ops:view` | `arologis.dispatch.ops:view` | ✅ |
| 42 | `/arologis/dispatch-sms` | `showDispatchSmsPage` | `dispatch.batch:view` | `dispatch.batch:view` | ✅ |
| 43 | `/arologis/dispatch-sms/send-audit` | `showDispatchSmsSendAudit` | `notification.dispatch-sms.send-audit:view` | `notification.dispatch-sms.send-audit:view` | ✅ |
| 44 | `/arologis/dispatch-reconcile` | `showArologisOps` | `arologis.dispatch.ops:view` | `arologis.dispatch.ops:view` | ✅ |
| 45 | `/admin/regions` | `showRegionMgmt` | `arologis.region:view` | `arologis.region:view` | ✅ |
| 46 | `/arologis/admin/auto-dispatch` | `showArologisAdminPage` | `arologis.admin:view` | `arologis.admin:view` | ✅ |
| 47 | `/arologis/admin/manual-dispatch` | `showArologisAdminPage` | `arologis.admin:view` | `arologis.admin:view` | ✅ |
| 48 | `/arologis/admin/driver-assignment` | `showArologisAdminPage` | `arologis.admin:view` | `arologis.admin:view` | ✅ |
| 49 | `/warehouse/inbound-inspections` | `showInboundInspection` | `inbound.inspection:view` | `inbound.inspection:view` | ✅ |
| 50 | `/warehouse/audit` | `showAudit` (=`showInventoryAuditPage`) | `inventory.audit:view` | `inventory.audit:view` | ✅ |
| 51 | `/warehouse/dps-compare` | `showDpsCompare` (=`showInventoryDps`) | `inventory.dps:view` | `inventory.dps:view` | ✅ |
| 52 | `/warehouse/dps-compare/by-product` | `showDpsByProduct` (=`showInventoryDps`) | `inventory.dps:view` | `inventory.dps:view` | ✅ |
| 53 | `/admin/slip-edit-requests` | `showSlipEditRequests` | `slip.edit-requests.decide:view` | `slip.edit-requests.decide:view` | ✅ |
| 54 | `/admin/photo-audit` | `showPhotoAudit` | `slip.photo-audit:view` | `slip.photo-audit:view` | ✅ |
| 55 | `/inventory/stock-balance` | `showInventoryStockBalance` | `inventory.stock-balance:view` | `inventory.stock-balance:view` | ✅ |
| 56 | `/inventory/safety-stock-alerts` | `showSafetyStockAlerts` | `inventory.safety-stock:view` | `inventory.safety-stock:view` | ✅ |
| 57 | `/inventory/compensation-failures` | inline `dynamicCanAccess('inventory.list','view')` | `inventory.list:view` | `inventory.list:view` | ✅ |
| 58 | `/admin/chat-rooms` | `showChatRoomAdmin` | `messenger.admin:view` | `messenger.admin:view` | ✅ |
| 59 | `/admin/aligo-address-book` | `showAligoAddressBook` | `aligo.address-book:view` | `aligo.address-book:view` | ✅ |
| 60 | `/admin/sheet-sync` | `showSheetSync` (=`showProductsSync`) | `products.sync:view` | `products.sync:view` | ✅ |
| 61 | `/admin/users` | `showAdminEmployees` | `admin.employees:view` | `admin.employees:view` | ✅ |
| 62 | `/admin/permission-matrix` | `showPermissionAdmin` | `system.permission-admin:view` | `system.permission-admin:view` | ✅ |
| 63 | `/admin/permission-matrix/bulk` | `showPermissionAdmin` | `system.permission-admin:view` | `system.permission-admin:view` | ✅ |
| 64 | `/admin/permission-groups/matrix` | `showPermissionAdmin` | `system.permission-admin:view` | `system.permission-admin:view` | ✅ |
| 65 | `/admin/permission-groups/manage` | `showPermissionAdmin` | `system.permission-admin:view` | `system.permission-admin:view` | ✅ |
| 66 | `/admin/permission-groups/delegation` | `showPermissionDelegation` (=`showPermissionAdmin`) | `system.permission-admin:view` | `system.permission-admin:view` | ✅ |

**위반 건수: 0**

사이드바 66개 링크 전수 대조 결과 FE-shows-BE-redirect 또는 FE-hides-BE-allows 불일치 없음.

---

## 3. C-2 tax-invoices list:VIEW 전환 파급 확인

### emit-nts / batch / inbound 각 라우트 가드 보존

- `/accounting/tax-invoices/batch`: `PermissionGuard pageCode="accounting.tax-invoice.batch-issue" action="view"` — 변경 없음 ✅
- `/accounting/tax-invoices/inbound`: `PermissionGuard pageCode="accounting.tax-invoice.inbound" action="view"` — 변경 없음 ✅
- emit-nts 는 독립 라우트가 없음. `TaxInvoiceController.java:280`의 `@RequirePermission("accounting.tax-invoice.emit-nts", UPDATE)` 는 페이지 내부 버튼(emit-nts API 호출)에 대응 — 라우트 가드 대상 외.

### SALES mock grant 제거 확인

- `mock.ts` SALES DEFAULT_VIEW: `'accounting.tax-invoice.list'` 제거 완료.
- `accounting.tax-invoice.emit-nts`는 SALES DEFAULT_VIEW에 원래 없었음 → SALES에서 세금계산서 목록이 숨겨지는 것은 의도 변경이자 C-2 수정의 올바른 결과.
- Playwright 전체 423 passed(커밋 메시지 증빙) → sp-d2 등 SALES mock 의존 테스트와 충돌 없음 확인.

### ACCOUNTANT mock 오버그랜트 없음

- ACCOUNTANT DEFAULT_VIEW에 `accounting.tax-invoice.list` 포함 — 라우트 진입 허용됨.
- ACCOUNTANT DEFAULT_EDIT에 `accounting.tax-invoice.list` 포함 — 리스트 내 CREATE/UPDATE 버튼 접근.
- 단, 페이지 내부 `canAccessTaxInvoice(role) = role === 'ACCOUNTANT' || role === 'MASTER'` 는 PRE-EXISTING 정적 role 체크이며 route-guard 정합의 범위 밖 (이 PR 변경 대상 아님).

---

## 4. C-6 마감 3페이지 문구 — page-code 원문/UUID 비노출 확인

전체 3개 페이지(SalesClosingPage / MonthEndClosingPage / PeriodCloseListPage)의 사용자 노출 문구 대조:

| 위치 | 변경 전 | 변경 후 | UUID/page-code 노출 |
|------|---------|---------|-------------------|
| `SalesClosingPage:425` button title | `'ACCOUNTANT / MASTER 권한이 필요합니다'` | `'마감 실행 권한 필요'` | 없음 ✅ |
| `SalesClosingPage:441-443` 거부 문구 | `'— ACCOUNTANT / MASTER 권한 보유자만 가능합니다.'` | `'— 마감 실행 권한 보유자만 가능합니다.'` | 없음 ✅ |
| `MonthEndClosingPage:487-488` 안내문 | `'MASTER 권한자에게 역마감을 요청하십시오.'` | `'역마감 권한 보유자에게 역마감을 요청하십시오.'` | 없음 ✅ |
| `MonthEndClosingPage:330` button title | `'ACCOUNTANT / MASTER 권한이 필요합니다'` | `'마감 실행 권한 필요'` | 없음 ✅ |
| `MonthEndClosingPage:347` 거부 문구 | `'— ACCOUNTANT / MASTER 권한 보유자만 가능합니다.'` | `'— 마감 실행 권한 보유자만 가능합니다.'` | 없음 ✅ |
| `PeriodCloseListPage:330` button title | `'ACCOUNTANT / MASTER 권한이 필요합니다'` | `'마감 실행 권한 필요'` | 없음 ✅ |
| `PeriodCloseListPage:347` 거부 문구 | `'— ACCOUNTANT / MASTER 권한 보유자만 가능합니다.'` | `'— 마감 실행 권한 보유자만 가능합니다.'` | 없음 ✅ |

UUID 노출 없음 ✅. accounting.period-close 등 page-code 원문 노출 없음 ✅.

---

## 5. C-8 신규 mock 런타임 spec 안정성 분석

### 테스트 1: products.sync MANAGER grant → `/admin/sheet-sync` 허용

```typescript
await page.goto(`${BASE_URL}/#/admin/sheet-sync?mockRole=MANAGER`, { waitUntil: 'domcontentloaded', timeout: 20000 })
await expect(page).toHaveURL(/#\/admin\/sheet-sync/)
await expect(page.getByTestId('admin-sheetsync-trigger-btn')).toBeVisible({ timeout: 15000 })
```

- `page.goto()` 는 full page reload → `_resolveMockRole()` 가 URL hash 파라미터 재파싱 → MOCK_AUTH.role = 'MANAGER' ✅
- MANAGER DEFAULT_VIEW에 `'products.sync'` 포함 → `PermissionGuard` 통과 → `AdminSheetSyncPage` 렌더됨 ✅
- `data-testid="admin-sheetsync-trigger-btn"` 은 `SheetSyncPage.tsx:137` 에서 Button 에 고정 부착 — 조건부 렌더링 아님 → `toBeVisible()` 안정적 ✅

### 테스트 2: SALES mock role → redirect, trigger btn 0건

```typescript
await page.goto(`${BASE_URL}/#/admin/sheet-sync?mockRole=SALES`, { waitUntil: 'domcontentloaded', timeout: 20000 })
await expect.poll(() => page.url(), { timeout: 15000 }).not.toContain('/admin/sheet-sync')
await expect(page.getByTestId('admin-sheetsync-trigger-btn')).toHaveCount(0)
```

- SALES DEFAULT_VIEW에 `'products.sync'` 없음 → `PermissionGuard.canAccess = false` → `<Navigate to="/" replace />` ✅
- `PermissionGuard`가 `isLoading=true` 시 Spinner 렌더 → 권한 로드 완료 후 redirect → 비동기이나 `expect.poll` 15s 내 해소 ✅
- redirect 후 URL = `/#/` → `.not.toContain('/admin/sheet-sync')` 통과 ✅
- SheetSyncPage 미렌더 → trigger btn count=0 ✅
- **잠재적 flaky 요소**: TanStack Query `staleTime: 5분`. 동일 브라우저 컨텍스트 내 두 번째 `page.goto()` 에서 QueryClient 가 이전 캐시를 가지면 `isLoading=false` 이고 이미 cached permissions 로 판정될 수 있음. 그러나 `page.goto()` 는 full document navigation → React app 재초기화 → QueryClient 재생성 → 캐시 없음. Playwright 기본 `page` 픽스처는 브라우저 세션을 유지하되 각 navigation 은 SPA reload 를 트리거함. `waitUntil: 'domcontentloaded'` + Hash router 조합에서 실제로 module-level 코드가 재실행되는지는 브라우저 내부 캐시 정책에 따라 다를 수 있으나, 423 passed 실증이 있어 실용적으로 안정 판정. CI 환경에서 연속 실행 시 간헐적 flaky 발생 가능성은 낮음.

### 테스트 3: MANAGER `/sales/closing` 진입 및 마감 실행 버튼 노출

```typescript
await page.goto(`${BASE_URL}/#/sales/closing?mockRole=MANAGER`, { waitUntil: 'domcontentloaded', timeout: 20000 })
await expect(page).toHaveURL(/#\/sales\/closing/)
await expect(page.getByTestId('sales-closing-new-button')).toBeVisible({ timeout: 15000 })
```

- MANAGER DEFAULT_VIEW에 `'accounting.period-close'` 포함 → `PermissionGuard` 통과 ✅
- `SalesClosingPage` 컴포넌트: `sales-closing-new-button` 은 `canExecute` 여부와 무관하게 항상 DOM에 존재(disabled 속성만 변경) → `toBeVisible()` 안정적 ✅
- `canExecute = canAccess('accounting.period-close', 'create')`: MANAGER DEFAULT_EDIT에 `accounting.period-close` 미포함 → canExecute=false → 버튼 disabled. 테스트는 visible 만 확인하므로 disabled 여부와 무관 ✅
- early null return 없음. 컴포넌트는 항상 전체 폼을 렌더 ✅

**C-8 전체: flaky 위험 낮음, stable 판정.**

---

## 6. _showPartnersEditRequest 미사용 처리 일관성

현재 상태:
```tsx
// partners.edit-request — 사이드바 직접 노출 없음 (라우트 가드 전용). C-4 로 그룹 헤더 OR 소비처 제거.
const _showPartnersEditRequest   = dynamicCanAccess('partners.edit-request', 'view')
```

- 사이드바 `show=` prop 미사용 ✅
- 라우트 `index.tsx` 에 `partners.edit-request` 를 pageCode 로 사용하는 PermissionGuard 없음 → comment 의 "라우트 가드 전용" 표현이 부정확. 실제로는 미래 페이지 내부 action 가드용 예약 변수로 추정.
- 기능적 결함 없음. → Nit-N1 로 분류.

---

## 7. 신규 결함표

| ID | 심각도 | 파일 | 위치 | 내용 | 분류 |
|---|--------|------|------|------|------|
| **D2-FE-001** | **P2** | `clients/desktop/src/renderer/routes/DailyClosingPage.tsx:93-94`, `clients/desktop/src/renderer/api/accounting.ts:1039-1048` | 일마감 화면 `/accounting/daily-closing` | `canExecuteDailyClosing(role)` / `canReverseDailyClosing(role)` — role === 'ACCOUNTANT' \|\| role === 'MASTER' 정적 role 판정 잔류. 거부 문구 `"ACCOUNTANT / MASTER 권한에서 실행할 수 있습니다."` role 코드명 화면 노출. 사이클1 C-6 fix 범위(SalesClosingPage/MonthEndClosingPage/PeriodCloseListPage)에서 DailyClosingPage 누락. Designer 사이클2 D2-001 과 동일 결함. | 본 PR 즉시 처리: `DailyClosingPage` → `usePermissions() + canAccess('accounting.daily-closing.run','create')` / `canAccess('accounting.daily-closing.unlock','update')` 로 전환. 거부 문구 `"마감 실행 권한 필요"` 등 page-code 기반 교체. `accounting.ts` 내 `canExecuteDailyClosing` / `canReverseDailyClosing` dead code 여부 재확인 후 제거. |

---

## 8. Nit

### Nit-N1 — `_showPartnersEditRequest` comment 부정확

**위치**: `AppLayout.tsx:253`

comment: `partners.edit-request — 사이드바 직접 노출 없음 (라우트 가드 전용).`

현실: routes/index.tsx 에 `partners.edit-request` 를 pageCode 로 사용하는 PermissionGuard 라우트가 없다. "라우트 가드 전용" 이 아니라 "향후 페이지 내부 action 가드 예약" 이거나 완전히 미사용이다. 기능 영향 없음.

권고: comment 를 `// partners.edit-request — 현재 미사용(향후 거래처 수정 요청 페이지 내부 가드 예약).` 등으로 교정.

---

## 9. 잔존 PRE-EXISTING 사항 (본 PR 처리 불필요)

아래 사항은 이 PR이 도입한 결함이 아닌 사전 잔존이다. 개발책임자 판단으로 후속 슬라이스 등록 권고.

| 항목 | 위치 | 설명 |
|------|------|------|
| `canAccessTaxInvoice()` 정적 role | `taxInvoiceApi.ts:296`, `TaxInvoiceDetailPage.tsx:244`, `TaxInvoiceListPage.tsx:166` | 페이지 내부 버튼(create/emit-nts) 가시성이 role === 'ACCOUNTANT' \|\| role === 'MASTER' 정적 판정. 라우트 가드는 동적 RBAC로 전환됐으나 페이지 내 버튼 게이트 미전환. custom grant 사용자(예: MANAGER 추가 세금계산서 list CREATE 부여 시) create 버튼이 보이지 않는 FE-hides 발생 가능. |
| full-menu-contract stale RoleGuard 어서션 | `full-menu-contract.spec.ts:103-107` | `/sales/new`, `/purchases/new`, `/transfers/new`, `/sales/link-dispatch`, `/sales/partner-dc-config` 에 대한 RoleGuard 어서션이 현실(PermissionGuard)과 불일치. testIgnore 격리 중. |
| `_showProductsList`, `_showProductsAdmin` 미사용 | `AppLayout.tsx:256-257` | 향후 상품 메뉴 추가 시 연결 예정인 예약 변수. 기능 영향 없음. |

---

## 10. 종합 판정

**CHANGES REQUESTED**

사이클1 P1 결함(FE-1/FE-2) 전원 해소 확인. D-CX-001/002, FE-3/FE-4, P1-1/P1-2 모두 해소됨.

사이드바 66개 링크 전수 대조 결과 show 조건 ↔ 라우트 PermissionGuard 위반 **0건**.

신규 결함 **D2-FE-001(P2)** 1건: DailyClosingPage 가 C-6 fix 범위에서 누락되어 role === 'ACCOUNTANT' 정적 판정 및 role 코드명 화면 노출 잔류. Designer D2-001 과 동일 결함. 즉시 처리 대상.

C-8 mock 런타임 spec 3개 테스트: flaky 위험 낮음, stable 판정. 423 passed 실증 수용.
