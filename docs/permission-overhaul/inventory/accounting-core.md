# 권한 인벤토리 — accounting-service 핵심 회계 도메인

> Phase 0 read-only audit. 도메인 = **accounting-service core 회계**.
> 액션 판정: VIEW = GET/query endpoint + FE route 동시 존재 / CREATE = POST 생성 / UPDATE = PUT·PATCH / DELETE = DELETE(soft) / RESTORE = 버전이력+롤백(대부분 부재, 수정요청 워크플로우는 ⚠️) / DOWNLOAD = Excel·PDF·PNG export(포맷 명기) / PRINT = 인쇄 view·endpoint.
> 셀 토큰: 컨트롤러#메서드(BE) 또는 FE route. 프로그램 = 모두 **desktop** (clients/desktop renderer).

BE 위치: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/**`
FE 위치: `clients/desktop/src/renderer/routes/index.tsx` (+ `routes/accounting/**`, `print/**`)

핵심 사실:
- **PDF / PNG export 코드는 전 코드베이스에 0건** (jsPDF·html2canvas·toPng 미사용). DOWNLOAD 는 전부 POI **xlsx** 만.
- **PRINT 은 브라우저 CSS `@media print` 기반 인쇄 view** (PrintLayout). 별도 PRINT endpoint 는 세금계산서 `GET /{id}/print` (데이터 only) 뿐.
- **RESTORE(버전이력+롤백)는 전 페이지 부재.** `accounting.edit-requests*` 의 잠금 mutation 해제 요청/승인 워크플로우가 유일한 부분 대체(⚠️).

| PageCode | 프로그램 | VIEW | CREATE | UPDATE | DELETE | RESTORE | DOWNLOAD | PRINT |
|---|---|---|---|---|---|---|---|---|
| accounting.tax-invoice.emit-nts | desktop | ✅ TaxInvoiceCtl#emitNts(EDIT)+FE `/tax-invoices` | ⚠️ FE `/new` uses emit-nts code; 생성은 list code | ❌ | ❌ | ❌ | ❌ | ❌ |
| accounting.tax-invoice.list | desktop | ✅ TaxInvoiceCtl#list/getOne/history + FE `/tax-invoices/:id` | ✅ #create(POST) | ✅ #update(PUT) | ❌ (취소=cancel code) | ⚠️ edit-requests | ❌ | ✅ #print(GET)+FE `/:id/print` TaxInvoiceView |
| accounting.tax-invoice.list (목록) | desktop | ✅ #list/history GET | ✅ #create | ✅ #update | ❌ | ⚠️ | ❌ | ✅ #print |
| accounting.deposit-match | desktop | ✅ FE `/deposit-match` DepositMatchPage | ⚠️ DepositMatchCtl#fetchAndMatch (POST 조회+매칭, EDIT) | ❌ | ❌ | ❌ | ❌ | ❌ |
| accounting.daily-closing | desktop | ✅ DailyClosingCtl#list(GET)+FE `/daily-closings` | ❌ (실행=run code) | ❌ (unlock 별도 code) | ❌ | ❌ | ❌ | ❌ |
| accounting.general-ledger | desktop | ✅ LedgerCtl#getLedger(GET)+FE `/ledgers` GeneralLedgerPage | ❌ | ❌ | ❌ | ❌ | ⚠️ FE GeneralLedgerPage CSV(client-side) — xlsx 아님 | ❌ |
| accounting.accounts | desktop | ✅ AccountCtl#tree(GET)+FE `/accounts` AccountTreePage | ❌ (마스터 read-only) | ❌ | ❌ | ❌ | ❌ | ❌ |
| accounting.journals | desktop | ✅ JournalCtl#list/getOne+FE `/journals` | ✅ #create(POST) | ⚠️ #post/#reverse(상태전이, DRAFT edit=FE `/:id/edit`) | ❌ | ⚠️ edit-requests | ✅ #exportXlsx(GET export.xlsx) **xlsx만** | ❌ |
| accounting.balances | desktop | ✅ TrialBalanceCtl#byPeriod(GET, method code=...trial-balance)+FE `/balances` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| accounting.reports | desktop | ✅ AccountingReportCtl#aggregate/dailyDetail + report/* 11개 GET + FE `/reports` | ❌ | ❌ | ❌ | ❌ | ❌ (보고서 xlsx 미구현) | ✅ FE `/reports/*/print` PrintLayout(CSS) |
| accounting.period-close | desktop | ✅ MonthEndCloseCtl#list(GET)+FE `/period-close` PeriodCloseListPage | ⚠️ #close(POST, page=accounting.period-close EDIT) | ❌ | ❌ | ❌ | ❌ | ❌ |
| accounting.statement-batch | desktop | ✅ AccountingReportCtl#statementBatch(GET)+FE `/statement-batch` | ❌ | ❌ | ❌ | ❌ | ❌ (xlsx 미; 데이터만) | ✅ FE `/print/statement-batch` StatementBatchView(CSS) |
| accounting.partner-ledger | desktop | ✅ AccountingReportCtl#ledger(GET)+FE `/partner-ledger` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ FE `/print/partner-ledger` PartnerLedgerView(CSS) |
| accounting.edit-requests | desktop | ✅ EditRequestCtl#listByEntity(GET)+FE `/accounting/edit-requests` | ⚠️ #createRequest(POST 수정/삭제 요청, EDIT) | ❌ | ❌ | ⚠️ 잠금 mutation 해제 요청(RESTORE 부분 대체) | ❌ | ❌ |
| accounting.edit-requests.decide | desktop | ✅ EditRequestCtl#listForRole(GET) | ❌ | ⚠️ #approve/#reject(POST 승인/거절, EDIT) | ❌ | ⚠️ 승인 시 1회 mutation 허용 | ❌ | ❌ |
| accounting.tax-invoice.cancel | desktop | ❌ (전용 view 없음, 상세화면 버튼) | ❌ | ⚠️ TaxInvoiceCtl#cancel(POST ISSUED→CANCELLED, EDIT) | ⚠️ 논리적 취소(soft) | ❌ | ❌ | ❌ |
| accounting.tax-invoice.issue-request | desktop | ❌ (전용 view 없음) | ✅ TaxInvoiceCtl#createP04(POST /issue-request, EDIT) | ❌ | ❌ | ❌ | ❌ | ❌ |
| accounting.tax-invoice.realtime | desktop | ⚠️ AccountingRealtimeCtl#subscribeTaxInvoice(SSE GET, VIEW) — FE realtime client 존재, 전용 route 없음 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| accounting.tax-invoice.inbound.manage | desktop | ✅ TaxInvoiceInboundCtl#listInbound(GET) | ✅ #registerInbound(POST) | ❌ | ❌ | ❌ | ⚠️ #uploadAttachment(PDF/이미지 메타 저장, export 아님) | ❌ |
| accounting.hometax-export | desktop | ✅ AccountingReportCtl#hometaxExport/listExclusions/listHistory(GET)+FE `/hometax-export` | ⚠️ #addExclusion / #hometaxPreview(POST, EDIT) | ❌ | ✅ #removeExclusion(DELETE exclusions, soft, EDIT) | ❌ | ✅ #hometaxExport/#hometaxSplitDownload(GET byte[]) **xlsx만** | ❌ |
| accounting.daily-closing.run | desktop | ❌ (전용 view 없음; daily-closing 화면 버튼) | ⚠️ DailyClosingCtl#close(POST 일마감 실행, EDIT) | ❌ | ❌ | ❌ | ❌ | ❌ |
| accounting.daily-closing.unlock | desktop | ❌ | ❌ | ⚠️ DailyClosingCtl#unlock(PATCH `/{date}/lock`, EDIT, MASTER) | ❌ | ⚠️ unlock=마감 잠금해제(RESTORE 인접) | ❌ | ❌ |
| accounting.period-close.reverse | desktop | ❌ | ❌ | ⚠️ MonthEndCloseCtl#reverse(POST `/{id}/reverse`, EDIT) | ❌ | ⚠️ 역마감=마감 되돌리기(RESTORE 인접) | ❌ | ❌ |
| accounting.journals.realtime | desktop | ⚠️ AccountingRealtimeCtl#subscribeJournal(SSE GET, VIEW) — 전용 route 없음 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| accounting.balances.trial-balance | desktop | ✅ TrialBalanceCtl#byPeriod(GET, 이 code 가 실제 method 가드)+FE `/balances` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| accounting.sales-slip.accounting | desktop | ✅ SalesAccountingSlipCtl#list(GET) | ✅ #createDraft(POST) | ⚠️ #post(POST 게시, EDIT) | ❌ | ❌ | ❌ | ❌ |
| accounting.purchase-slip.accounting | desktop | ✅ PurchaseAccountingSlipCtl#list(GET) | ✅ #createDraft(POST) | ⚠️ #post(POST 게시, EDIT) | ❌ | ❌ | ❌ | ❌ |
| accounting.supplier-profiles | desktop | ✅ SupplierProfileCtl#list/getPrimary(GET)+FE `/supplier-profiles` (route guard=partner-ledger) | ✅ #create(POST) | ✅ #update(PUT)+#setPrimary(PATCH) | ✅ #delete(DELETE soft, primary 차단) | ❌ | ❌ | ❌ |
| accounting.sales-slip.list | desktop | ⚠️ FE `/accounting/sales-slips` SalesAccountingSlipPage (BE 가드는 .accounting code) | ⚠️ FE `/sales-slips/new` (edit) → BE .accounting | ❌ | ❌ | ❌ | ❌ | ❌ |
| accounting.purchase-slip.list | desktop | ⚠️ FE `/accounting/purchase-slips` PurchaseAccountingSlipPage (BE 가드는 .accounting code) | ⚠️ FE `/purchase-slips/new` (edit) → BE .accounting | ❌ | ❌ | ❌ | ❌ | ❌ |
| accounting.tax-invoice.batch-issue | desktop | ✅ TaxInvoiceBatchCtl#listSalesSlipCandidates(GET)+FE `/tax-invoices/batch` | ✅ #createFromSalesSlips(POST batch-from-sales-slips) | ❌ | ❌ | ❌ | ⚠️ (batch xlsx 는 hometax-export code 로 가드) | ❌ |
| accounting.tax-invoice.inbound | desktop | ⚠️ FE `/accounting/tax-invoices/inbound` TaxInvoiceInboundPage (BE 가드는 .inbound.manage code) | ⚠️ BE .inbound.manage #registerInbound | ❌ | ❌ | ❌ | ❌ | ❌ |

> 코드 약어: TaxInvoiceCtl=TaxInvoiceController, EditRequestCtl=AccountingEditRequestController, MonthEndCloseCtl=MonthEndCloseController, EXCL=batch exclusions.
> page↔method 불일치 주의: `accounting.balances` 는 상수만 존재하고 실제 메서드 가드는 `accounting.balances.trial-balance`. `sales-slip.list`/`purchase-slip.list`/`tax-invoice.inbound` 는 **FE route 전용 코드**이며 BE 엔드포인트는 각각 `.accounting`/`.inbound.manage` 코드로 가드됨(BE 직접 매핑 없음 → VIEW ⚠️).

---

## 신규 구현 필요 집계 (Phase 2 scoping feed)

### RESTORE (버전이력 view + rollback) — **전 페이지 부재 (신규 구현 대상)**
- 진정한 RESTORE(엔티티 버전 이력 + 롤백)는 **0개 페이지** 구현. 모든 mutation 은 soft-delete/상태전이 only, 이력 복원 UI/endpoint 없음.
- 부분 대체(⚠️, RESTORE 정책 재사용 후보):
  - `accounting.edit-requests` / `.decide` — 잠금 엔티티(ISSUED/POSTED/CLOSED) 수정·삭제 **요청→승인→1회 mutation** 워크플로우.
  - `accounting.daily-closing.unlock` — 일마감 잠금 해제(PATCH `/{date}/lock`).
  - `accounting.period-close.reverse` — 월말 역마감(POST `/{id}/reverse`).
  - `accounting.tax-invoice.cancel` — 발행 취소 + 자동 역분개(논리 되돌리기).
- → Phase 2: 회계 핵심 엔티티(분개·세금계산서·마감)에 **공통 버전이력 + 롤백** 신규 설계 필요. 위 워크플로우들을 RESTORE 액션으로 통합 재정의 검토.

### DOWNLOAD — PDF / PNG **전 페이지 부재**; xlsx 만 일부 존재
- xlsx 존재(✅): `accounting.journals`(export.xlsx), `accounting.hometax-export`(legacy 12컬럼 + 59컬럼 split).
- xlsx 도 부재(❌, 신규 xlsx export 대상): `accounting.reports`(재무 보고서 11종 — BS/IS/현금흐름/부가세/법인세/일계·월계 등), `accounting.balances`(시산표), `accounting.general-ledger`(현재 client CSV 만), `accounting.statement-batch`(데이터만), `accounting.partner-ledger`.
- **PDF export = 0건**, **PNG export = 0건** (jsPDF·html2canvas·toPng 의존성 자체 미설치). 모든 “인쇄물 저장” 요구는 현재 브라우저 print→PDF 수동에 의존.
- → Phase 2: (a) 보고서/시산표/원장 **서버 xlsx export** 신규, (b) 거래명세서·세금계산서·재무보고서 **PDF 생성 파이프라인** 신규(공통 모듈), (c) PNG 캡처 요구 시 html2canvas 도입 검토.

### PRINT (인쇄 view) — 핵심 4그룹만 존재, 나머지 부재
- 존재(✅): `accounting.tax-invoice.list`(TaxInvoiceView + BE `GET /{id}/print`), `accounting.statement-batch`(StatementBatchView), `accounting.partner-ledger`(PartnerLedgerView), `accounting.reports`(11 PrintLayout, CSS `@media print`).
- 부재(❌, 인쇄 요구 가능 대상): `accounting.daily-closing`(일마감표), `accounting.general-ledger`(원장 인쇄), `accounting.balances`/`.trial-balance`(시산표 인쇄), `accounting.period-close`(마감 보고), `accounting.sales-slip.*`/`accounting.purchase-slip.*`(전표 인쇄), `accounting.deposit-match`(입금 매칭 결과), `accounting.hometax-export`(목록 인쇄), `accounting.tax-invoice.inbound(.manage)`(수신 세금계산서 인쇄).
- PRINT 은 모두 CSS 기반 — 전용 PRINT endpoint 는 세금계산서 1건 뿐. → Phase 2: 전표/원장/시산표/일마감 인쇄 layout 신규 + PDF 연계.
