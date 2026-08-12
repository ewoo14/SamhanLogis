/**
 * 라우트 정의 — 플랫폼별 라우터 기반.
 *
 * 웹 배포(`vite.web.config.ts` 의 `VITE_PLATFORM='web'`)만 서버 SPA fallback 을
 * 전제로 `createBrowserRouter` 를 사용한다. Electron 및 mock/dev 렌더러는
 * 새로고침 404 와 해시 URL mock gate 회귀를 피하기 위해 `createHashRouter` 를 사용한다.
 *
 * IA 재편 (slip-output-format 슬라이스 — Q1=A 새 슬라이스):
 * - `/login` → LoginPage (보호 X)
 * - `/`             대시보드
 * - `/warehouses`   창고 관리
 * - `/sales`        판매관리 (SalesQueryPage — 풍성한 컬럼 + 다중 선택 + 50/page) [2a 통합]
 * - `/sales/slips`  legacy 출고전표 list (SlipListPage) — 2c 작성 plumbing 합류 시 진입점
 * - `/sales/new`    출고전표 작성
 * - `/sales/link-dispatch`  링크발송 (배송 묶음 + e-sign URL SMS) — link-dispatch-slice
 * - `/sales/:id`    출고전표 상세 + lifecycle
 * - `/sales/:id/print/statement` 거래명세서 인쇄 미리보기 (SP-08-6-4)
 * - `/sales/:id/print/invoice`   세금계산서 인쇄 미리보기 (SP-08-6-4)
 * - `/sales/:id/print/dispatch`  출고전표 작업지시서 인쇄
 * - `/dispatch/external-dispatch/:id/print`  타배송사 배차의뢰서 인쇄 (PRINT/BOTH, dispatch.board view)
 * - `/purchases`        구매관리 (PurchaseQueryPage — 풍성한 컬럼 + 다중 선택) [2a 통합]
 * - `/purchases/slips`  legacy 입고전표 list (SlipListPage) — 2c 작성 plumbing 합류 시 진입점
 * - `/purchases/new`    입고전표 작성
 * - `/purchases/:id`    입고전표 상세 + lifecycle
 * - `/transfers`     재고이동 관리
 * - `/transfers/new` 재고이동 작성
 * - `/transfers/:id` 재고이동 상세 + lifecycle
 *
 * accounting-slice-A 신규 라우트 (ACCOUNTANT/MANAGER/MASTER — RoleGuard):
 * - `/accounting/accounts`              계정과목 트리
 * - `/accounting/journals`              분개장 목록
 * - `/accounting/journals/new`          분개 작성
 * - `/accounting/journals/:id/edit`     분개 편집 (DRAFT 만)
 * - `/accounting/journals/:id`          분개 상세 + 확정/역분개
 * - `/accounting/balances`              시산표 (월별)
 *
 * P0-1 Slice A 신규 라우트 (ACCOUNTANT/MANAGER/MASTER — RoleGuard, BE @PreAuthorize 일치):
 * - `/accounting/reports`                    재무 보고서 목록 (7개 카드 — Slice A 3 + B 4)
 * - `/accounting/reports/income-statement`   손익계산서 (월별)
 * - `/accounting/reports/balance-sheet`      재무상태표 (기준일)
 *
 * P0-1 Slice B 신규 라우트 (ACCOUNTANT/MANAGER/MASTER — RoleGuard):
 * - `/accounting/reports/vat`                부가세 신고서 (월별)
 * - `/accounting/reports/corporate-tax`      법인세 신고서 (사업연도)
 * - `/accounting/reports/partner-aging`      거래처별 미수/미지급 (기준일 + type)
 * - 각 보고서 `/print` 서브 라우트 (인쇄 전용 새 창)
 *
 * P0-1 Slice C 신규 라우트 (ACCOUNTANT/MANAGER/MASTER — RoleGuard):
 * - `/accounting/reports/cash-flow`          현금흐름표 (월별)
 * - `/accounting/reports/equity-changes`     자본변동표 (기간)
 * - `/accounting/reports/daily-summary`      일계표 (일자)
 * - `/accounting/reports/monthly-summary`    월계표 (월별)
 * - 각 보고서 `/print` 서브 라우트 (인쇄 전용 새 창)
 *
 * SP-08-6-5 P2 신규 라우트 (ACCOUNTANT/MANAGER/MASTER — RoleGuard):
 * - `/accounting/daily-closings`  일마감 — 날짜 range + 거래처 필터 + 마감 실행 + 역마감(MASTER 만)
 * - `/accounting/ledgers`         원장 — 기간/계정/거래처 필터 + 라인 DataTable + CSV 다운로드
 *
 * SP-09-4 신규 라우트 (ACCOUNTANT/MANAGER/MASTER — RoleGuard):
 *
 * 기존 PR #18 의 `/slips`, `/slips/new` 라우트는 폐기.
 */
import {
  createBrowserRouter,
  createHashRouter,
  Navigate,
  RouterProvider,
  useSearchParams,
} from 'react-router-dom'
import { AuthGuard } from '../components/AuthGuard'
import { AppLayout } from '../components/AppLayout'
import { LoginPage } from './LoginPage'
import { DashboardPage } from './DashboardPage'
import { NotificationHistoryPage } from './NotificationHistoryPage'
import { WarehousesPage } from './WarehousesPage'
import { SlipListPage } from './SlipListPage'
import { SlipFormPage } from './SlipFormPage'
import { SlipDetailPage } from './SlipDetailPage'
import { TransferListPage } from './TransferListPage'
import { TransferFormPage } from './TransferFormPage'
import { TransferDetailPage } from './TransferDetailPage'
import { LinkDispatchListPage } from './LinkDispatchListPage'
// InvoiceView (P0-4 거래명세서 1차 mock) 은 SP-08-6-4 SalesInvoicePrintPage 로 대체됨.
import { DispatchView } from '../print/DispatchView'
import { ExternalDispatchRequestView } from '../print/ExternalDispatchRequestView'
// P0-4 인쇄 양식 1차 mock — Designer 단계 신규 (견적/세금계산서)
import { QuoteView } from '../print/QuoteView'
import { TaxInvoiceView } from '../print/TaxInvoiceView'
// SP-08-5-5 — 매입 전표 인쇄 양식 (A4 portrait, legacy GAS 동등)
import { PurchaseSlipPrintPage } from '../print/PurchaseSlipPrintPage'
// SP-08-6-4 — 매출 인쇄 양식 2종 (거래명세서 / 세금계산서, A4 portrait)
import { SalesTransactionStatementPrintPage } from '../print/SalesTransactionStatementPrintPage'
import { SalesInvoicePrintPage } from '../print/SalesInvoicePrintPage'
// signature-slice-C 모바일 mock 라우트 (Phase 5 nginx 분리 전 시뮬레이션 — AuthGuard 외부)
import { MobileSignaturePage } from './MobileSignaturePage'
import { MobileRecipientPage } from './MobileRecipientPage'
// accounting-slice-A 회계 라우트 5종 (ACCOUNTANT/MANAGER/MASTER — RoleGuard 적용)
import { AccountTreePage } from './AccountTreePage'
import { JournalListPage } from './JournalListPage'
import { JournalFormPage } from './JournalFormPage'
import { JournalDetailPage } from './JournalDetailPage'
import { TrialBalancePage } from './TrialBalancePage'
import { SalesCommissionSettlementListPage } from './SalesCommissionSettlementListPage'
import { SalesCommissionSettlementDetailPage } from './SalesCommissionSettlementDetailPage'
// P0-4 세금계산서 라우트 3종 (ACCOUNTANT/MANAGER/MASTER — RoleGuard).
// BE: accounting-service `/accounting/tax-invoices/*` (commit f8b8b49).
import { TaxInvoiceListPage } from './TaxInvoiceListPage'
import { TaxInvoiceFormPage } from './TaxInvoiceFormPage'
import { TaxInvoiceDetailPage } from './TaxInvoiceDetailPage'
// GAS 이식 — 세금계산서 일괄발행 4탭 페이지 (ACCOUNTANT / MANAGER / MASTER).
// BE: accounting-service POST /batch/preview / GET /batch/{id}/excel / /batch/exclusions / /batch/history
// [supplier-profile + datagrid] 사업자 양식 페이지 (ACCOUNTANT read / MANAGER+MASTER write).
// BE: accounting-service `/api/v1/accounting/supplier-profiles`
import { SupplierProfilePage } from './accounting/SupplierProfilePage'
// P2-1 견적서 라우트 3종 — slip-service `/slips/estimates/*` (commit 59232bd) 신규 BE 연결.
// legacy webview (EstimateLegacyWebviewPage) 폐기 후 SamhanLogis 도메인 견적 화면으로 교체.
import { EstimateListPage } from './EstimateListPage'
import { EstimateFormPage } from './EstimateFormPage'
import { EstimateDetailPage } from './EstimateDetailPage'
// [Phase 6 v4] 판매 sub-route 4종 (견적은 신규 EstimateListPage — legacy webview 폐기)
import { SalesPartnerOrderListPage } from './SalesPartnerOrderListPage'
import { SalesPartnerOrderDetailPage } from './SalesPartnerOrderDetailPage'
import { SalesOrderApprovalsPage } from './SalesOrderApprovalsPage'
import { SalesPartnerDcConfigPage } from './SalesPartnerDcConfigPage'
import { EstimatePricingConfigPage } from './EstimatePricingConfigPage'
// Phase 10 P0-2 — 본인 비밀번호 변경 페이지 (재로그인 강제)
import { PasswordChangePage } from './PasswordChangePage'
// P0-2 셀프 재설정 — 비인증 page 방식 2종 (AuthGuard 외부 최상위 등록)
import { PasswordResetRequestPage } from './PasswordResetRequestPage'
import { PasswordResetConfirmPage } from './PasswordResetConfirmPage'
// [Phase 10 P1-5] arologis 수동 배차 admin UI (MASTER/MANAGER).
import { ArologisManualDispatchPage } from './ArologisManualDispatchPage'
// [Phase 10 PR-E1 FE-2] arologis 가배차 분류 admin UI (REGION 권역 + 시도 광역 2-탭, MASTER/MANAGER/DISPATCH)
import { ArologisPreClassifyPage } from './ArologisPreClassifyPage'
import { CarrierListPage } from './CarrierListPage'
import { DispatchGroupPage } from './DispatchGroupPage'
// [Phase 10 P2-4 / slice 8] legacy 매출 마감 — 일별/월별 (ACCOUNTANT/MANAGER/MASTER 진입, 역마감은 MASTER 만).
import { MonthEndClosingPage } from './MonthEndClosingPage'
// [Phase 10 P0-5 / slice 4] 관리자 통합 admin (MASTER 전용 5 페이지)
import { AdminLayout } from '../components/AdminLayout'
import { UsersPage as AdminUsersPage } from './admin/UsersPage'
import { RolesPage as AdminRolesPage } from './admin/RolesPage'
import { PartnersPage as AdminPartnersPage } from './admin/PartnersPage'
import { WarehousesPage as AdminWarehousesPage } from './admin/WarehousesPage'
import { DepartmentsPage as AdminDepartmentsPage } from './admin/DepartmentsPage'
// [P0-6] 거래처 4탭 신규 등록 — SALES / MANAGER / MASTER (AdminLayout MASTER 가드 외부 배치)
import { PartnerCreatePage as AdminPartnerCreatePage } from './admin/PartnerCreatePage'
// [PR-D Phase B FE-A] 구글 시트 동기화 admin (MASTER 전용 — AdminLayout 가드)
import { SheetSyncPage as AdminSheetSyncPage } from './admin/SheetSyncPage'
// [PR-D Phase B FE-B] arologis 지역 관리 admin UI — DISPATCH 조회 + MANAGER/MASTER 관리.
import { RegionsPage as AdminRegionsPage } from './admin/RegionsPage'
import { ExternalCarriersPage as AdminExternalCarriersPage } from './admin/ExternalCarriersPage'
// [출고전표 마감시간 설정] 인사 메뉴 — MASTER/MANAGER (hr.slip-cutoff view)
import { SlipCutoffConfigPage as AdminSlipCutoffConfigPage } from './admin/SlipCutoffConfigPage'
// [PR-D Phase B FE-E] 발송금지 거래처 admin (MASTER 전용 — partner-service /api/v1/partners/admin/blocks)
import { BlockedPartnersPage as AdminBlockedPartnersPage } from './admin/BlockedPartnersPage'
// [PR-F1 Designer mock] 알리고 주소록 자동 동기화 — MASTER 전용 (AdminLayout 가드).
// legacy GAS 9번 이식, BE FE-1 슬라이스 endpoint 연결 예정.
import { AligoAddressBookPage as AdminAligoAddressBookPage } from './admin/AligoAddressBookPage'
// [PR-F1 FE-2] arologis 운송사 실배차 비교 — DISPATCH/MANAGER/MASTER.
import { ArologisDispatchReconcilePage } from './ArologisDispatchReconcilePage'
// [PR-D Phase B FE-D] 단톡방 매핑 admin — MASTER/MANAGER (BE @PreAuthorize 일치)
// AdminLayout 은 MASTER 전용이므로 별도 RoleGuard 로 MASTER/MANAGER 진입 허용.
import { ChatRoomsPage as AdminChatRoomsPage } from './admin/ChatRoomsPage'
// [Phase 10 P2-6 / slice 9] 재고 실사 3 페이지 (WAREHOUSE/MASTER)
import { InventoryAuditListPage } from './InventoryAuditListPage'
import { InventoryAuditFormPage } from './InventoryAuditFormPage'
import { InventoryAuditDetailPage } from './InventoryAuditDetailPage'
// [P0-9] 입고 검수 목록 (WAREHOUSE/MANAGER/MASTER)
import { InboundInspectionListPage } from './InboundInspectionListPage'
// [PR-E1 FE-5] 전표 정리 리스트 (legacy GAS 13번 자동 조회 이식) — SALES/MANAGER/MASTER
import { SlipCleanupPage } from './SlipCleanupPage'
// [PR-E1 FE-1] DPS 입고 비교 (legacy GAS 1번/16번 native 이식 — WAREHOUSE/MASTER/MANAGER/INVENTORY)
import { InventoryDpsComparePage } from './InventoryDpsComparePage'
// [P0-B GAS 보강] 품목별 DPS 분석 (품목별 DPS 입고 pivot — WAREHOUSE/MANAGER/MASTER)
import { DpsByProductPage } from './warehouse/DpsByProductPage'
// [Phase 2.6c] 재고 현황 조회 — 가용/실재고/예약 3구분 (WAREHOUSE/MANAGER/MASTER)
import { InventoryStockBalancePage } from './warehouse/InventoryStockBalancePage'
import { InOutAnalysisPage } from './warehouse/InOutAnalysisPage'
// [PR-E1 FE-6] 배차안내문자 표시·편집·복사 — DISPATCH / MANAGER / MASTER 가드
import { DispatchSmsPage } from './DispatchSmsPage'
// [Phase 10 PR-E1 FE-3] arologis 미배차 리스트 — 일자 필터 + 수동 배차로 이동 link (MASTER/MANAGER/DISPATCH)
import { ArologisUnassignedPage } from './ArologisUnassignedPage'
// [PR-E1 FE-4] 내일자 전표 이미지 페이지 + Designer NextDaySlipView 통합 print route
import { NextDaySlipPage } from './NextDaySlipPage'
import { NextDaySlipView } from '../print/NextDaySlipView'
// [PR-E2 FE-9] 홈택스 일괄 등록 양식 export — ACCOUNTANT/MANAGER/MASTER (BE c48e156).
import { HometaxExportPage } from './HometaxExportPage'
// [PR-E2 FE-8] 거래명세서 일괄 페이지 + Designer StatementBatchView 통합 print route.
// BE: accounting-service `GET /accounting/statements/batch-data` (commit c48e156).
// 인쇄 view 는 Designer commit 69fd8f0 의 page-break per partner 활용.
import { StatementBatchPage } from './StatementBatchPage'
import { StatementBatchView } from '../print/StatementBatchView'
// [PR-E2 FE-7] 거래처별 원장 페이지 + Designer PartnerLedgerView 통합 print route.
// BE: accounting-service `GET /accounting/sales/aggregate` + `/accounting/journals/ledger-data` (commit c48e156).
// 인쇄 view 는 Designer commit 69fd8f0 의 PartnerLedgerView 재사용.
import { PartnerLedgerPage } from './PartnerLedgerPage'
import { PartnerLedgerView } from '../print/PartnerLedgerView'
import { PartnerLedgerBatchView } from '../print/PartnerLedgerBatchView'
// [PR-H3 FE-1] 전표 수정/삭제 요청 처리 대시보드 — WAREHOUSE/MANAGER/MASTER.
// BE: slip-service `GET/POST /api/v1/slips/edit-requests*` (PR-H3 BE-1 슬라이스).
import { SlipEditRequestsPage } from './admin/SlipEditRequestsPage'
// [Issue 4 Slice 4] 회계 수정/삭제 요청 처리 대시보드 — MANAGER/MASTER.
// BE: accounting-service `GET/POST /api/v1/accounting/edit-requests*`.
import { AccountingEditRequestsPage } from './admin/AccountingEditRequestsPage'
// [D-AX-20] 사진 감사 — WAREHOUSE / MANAGER / MASTER.
// Gateway: `/api/v1/slips/admin/photo-audit` -> slip-service `/slips/admin/photo-audit`.
import { PhotoAuditPage } from './admin/PhotoAuditPage'
import { AppReleaseManagementPage } from './admin/AppReleaseManagementPage'
import { AppNoticeManagementPage } from './admin/AppNoticeManagementPage'
import { ActivityLogPage } from './admin/ActivityLogPage'
// [P0-1 Slice A] 재무 보고서 3개 (ACCOUNTANT/MANAGER/MASTER — RoleGuard).
// BE: accounting-service `/accounting/reports/income-statement` + `/balance-sheet`
import { ReportListPage } from './ReportListPage'
import { IncomeStatementPage } from './IncomeStatementPage'
import { MonthlyIncomeStatementPage } from './MonthlyIncomeStatementPage'
import { BalanceSheetPage } from './BalanceSheetPage'
// [P0-1 Slice A] D5 fix — 인쇄 전용 컴포넌트 분리 (새 창 열기 패턴).
// REPORTS-DESIGN.md § 7~8 spec 준수.
import { IncomeStatementPrintLayout } from './accounting/print/IncomeStatementPrintLayout'
import { BalanceSheetPrintLayout } from './accounting/print/BalanceSheetPrintLayout'
// [P0-1 Slice B] 세금/거래처 보고서 4개 (ACCOUNTANT/MANAGER/MASTER — RoleGuard).
// BE: accounting-service `/accounting/reports/vat` + `/corporate-tax` + `/partner-aging`
import { VatReportPage } from './VatReportPage'
import { CorporateTaxReportPage } from './CorporateTaxReportPage'
import { PartnerAgingPage } from './PartnerAgingPage'
// [P0-1 Slice B] 인쇄 전용 레이아웃 3종.
import { VatReportPrintLayout } from './accounting/print/VatReportPrintLayout'
import { CorporateTaxReportPrintLayout } from './accounting/print/CorporateTaxReportPrintLayout'
import { PartnerAgingPrintLayout } from './accounting/print/PartnerAgingPrintLayout'
// [P0-1 Slice C] 분석 보고서 4개 (ACCOUNTANT/MANAGER/MASTER — RoleGuard).
// BE: accounting-service `/accounting/reports/cash-flow` + `/equity-changes` + `/daily-summary` + `/monthly-summary`
import { CashFlowStatementPage } from './CashFlowStatementPage'
import { EquityChangesPage } from './EquityChangesPage'
import { DailySummaryPage } from './DailySummaryPage'
import { MonthlySummaryPage } from './MonthlySummaryPage'
import { JournalStatusReportPage } from './JournalStatusReportPage'
import { AccountStatementPage } from './AccountStatementPage'
import { ReceivablesPayablesPage } from './ReceivablesPayablesPage'
import { NotesReceivablePage } from './NotesReceivablePage'
import { CollectionPlanPage } from './CollectionPlanPage'
import { BankTransactionPage } from './BankTransactionPage'
import { DepositorMappingPage } from './DepositorMappingPage'
import { BankCardAdminPage } from './BankCardAdminPage'
import { CashReceiptListPage } from './CashReceiptListPage'
import { CashReceiptFormPage } from './CashReceiptFormPage'
import { CashReceiptDetailPage } from './CashReceiptDetailPage'
// [P0-1 Slice C] 인쇄 전용 레이아웃 4종.
import { CashFlowStatementPrintLayout } from './accounting/print/CashFlowStatementPrintLayout'
import { EquityChangesPrintLayout } from './accounting/print/EquityChangesPrintLayout'
import { DailySummaryPrintLayout } from './accounting/print/DailySummaryPrintLayout'
import { MonthlySummaryPrintLayout } from './accounting/print/MonthlySummaryPrintLayout'
// [P1-3] 안전재고 알림 — MASTER / MANAGER / WAREHOUSE (창고 운영 그룹).
// BE: inventory-service `GET /inventory/safety-stock-alerts` (P1-3 슬라이스).
import { SafetyStockAlertsPage } from './SafetyStockAlertsPage'
// [D-SER-23] 시리얼 보상 실패 복구 — inventory.list(view) 권한 (WAREHOUSE/MANAGER/MASTER).
// BE: slip-service `GET/PATCH /api/v1/slips/compensation-failures` (D-SER-23 슬라이스).
import { CompensationFailuresPage } from './CompensationFailuresPage'
// [P1-5] arologis 배차 admin 3개 신규 화면 — MANAGER / MASTER.
// - KakaoAutoDispatchPage: 카카오톡 자동 매칭 실행 + 결과 표
// - ManualDispatchAdminPage: 배차 list + 기사 직접 선택 modal
// - DriverAssignmentPage: 가용 기사 + 미배정 배차 2-panel 배정 UI
import { KakaoAutoDispatchPage } from './KakaoAutoDispatchPage'
import { ManualDispatchAdminPage } from './ManualDispatchAdminPage'
import { DriverAssignmentPage } from './DriverAssignmentPage'
// [SP-08-6-5 P2] 일마감 + 원장 신규 화면 (ACCOUNTANT/MANAGER/MASTER — RoleGuard).
// BE: accounting-service `/accounting/daily-closings` + `/accounting/ledgers`
import { DailyClosingPage } from './DailyClosingPage'
import { GeneralLedgerPage } from './GeneralLedgerPage'
import { FundsStatusPage } from './FundsStatusPage'
import { FundsFlowComparisonPage } from './FundsFlowComparisonPage'
import { SalesAccountingSlipPage } from './accounting/SalesAccountingSlipPage'
import { SalesAccountingSlipFormPage } from './accounting/SalesAccountingSlipFormPage'
import { PurchaseAccountingSlipPage } from './accounting/PurchaseAccountingSlipPage'
import { PurchaseAccountingSlipFormPage } from './accounting/PurchaseAccountingSlipFormPage'
import { TaxInvoiceBatchIssuePage } from './accounting/TaxInvoiceBatchIssuePage'
import { TaxInvoiceInboundPage } from './accounting/TaxInvoiceInboundPage'
import { SalesLedgerPage } from './accounting/admin/SalesLedgerPage'
import { PurchaseLedgerPage } from './accounting/admin/PurchaseLedgerPage'
import { MigOpsDashboardPage } from './accounting/admin/MigOpsDashboardPage'
// [P2-3] 월말 마감 — `/accounting/period-close` (ACCOUNTANT/MANAGER/MASTER 진입, 역마감은 MASTER 만).
// 매뉴얼 docs/manual/03-회계/04-월말-마감.md 와 Stage 1 일치.
import { PeriodCloseListPage } from './PeriodCloseListPage'
// [P2-4] 매출 마감 — `/sales/closing` (ACCOUNTANT/MANAGER/MASTER 진입, 역마감은 MASTER 만).
// 일별/월별 toggle + 일별 세금계산서 detail + CSV 다운로드.
// 매뉴얼 docs/manual/02-창고/04-매출-마감.md 와 Stage 1 일치.
import { SalesClosingPage } from './SalesClosingPage'
// [2a 영업·구매 메뉴 통합] 판매관리 / 구매관리 — 풍성한 컬럼 + 다중 선택 + 검색 모달 + 50/page.
// `/sales`, `/purchases` 의 정식 페이지 (기존 SlipListPage 대체). legacy SlipListPage 는
// `/sales/slips`, `/purchases/slips` 로 옮겨 2c 작성 plumbing 합류 전까지 보존.
import { SalesQueryPage } from './sales-query/SalesQueryPage'
import { PurchaseQueryPage } from './purchase-query/PurchaseQueryPage'
// [PR-HR] 403 접근 거부 페이지 — AdminLayout 대표실 부서 가드 + 일반 권한 부족 redirect 대상.
import { ForbiddenPage } from './ForbiddenPage'
// [SP-D1 404] 인앱 한국어 404 페이지 — AuthGuard + AppLayout 내부 catch-all.
import { NotFoundPage } from './NotFoundPage'
// [samhan-dispatch-board Phase A] 배차 메뉴 — DISPATCH / MANAGER / MASTER.
// BE: slip-service `/admin/dispatch-board/*` + `/admin/dispatch-tasks/*` (Phase A spec § 6).
import DispatchBoardPage from './dispatch-board/DispatchBoardPage'
import { DispatchHistoryPage } from './dispatch-board/DispatchHistoryPage'
// [SP-D1] 동적 RBAC 권한설정 화면 — MASTER 전용.
import { PermissionMatrixPage } from './PermissionMatrixPage'
import { PermissionMatrixBulkPage } from './PermissionMatrixBulkPage'
import { PermissionGroupMatrixPage } from './PermissionGroupMatrixPage'
import { PermissionGroupManagePage } from './PermissionGroupManagePage'
import { PermissionDelegationPage } from './PermissionDelegationPage'
import { ApprovalLineConfigPage } from './ApprovalLineConfigPage'
// [SP-D1 cycle 2] 동적 RBAC PermissionGuard — 서버 권한 매트릭스 기반 라우트 가드.
import { PermissionGuard, SlipReadGuard } from '../components/PermissionGuard'
import { RoleGuard } from '../components/RoleGuard'
// §7 그룹웨어 결재 — 목록/상세 + 협업 패널.
import { GroupwareApprovalListPage } from './GroupwareApprovalListPage'
import { GroupwareApprovalDetailPage } from './GroupwareApprovalDetailPage'
import { GroupwareApprovalCreatePage } from './GroupwareApprovalCreatePage'
import { GroupwareApprovalTemplateAdminPage } from './GroupwareApprovalTemplateAdminPage'
import { GroupwareDocumentTemplateAdminPage } from './GroupwareDocumentTemplateAdminPage'
import { DocumentTemplateEditorPage } from './DocumentTemplateEditorPage'
import { MessengerPage } from './MessengerPage'
import { ChatRoomPage } from './ChatRoomPage'
import { ApprovalDocView } from '../print/ApprovalDocView'
// [PR-B] 품목 관리 — 품목별 노출 범위 수동 토글 (products.list VIEW 게이트).
import { ProductCatalogPage } from './ProductCatalogPage'
import { EstimateItemsCatalogPage } from './EstimateItemsCatalogPage'
import { ProductClassificationsPage } from './ProductClassificationsPage'
import { ProductFormPage } from './ProductFormPage'

/**
 * Print route wrapper — `?perRoom=1` query 시 Designer NextDaySlipView 의
 * pageBreakPerRoom prop 활성. NextDaySlipView 자체 보존 (Designer 산출물 무수정).
 */
function NextDaySlipPrintRoute() {
  const [params] = useSearchParams()
  const perRoom = params.get('perRoom') === '1'
  return <NextDaySlipView pageBreakPerRoom={perRoom} />
}

const routes = [
  { path: '/login', element: <LoginPage /> },
  // P0-2 셀프 재설정 — 비인증 최상위 (AuthGuard / AppLayout 미적용)
  // `/auth/password-reset/confirm` 을 `/auth/password-reset` 보다 먼저 등록 (정적 path 우선 매칭).
  { path: '/auth/password-reset/confirm', element: <PasswordResetConfirmPage /> },
  { path: '/auth/password-reset', element: <PasswordResetRequestPage /> },
  // signature-slice-C 모바일 mock — AuthGuard / AppLayout 미적용 (NO AUTH 공개 endpoint 시뮬레이션)
  { path: '/mobile/d/:token/s/:slipNo', element: <MobileSignaturePage /> },
  { path: '/mobile/share/:shareToken', element: <MobileRecipientPage /> },
  {
    element: (
      <AuthGuard>
        <AppLayout />
      </AuthGuard>
    ),
    children: [
      { path: '/', element: <DashboardPage /> },
      { path: '/notifications', element: <NotificationHistoryPage /> },
      {
        path: '/groupware/approvals',
        element: (
          <PermissionGuard pageCode="groupware.approvals" action="view">
            <GroupwareApprovalListPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/groupware/approvals/new',
        element: (
          <PermissionGuard pageCode="groupware.approvals" action="update">
            <GroupwareApprovalCreatePage />
          </PermissionGuard>
        ),
      },
      {
        path: '/groupware/approvals/:id',
        element: (
          <PermissionGuard pageCode="groupware.approvals" action="view">
            <GroupwareApprovalDetailPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/groupware/approvals/:id/print',
        element: (
          <PermissionGuard pageCode="groupware.approvals" action="view">
            <ApprovalDocView />
          </PermissionGuard>
        ),
      },
      {
        path: '/groupware/approval-templates',
        element: (
          <PermissionGuard pageCode="groupware.approval-templates" action="view">
            <GroupwareApprovalTemplateAdminPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/groupware/document-templates',
        element: (
          <PermissionGuard pageCode="groupware.approval-templates" action="view">
            <GroupwareDocumentTemplateAdminPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/groupware/document-templates/:id/edit',
        element: (
          <PermissionGuard pageCode="groupware.approval-templates" action="view">
            <DocumentTemplateEditorPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/messenger',
        element: (
          <PermissionGuard pageCode="messenger.send" action="view">
            <MessengerPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/chat/:roomCode',
        element: (
          <PermissionGuard pageCode="messenger.send" action="view">
            <ChatRoomPage />
          </PermissionGuard>
        ),
      },
      // [SP-D4] inventory.warehouse 동적 RBAC 추가 (기존 미가드 라우트 → PermissionGuard 추가).
      {
        path: '/warehouses',
        element: (
          <PermissionGuard pageCode="inventory.warehouse" action="view">
            <WarehousesPage />
          </PermissionGuard>
        ),
      },

      // [2a 영업·구매 메뉴 통합] 판매관리 — 풍성한 컬럼 + 다중 선택 (SalesQueryPage).
      // 기존 SlipListPage 는 `/sales/slips` 로 이전 — 2c 전표 작성 plumbing 시 활용 예정.
      {
        path: '/sales',
        element: (
          <PermissionGuard pageCode="sales.slip.list" action="view">
            <SlipReadGuard mode="OUTBOUND">
              <SalesQueryPage />
            </SlipReadGuard>
          </PermissionGuard>
        ),
      },
      // [SP-D3] 매출 슬립 목록 — sales.slip.list 동적 RBAC (RoleGuard 이중 가드 유지).
      {
        path: '/sales/slips',
        element: (
          <PermissionGuard pageCode="sales.slip.list" action="view">
            <SlipReadGuard mode="OUTBOUND">
              <SlipListPage mode="OUTBOUND" />
            </SlipReadGuard>
          </PermissionGuard>
        ),
      },
      {
        path: '/sales/new',
        element: (
          <PermissionGuard pageCode="sales.slip.create" action="view">
            <SlipFormPage mode="OUTBOUND" />
          </PermissionGuard>
        ),
      },
      // link-dispatch-slice: 링크발송 (배송 묶음) — MANAGER/MASTER, `/sales/:id` 보다 먼저 매칭되어야 함
      {
        path: '/sales/link-dispatch',
        element: (
          <PermissionGuard pageCode="slip.delivery-batch" action="view">
            <LinkDispatchListPage />
          </PermissionGuard>
        ),
      },

      // [PR-E1 FE-4] 내일자 전표 이미지 — SALES/MANAGER/MASTER (BE @PreAuthorize 일치).
      // `/sales/:id` 보다 먼저 매칭되어야 함 (정적 path 우선).
      {
        path: '/sales/next-day-slip',
        element: (
          <PermissionGuard pageCode="slip.print.next-day" action="view">
            <NextDaySlipPage />
          </PermissionGuard>
        ),
      },
      // [PR-E1 FE-4] 내일자 전표 인쇄 미리보기 — Designer commit 1f85605 NextDaySlipView 통합.
      // `?date=YYYY-MM-DD` 필수, `?perRoom=1` 시 단톡방별 page-break-after 활성.
      {
        path: '/print/next-day-slip',
        element: (
          <PermissionGuard pageCode="slip.print.next-day" action="view">
            <NextDaySlipPrintRoute />
          </PermissionGuard>
        ),
      },

      // P2-1 견적서 SamhanLogis 도메인 (slip-service `/slips/estimates`).
      // legacy webview (EstimateLegacyWebviewPage) 폐기. 정적 path 우선 매칭 의무.
      {
        path: '/sales/estimates',
        element: (
          <PermissionGuard pageCode="estimates.list" action="view">
            <EstimateListPage />
          </PermissionGuard>
        ),
      },
      { path: '/sales/estimates/new', element: <EstimateFormPage /> },
      {
        path: '/sales/partner-orders',
        element: (
          <PermissionGuard pageCode="sales.partner-order.list" action="view">
            <SalesPartnerOrderListPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/sales/partner-orders/:id',
        element: (
          <PermissionGuard pageCode="sales.partner-order.list" action="view">
            <SalesPartnerOrderDetailPage />
          </PermissionGuard>
        ),
      },
      {
        // [Round C P1 #4 FE] 주문서 승인 — 사이드바 노출(showPartnerOrderList)과 동일 page-code 로
        // 라우트도 가드해 사이드바↔진입 역전(노출되나 무가드 직접 진입) 갭을 막는다.
        // BE @RequirePermission 가드는 별도 에이전트가 처리.
        path: '/sales/order-approvals',
        element: (
          <PermissionGuard pageCode="sales.partner-order.list" action="view">
            <SalesOrderApprovalsPage />
          </PermissionGuard>
        ),
      },
        {
          path: '/sales/partner-dc-config',
          element: (
            <PermissionGuard pageCode="sales.partner-dc-config" action="view">
              <SalesPartnerDcConfigPage />
            </PermissionGuard>
          ),
        },
        {
          path: '/sales/estimate-config',
          element: (
            // H1(#17 S4b R1): ACCOUNTANT 는 sales.estimate-config 가 없어도
            // products.price-schedule VIEW 만으로 도달 가능(OR 판정) — 페이지 내부에서
            // estimateConfig 폼/단가변동 섹션을 각자 page-code 로 다시 게이팅한다.
            <PermissionGuard pageCode={['sales.estimate-config', 'products.price-schedule']} action="view">
              <EstimatePricingConfigPage />
            </PermissionGuard>
          ),
        },

        // P0-4 견적서 인쇄 (estimateNumber path param) — Designer commit 5dcbbef QuoteView 재사용.
      // P2-1 견적서 상세/편집 (id UUID path param) — `/sales/:id` 보다 먼저 매칭되어야 함.
      { path: '/sales/estimates/:estimateNumber/print', element: <QuoteView /> },
      { path: '/sales/estimates/:id/edit', element: <EstimateFormPage /> },
      { path: '/sales/estimates/:id', element: <EstimateDetailPage /> },

      // [PR-E1 FE-5] 전표 정리 리스트 — `/sales/:id` 보다 먼저 매칭되어야 함.
      // BE: slip-service `GET /slips/cleanup` (commit 281415f). SALES/MANAGER/MASTER.
      {
        path: '/sales/slip-cleanup',
        element: (
          <PermissionGuard pageCode="slip.cleanup" action="view">
            <SlipCleanupPage />
          </PermissionGuard>
        ),
      },

      {
        path: '/sales/:id',
        element: (
          <SlipReadGuard mode="OUTBOUND" allowApprovalLineCandidate>
            <SlipDetailPage mode="OUTBOUND" />
          </SlipReadGuard>
        ),
      },
      // SP-08-6-4 — 거래명세서 (A4 portrait, legacy GAS 동등). 정적 suffix 먼저 매칭.
      { path: '/sales/:id/print/statement', element: <SalesTransactionStatementPrintPage /> },
      // SP-08-6-4 — 세금계산서 (A4 portrait, 공급자/공급받는자 박스 포함). InvoiceView 대체.
      { path: '/sales/:id/print/invoice', element: <SalesInvoicePrintPage /> },
      { path: '/sales/:id/print/dispatch', element: <DispatchView /> },

      // [2a 영업·구매 메뉴 통합] 구매관리 — 풍성한 컬럼 + 다중 선택 (PurchaseQueryPage).
      // 기존 SlipListPage 는 `/purchases/slips` 로 이전 — 2c 전표 작성 plumbing 시 활용.
      // `/purchases/slips` 는 정적 path 이므로 `/purchases/:id` 보다 먼저 등록.
      {
        path: '/purchases',
        element: (
          <PermissionGuard pageCode="purchases.slip.list" action="view">
            <SlipReadGuard mode="INBOUND">
              <PurchaseQueryPage />
            </SlipReadGuard>
          </PermissionGuard>
        ),
      },
      // [SP-D3] 매입 슬립 목록 — purchases.slip.list 동적 RBAC (RoleGuard 이중 가드 유지).
      {
        path: '/purchases/slips',
        element: (
          <PermissionGuard pageCode="purchases.slip.list" action="view">
            <SlipReadGuard mode="INBOUND">
              <SlipListPage mode="INBOUND" />
            </SlipReadGuard>
          </PermissionGuard>
        ),
      },
      {
        path: '/purchases/new',
        element: (
          <PermissionGuard pageCode="sales.slip.create" action="view">
            <SlipFormPage mode="INBOUND" />
          </PermissionGuard>
        ),
      },
      {
        path: '/purchases/:id',
        element: (
          <PermissionGuard pageCode="purchases.slip.list" action="view">
            <SlipReadGuard mode="INBOUND">
              <SlipDetailPage mode="INBOUND" />
            </SlipReadGuard>
          </PermissionGuard>
        ),
      },
      // SP-08-5-5 — 매입 전표 인쇄 양식 (A4 portrait, 창고/관리자 권한)
      { path: '/purchases/:id/print/purchase', element: <PurchaseSlipPrintPage /> },

      // [Phase 2.6c] 재고 현황 — 가용/실재고/예약 3구분.
      // 접근 허용: WAREHOUSE / MANAGER / MASTER (SALES / ACCOUNTANT / DISPATCH 차단).
      {
        path: '/inventory/stock-balance',
        element: (
          <PermissionGuard pageCode="accounting.sales-slip.list" action="view">
            <InventoryStockBalancePage />
          </PermissionGuard>
        ),
      },
      {
        path: '/inventory/inout-analysis',
        element: (
          <PermissionGuard pageCode="inventory.stock-balance" action="view">
            <InOutAnalysisPage />
          </PermissionGuard>
        ),
      },

      // 재고이동
      // [SP-D4] inventory.stock-transfer 동적 RBAC 추가 (기존 미가드 라우트 → PermissionGuard 추가).
      {
        path: '/transfers',
        element: (
          <PermissionGuard pageCode="inventory.stock-transfer" action="view">
            <TransferListPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/transfers/new',
        element: (
          <PermissionGuard pageCode="inventory.stock-transfer" action="view">
            <TransferFormPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/transfers/:id',
        element: (
          <PermissionGuard pageCode="inventory.stock-transfer" action="view">
            <TransferDetailPage />
          </PermissionGuard>
        ),
      },

      // Phase 10 P0-2 — 본인 비밀번호 변경 (모든 인증 사용자 접근 가능)
      { path: '/password/change', element: <PasswordChangePage /> },

      // accounting-slice-A — 회계 라우트 5종 (ACCOUNTANT/MANAGER/MASTER)
      {
        path: '/accounting/accounts',
        element: (
          <PermissionGuard pageCode="accounting.accounts" action="view">
            <AccountTreePage />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/journals',
        element: (
          <PermissionGuard pageCode="accounting.journals" action="view">
            <JournalListPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/journals/new',
        element: (
          <PermissionGuard pageCode="accounting.journals" action="view">
            <JournalFormPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/journals/:id/edit',
        element: (
          <PermissionGuard pageCode="accounting.journals" action="view">
            <JournalFormPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/journals/:id',
        element: (
          <PermissionGuard pageCode="accounting.journals" action="view">
            <JournalDetailPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/balances',
        element: (
          <PermissionGuard pageCode="accounting.balances" action="view">
            <TrialBalancePage />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/sales-commission-settlements',
        element: (
          <PermissionGuard pageCode="accounting.sales-commission-settlement" action="view">
            <SalesCommissionSettlementListPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/sales-commission-settlements/:id',
        element: (
          <PermissionGuard pageCode="accounting.sales-commission-settlement" action="view">
            <SalesCommissionSettlementDetailPage />
          </PermissionGuard>
        ),
      },

      // [P0-1 Slice A] 재무 보고서 — 손익계산서 / 재무상태표 / 보고서 목록.
      // ACCOUNTANT / MASTER 만. 정적 path 우선 매칭 필수.
      {
        path: '/accounting/reports',
        element: (
          <PermissionGuard pageCode="accounting.reports" action="view">
            <ReportListPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/reports/income-statement',
        element: (
          <PermissionGuard pageCode="accounting.reports" action="view">
            <IncomeStatementPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/reports/income-statement/monthly',
        element: (
          <PermissionGuard pageCode="accounting.reports" action="view">
            <MonthlyIncomeStatementPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/reports/balance-sheet',
        element: (
          <PermissionGuard pageCode="accounting.reports" action="view">
            <BalanceSheetPage />
          </PermissionGuard>
        ),
      },
      // [P0-1 Slice A D5] 인쇄 전용 라우트 — 새 창 열기 패턴. AuthGuard 안쪽 유지.
      // `/income-statement` 보다 먼저 매칭되도록 정적 `/print` suffix 먼저 등록.
      {
        path: '/accounting/reports/income-statement/print',
        element: (
          <PermissionGuard pageCode="accounting.reports" action="view">
            <IncomeStatementPrintLayout />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/reports/balance-sheet/print',
        element: (
          <PermissionGuard pageCode="accounting.reports" action="view">
            <BalanceSheetPrintLayout />
          </PermissionGuard>
        ),
      },

      // [P0-1 Slice B] 세금/거래처 보고서 4개 — ACCOUNTANT/MANAGER/MASTER.
      // 정적 `/print` suffix 먼저 등록 (부모 라우트 매칭 우선).
      {
        path: '/accounting/reports/vat',
        element: (
          <PermissionGuard pageCode="accounting.reports" action="view">
            <VatReportPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/reports/vat/print',
        element: (
          <PermissionGuard pageCode="accounting.reports" action="view">
            <VatReportPrintLayout />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/reports/corporate-tax',
        element: (
          <PermissionGuard pageCode="accounting.reports" action="view">
            <CorporateTaxReportPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/reports/corporate-tax/print',
        element: (
          <PermissionGuard pageCode="accounting.reports" action="view">
            <CorporateTaxReportPrintLayout />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/reports/partner-aging',
        element: (
          <PermissionGuard pageCode="accounting.reports" action="view">
            <PartnerAgingPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/reports/partner-aging/print',
        element: (
          <PermissionGuard pageCode="accounting.reports" action="view">
            <PartnerAgingPrintLayout />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/reports/notes-receivable',
        element: (
          <PermissionGuard pageCode="accounting.receivables" action="view">
            <NotesReceivablePage />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/reports/collection-plans',
        element: (
          <PermissionGuard pageCode="accounting.receivables" action="view">
            <CollectionPlanPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/bank-card-admin',
        element: (
          <PermissionGuard pageCode="accounting.bank-card-admin" action="view">
            <BankCardAdminPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/deposit-mappings',
        element: (
          <PermissionGuard pageCode="accounting.deposit-mapping" action="view">
            <DepositorMappingPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/bank-transactions',
        element: (
          <PermissionGuard pageCode="accounting.bank-matching" action="view">
            <BankTransactionPage />
          </PermissionGuard>
        ),
      },

      // [P0-1 Slice C] 分析 보고서 4종 — ACCOUNTANT/MANAGER/MASTER.
      // 정적 `/print` suffix 먼저 등록 (부모 라우트 매칭 우선).
      {
        path: '/accounting/reports/cash-flow',
        element: (
          <PermissionGuard pageCode="accounting.reports" action="view">
            <CashFlowStatementPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/reports/cash-flow/print',
        element: (
          <PermissionGuard pageCode="accounting.reports" action="view">
            <CashFlowStatementPrintLayout />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/reports/equity-changes',
        element: (
          <PermissionGuard pageCode="accounting.reports" action="view">
            <EquityChangesPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/reports/equity-changes/print',
        element: (
          <PermissionGuard pageCode="accounting.reports" action="view">
            <EquityChangesPrintLayout />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/reports/daily-summary',
        element: (
          <PermissionGuard pageCode="accounting.reports" action="view">
            <DailySummaryPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/reports/daily-summary/print',
        element: (
          <PermissionGuard pageCode="accounting.reports" action="view">
            <DailySummaryPrintLayout />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/reports/monthly-summary',
        element: (
          <PermissionGuard pageCode="accounting.reports" action="view">
            <MonthlySummaryPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/reports/monthly-summary/print',
        element: (
          <PermissionGuard pageCode="accounting.reports" action="view">
            <MonthlySummaryPrintLayout />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/reports/journal-status',
        element: (
          <PermissionGuard pageCode="accounting.reports" action="view">
            <JournalStatusReportPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/reports/account-statement',
        element: (
          <PermissionGuard pageCode="accounting.reports" action="view">
            <AccountStatementPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/funds/status',
        element: (
          <PermissionGuard pageCode="accounting.reports" action="view">
            <FundsStatusPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/reports/receivables-payables',
        element: (
          <PermissionGuard pageCode="accounting.reports" action="view">
            <ReceivablesPayablesPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/reports/funds-flow-comparison',
        element: (
          <PermissionGuard pageCode="accounting.reports" action="view">
            <FundsFlowComparisonPage />
          </PermissionGuard>
        ),
      },

      // [PR-E2 FE-9] 홈택스 일괄 등록 양식 — ACCOUNTANT / MANAGER / MASTER.
      // BE: accounting-service `GET /accounting/tax-invoice/hometax-export` (commit c48e156).
      {
        path: '/accounting/hometax-export',
        element: (
          <PermissionGuard pageCode="accounting.partner-ledger" action="view">
            <HometaxExportPage />
          </PermissionGuard>
        ),
      },

      // [PR-E2 FE-8] 거래명세서 일괄 — ACCOUNTANT / MASTER.
      // BE: accounting-service `GET /accounting/statements/batch-data` (commit c48e156).
      // 다중 선택 → /print/statement-batch 진입 (page-break per partner).
      {
        path: '/accounting/statement-batch',
        element: (
          <PermissionGuard pageCode="accounting.statement-batch" action="view">
            <StatementBatchPage />
          </PermissionGuard>
        ),
      },
      // [PR-E2 FE-8] 거래명세서 일괄 인쇄 미리보기 — Designer commit 69fd8f0 StatementBatchView 통합.
      // `?from=&to=&selectionKeys=A&selectionKeys=B` (selectionKeys 미지정 시 전체).
      {
        path: '/print/statement-batch',
        element: (
          <PermissionGuard pageCode="accounting.statement-batch" action="view">
            <StatementBatchView />
          </PermissionGuard>
        ),
      },

      // [PR-E2 FE-7] 거래처별 원장 생성 — ACCOUNTANT / MANAGER / MASTER.
      // BE: accounting-service `GET /accounting/sales/aggregate` (BE-A8) +
      //     `GET /accounting/journals/ledger-data` (BE-A9) (commit c48e156).
      // 집계 → 원장 detail → 인쇄 / 일괄 인쇄 / CSV 다운로드 통합.
      {
        path: '/accounting/partner-ledger',
        element: (
          <PermissionGuard pageCode="accounting.partner-ledger" action="view">
            <PartnerLedgerPage />
          </PermissionGuard>
        ),
      },
      // [PR-E2 FE-7] 거래처 원장 인쇄 미리보기 — Designer commit 69fd8f0 PartnerLedgerView 통합.
      // `?partnerCode=&from=&to=` 필수.
      {
        path: '/print/partner-ledger',
        element: (
          <PermissionGuard pageCode="accounting.partner-ledger" action="view">
            <PartnerLedgerView />
          </PermissionGuard>
        ),
      },
      {
        path: '/print/partner-ledger-batch',
        element: (
          <PermissionGuard pageCode="accounting.partner-ledger" action="view">
            <PartnerLedgerBatchView />
          </PermissionGuard>
        ),
      },

      // [Phase 10 P1-5] arologis 수동 배차 admin UI — MASTER / MANAGER (backlog DISPATCH).
      {
        path: '/arologis/manual',
        element: (
          <PermissionGuard pageCode="arologis.dispatch.admin" action="view">
            <ArologisManualDispatchPage />
          </PermissionGuard>
        ),
      },

      // [Phase 10 PR-E1 FE-2] arologis 가배차 분류 admin UI — MASTER / MANAGER / DISPATCH.
      // 출고전표 자동 조회 → 권역 (REGION 마스터) + 시도 (광역 prefix) 2-탭 통합.
      {
        path: '/arologis/pre-classify',
        element: (
          <PermissionGuard pageCode="arologis.dispatch.ops" action="view">
            <ArologisPreClassifyPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/admin/carriers',
        element: (
          <PermissionGuard pageCode="hr.carriers" action="view">
            <CarrierListPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/admin/dispatch-groups',
        element: (
          <PermissionGuard pageCode="dispatch.board" action="view">
            <DispatchGroupPage />
          </PermissionGuard>
        ),
      },

      // [Phase 10 PR-E1 FE-3] arologis 미배차 리스트 — MASTER / MANAGER / DISPATCH.
      // 일자 단일 필터 + dispatch 미할당 슬립 표 + "수동 배차로 이동" link (/arologis/manual 자동 채움).
      {
        path: '/arologis/unassigned',
        element: (
          <PermissionGuard pageCode="arologis.dispatch.ops" action="view">
            <ArologisUnassignedPage />
          </PermissionGuard>
        ),
      },

      // [Phase 10 PR-E1 FE-6] 배차안내문자 미리보기·편집·복사 — DISPATCH / MANAGER / MASTER.
      // 출고전표 자동 조회 + 단톡방 매핑 + blocked 가드 + 하차일별 안내 문구.
      {
        path: '/arologis/dispatch-sms',
        element: (
          <PermissionGuard pageCode="notification.dispatch-sms.display" action="view">
            <DispatchSmsPage />
          </PermissionGuard>
        ),
      },

      // [samhan-dispatch-board Phase A] 배차 메뉴 — DISPATCH / MANAGER / MASTER.
      // 미배차 출고전표 50/page + 차량 그룹 (9 종류) + drag-and-drop + arologis 발송.
      // BE: slip-service `/admin/dispatch-board/*` + `/admin/dispatch-tasks/*`.
      {
        path: '/dispatch-board',
        element: (
          <PermissionGuard pageCode="dispatch.board" action="view">
            <DispatchBoardPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/dispatch-board/history',
        element: (
          <PermissionGuard pageCode="dispatch.board" action="view">
            <DispatchHistoryPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/dispatch/external-dispatch/:id/print',
        element: (
          <PermissionGuard pageCode="dispatch.board" action="view">
            <ExternalDispatchRequestView />
          </PermissionGuard>
        ),
      },

      // [PR-F1 FE-2] arologis 운송사 실배차 비교 — DISPATCH / MANAGER / MASTER.
      // legacy GAS 11번 이식 + multipart `POST /admin/arologis/dispatch/reconcile`.
      {
        path: '/arologis/dispatch-reconcile',
        element: (
          <PermissionGuard pageCode="arologis.dispatch.ops" action="view">
            <ArologisDispatchReconcilePage />
          </PermissionGuard>
        ),
      },

      // [P1-5] arologis 배차 admin 신규 3개 라우트 — MANAGER / MASTER.
      // 매뉴얼: docs/manual/05-arologis/01-카카오톡-배차.md (Frontend admin UI ✅)
      //         docs/manual/05-arologis/02-수동-배차.md     (정식 admin 배차 UI ✅)
      //         docs/manual/05-arologis/03-기사-배정.md     (Frontend admin 배정 UI ✅)
      {
        path: '/arologis/admin/auto-dispatch',
        element: (
          <PermissionGuard pageCode="arologis.admin" action="view">
            <KakaoAutoDispatchPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/arologis/admin/manual-dispatch',
        element: (
          <PermissionGuard pageCode="arologis.admin" action="view">
            <ManualDispatchAdminPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/arologis/admin/driver-assignment',
        element: (
          <PermissionGuard pageCode="arologis.admin" action="view">
            <DriverAssignmentPage />
          </PermissionGuard>
        ),
      },

      // [Phase 10 P2-4 / slice 8] 매출 마감 — 매뉴얼 docs/manual/02-창고/04-매출-마감.md 경로 일치.
      // 진입 가드 ACCOUNTANT/MANAGER/MASTER (역마감 버튼은 페이지 내부에서 MASTER 만 노출).
      {
        path: '/warehouse/closing',
        element: (
          <PermissionGuard pageCode="accounting.period-close" action="view">
            <MonthEndClosingPage />
          </PermissionGuard>
        ),
      },

      // [SP-08-6-5 P2] 일마감 관련 슬립 목록 — ACCOUNTANT/MANAGER/MASTER.
      {
        path: '/accounting/sales-slips',
        element: (
          <PermissionGuard pageCode="accounting.sales-slip.accounting" action="view">
            <SalesAccountingSlipPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/sales-slips/new',
        element: (
          <PermissionGuard pageCode="accounting.sales-slip.accounting" action="create">
            <SalesAccountingSlipFormPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/purchase-slips',
        element: (
          <PermissionGuard pageCode="accounting.purchase-slip.accounting" action="view">
            <PurchaseAccountingSlipPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/purchase-slips/new',
        element: (
          <PermissionGuard pageCode="accounting.purchase-slip.accounting" action="create">
            <PurchaseAccountingSlipFormPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/admin/ledger/sales',
        element: (
          <PermissionGuard pageCode="ecount.mig14.ledger" action="view">
            <SalesLedgerPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/admin/ledger/purchase',
        element: (
          <PermissionGuard pageCode="ecount.mig14.ledger" action="view">
            <PurchaseLedgerPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/admin/migration-ops',
        element: (
          <PermissionGuard pageCode="ecount.mig.ops-dashboard" action="view">
            <MigOpsDashboardPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/admin/cash-receipts',
        element: (
          <PermissionGuard pageCode="accounting.cash-receipts" action="view">
            <CashReceiptListPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/admin/cash-receipts/new',
        element: <Navigate to="/accounting/admin/cash-receipts" replace />,
      },
      {
        path: '/accounting/admin/cash-receipts/:id/edit',
        element: (
          <PermissionGuard pageCode="accounting.cash-receipts" action="update">
            <CashReceiptFormPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/admin/cash-receipts/:id',
        element: (
          <PermissionGuard pageCode="accounting.cash-receipts" action="view">
            <CashReceiptDetailPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/daily-closings',
        element: (
          <PermissionGuard pageCode="accounting.daily-closing" action="view">
            <DailyClosingPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/daily-closing',
        element: (
          <PermissionGuard pageCode="accounting.daily-closing" action="view">
            <DailyClosingPage />
          </PermissionGuard>
        ),
      },

      // [SP-08-6-5 P2] 원장 — `/accounting/ledgers` (ACCOUNTANT/MANAGER/MASTER 진입).
      // 기간 + 계정/거래처 필터 + 라인 테이블 + CSV 다운로드 + 출력.
      // BE: accounting-service `GET /accounting/ledgers`.
      {
        path: '/accounting/ledgers',
        element: (
          <PermissionGuard pageCode="accounting.general-ledger" action="view">
            <GeneralLedgerPage />
          </PermissionGuard>
        ),
      },

      // [P2-3] 월말 마감 — `/accounting/period-close` (ACCOUNTANT/MANAGER/MASTER 진입).
      // 매뉴얼 docs/manual/03-회계/04-월말-마감.md Stage 1 일치.
      {
        path: '/accounting/period-close',
        element: (
          <PermissionGuard pageCode="accounting.period-close" action="view">
            <PeriodCloseListPage />
          </PermissionGuard>
        ),
      },


      // [2a 메뉴 통합] `/sales/query` / `/purchases/query` 는 기존 deep-link / bookmark
      // 호환을 위한 alias — 사이드바에서는 제거되었고 `/sales`, `/purchases` 가 정식.
      {
        path: '/sales/query',
        element: (
          <PermissionGuard pageCode="sales.slip.list" action="view">
            <SlipReadGuard mode="OUTBOUND">
              <SalesQueryPage />
            </SlipReadGuard>
          </PermissionGuard>
        ),
      },
      {
        path: '/purchases/query',
        element: (
          <PermissionGuard pageCode="purchases.slip.list" action="view">
            <SlipReadGuard mode="INBOUND">
              <PurchaseQueryPage />
            </SlipReadGuard>
          </PermissionGuard>
        ),
      },

      // [PR-HR] 403 접근 거부 페이지 — AdminLayout 대표실 부서 가드 + 일반 권한 부족 redirect 대상.
      { path: '/forbidden', element: <ForbiddenPage /> },

      // [P2-4] 매출 마감 — `/sales/closing` (ACCOUNTANT/MANAGER/MASTER 진입).
      // 일별/월별 toggle + 세금계산서 detail + CSV.
      // 매뉴얼 docs/manual/02-창고/04-매출-마감.md Stage 1 일치.
      // 정적 path 이므로 `/sales/:id` 보다 먼저 매칭됨 (react-router 정적 우선 규칙).
      {
        path: '/sales/closing',
        element: (
          <PermissionGuard pageCode="accounting.period-close" action="view">
            <SalesClosingPage />
          </PermissionGuard>
        ),
      },

      // [supplier-profile + datagrid] 공급자 설정 — ACCOUNTANT (read) / MANAGER / MASTER (write).
      // BE: accounting-service `/api/v1/accounting/supplier-profiles`
      // 정적 path 이므로 `/accounting/tax-invoices/:id` 등과 충돌 없음.
      {
        path: '/accounting/supplier-profiles',
        element: (
          <PermissionGuard pageCode="accounting.partner-ledger" action="view">
            <SupplierProfilePage />
          </PermissionGuard>
        ),
      },

      // P0-4 세금계산서 — accounting-service `/accounting/tax-invoices/*` (commit f8b8b49).
      // ACCOUNTANT / MASTER 만. 정적 path (`/new`) 우선, 다음 print, 마지막 `:id`.
      {
        path: '/accounting/tax-invoices',
        element: (
          <PermissionGuard pageCode="accounting.tax-invoice.list" action="view">
            <TaxInvoiceListPage />
          </PermissionGuard>
        ),
      },
      // GAS 이식 — 세금계산서 일괄발행 4탭 (ACCOUNTANT / MANAGER / MASTER).
      // 정적 path (`/batch`) → `/accounting/tax-invoices/:id` 보다 먼저 매칭되어야 함.
      {
        path: '/accounting/tax-invoices/batch',
        element: (
          <PermissionGuard pageCode="accounting.tax-invoice.batch-issue" action="view">
            <TaxInvoiceBatchIssuePage />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/tax-invoices/inbound',
        element: (
          <PermissionGuard pageCode="accounting.tax-invoice.inbound.manage" action="view">
            <TaxInvoiceInboundPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/tax-invoices/new',
        element: (
          <PermissionGuard pageCode="accounting.tax-invoice.list" action="create">
            <TaxInvoiceFormPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/tax-invoices/:id/print',
        element: (
          <PermissionGuard pageCode="accounting.tax-invoice.list" action="view">
            <TaxInvoiceView />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/tax-invoices/:id/edit',
        element: (
          <PermissionGuard pageCode="accounting.tax-invoice.list" action="update">
            <TaxInvoiceFormPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/accounting/tax-invoices/:id',
        element: (
          <PermissionGuard pageCode="accounting.tax-invoice.list" action="view">
            <TaxInvoiceDetailPage />
          </PermissionGuard>
        ),
      },

      // [P0-6] 거래처 4탭 신규 등록/목록 — SALES / MANAGER / MASTER.
      // AdminLayout (MASTER 전용) 외부 — SALES/MANAGER 도 생성 후 목록 복귀 가능.
      {
        path: '/admin/partners/new',
        element: (
          <PermissionGuard pageCode="partners.4tab" action="create">
            <AdminPartnerCreatePage />
          </PermissionGuard>
        ),
      },
      {
        path: '/admin/partners',
        element: (
          <PermissionGuard pageCode="partners.list" action="view">
            <AdminPartnersPage />
          </PermissionGuard>
        ),
      },

      // [PR-B] 품목 관리 — 품목별 노출 범위 수동 토글 (products.list VIEW 게이트).
      // 토글/복귀 CTA 는 페이지 내부에서 products.admin UPDATE canAccess 로 read-only 전환.
      {
        path: '/products/catalog',
        element: (
          <PermissionGuard pageCode="products.list" action="view">
            <ProductCatalogPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/products/estimate-items',
        element: (
          <PermissionGuard pageCode="products.list" action="view">
            <EstimateItemsCatalogPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/products/classifications',
        element: (
          <PermissionGuard pageCode="products.list" action="view">
            <ProductClassificationsPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/products/new',
        element: (
          <PermissionGuard pageCode="products.admin" action="create">
            <ProductFormPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/products/:modelCode/edit',
        element: (
          <PermissionGuard pageCode="products.admin" action="update">
            <ProductFormPage />
          </PermissionGuard>
        ),
      },

      // [SP-04] 일반 사이드바에서 직접 노출되는 admin-origin 운영 화면.
      // AdminLayout 은 MASTER+대표실 전용이므로 MANAGER 공용 메뉴는 별도 route 로 분리한다.
      {
        path: '/admin/sheet-sync',
        element: (
          <PermissionGuard pageCode="products.sync" action="view">
            <AdminSheetSyncPage />
          </PermissionGuard>
        ),
      },
      // [SP-D4 TM cross-check fix → C2a] partners.block PermissionGuard 단일 게이트.
      {
        path: '/admin/blocked-partners',
        element: (
          <PermissionGuard pageCode="partners.block" action="view">
            <AdminBlockedPartnersPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/admin/aligo-address-book',
        element: (
          <PermissionGuard pageCode="aligo.address-book" action="view">
            <AdminAligoAddressBookPage />
          </PermissionGuard>
        ),
      },

      // [Phase 10 P0-5 / slice 4] 관리자 통합 admin — MASTER 전용 (대표실 부서 추가 가드 포함).
      // AdminLayout 자체에 RoleGuard(MASTER) + useQuery(is-executive-office) 이중 가드.
      // outlet children 은 AdminLayout 이 통과한 후이므로 별도 가드 불필요.
      // [SP-D4] admin.employees / admin.users 동적 RBAC 추가 (AdminLayout MASTER 가드 유지).
      {
        path: '/admin',
        element: <AdminLayout />,
        children: [
          // [PR-HR] 신규 인사 등록 — /admin/users/new (정적 path 우선 매칭).
          {
            path: 'users/new',
            element: (
              <PermissionGuard pageCode="admin.employees" action="view">
                <AdminUsersPage />
              </PermissionGuard>
            ),
          },
          {
            path: 'users',
            element: (
              <PermissionGuard pageCode="admin.employees" action="view">
                <AdminUsersPage />
              </PermissionGuard>
            ),
          },
          { path: 'roles', element: <AdminRolesPage /> },
          { path: 'warehouses', element: <AdminWarehousesPage /> },
          { path: 'departments', element: <AdminDepartmentsPage /> },
          // admin 중첩 레이아웃 내 미매칭 URL → 한국어 404
          { path: '*', element: <NotFoundPage /> },
        ],
      },

      // [SP-D1] 권한설정 — MASTER 전용.
      // AdminLayout (대표실 부서 이중 가드) 외부에 단독 라우트로 배치.
      // 접근 시도 시 MASTER 가 아니면 홈 redirect.
      // [SP-D6-1] system.permission-admin 동적 RBAC 추가 (RoleGuard 이중 가드 유지).
      {
        path: '/admin/permission-matrix',
        element: (
          <PermissionGuard pageCode="system.permission-admin" action="view">
            <PermissionMatrixPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/admin/permission-matrix/bulk',
        element: (
          <PermissionGuard pageCode="system.permission-admin" action="view">
            <PermissionMatrixBulkPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/admin/permission-groups/matrix',
        element: (
          <PermissionGuard pageCode="system.permission-admin" action="view">
            <PermissionGroupMatrixPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/admin/permission-groups/manage',
        element: (
          <PermissionGuard pageCode="system.permission-admin" action="view">
            <PermissionGroupManagePage />
          </PermissionGuard>
        ),
      },
      {
        path: '/admin/permission-groups/delegation',
        element: (
          <PermissionGuard pageCode="system.permission-admin" action="view">
            <PermissionDelegationPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/admin/approval-line-config',
        element: (
          <PermissionGuard pageCode="admin.approval-line-config" action="view">
            <ApprovalLineConfigPage />
          </PermissionGuard>
        ),
      },

      // [PR-D Phase B FE-B] arologis 지역 관리 — DISPATCH 조회 + MANAGER/MASTER 관리.
      // AdminLayout (MASTER 전용) 외부에 배치하여 MANAGER 도 접근 가능.
      {
        path: '/admin/regions',
        element: (
          <PermissionGuard pageCode="arologis.region" action="view">
            <AdminRegionsPage />
          </PermissionGuard>
        ),
      },

      // [외부기사/배송사 마스터 슬2] 타배송사 SMS/인쇄 발송 대상 관리.
      {
        path: '/admin/external-carriers',
        element: (
          <PermissionGuard pageCode="dispatch.external-carriers" action="view">
            <AdminExternalCarriersPage />
          </PermissionGuard>
        ),
      },

      // [출고전표 마감시간 설정] 인사 메뉴 — MASTER/MANAGER (hr.slip-cutoff view).
      // BE: slip-service GET/POST/PATCH/DELETE /admin/slip-cutoffs (no-strip).
      {
        path: '/admin/slip-cutoff',
        element: (
          <PermissionGuard pageCode="hr.slip-cutoff" action="view">
            <AdminSlipCutoffConfigPage />
          </PermissionGuard>
        ),
      },

      // [PR-D Phase B FE-D] 단톡방 매핑 — MASTER / MANAGER (BE @PreAuthorize 일치).
      // AdminLayout (MASTER 전용) 외부에 배치하여 MANAGER 도 접근 가능.
      {
        path: '/admin/chat-rooms',
        element: (
          <PermissionGuard pageCode="messenger.admin" action="view">
            <AdminChatRoomsPage />
          </PermissionGuard>
        ),
      },

      // [PR-H3 FE-1] 전표 수정/삭제 요청 대시보드 — WAREHOUSE / MANAGER / MASTER.
      // 리뷰어 대시보드 — BE `GET /api/v1/slips/edit-requests` 가 slip.edit-requests.decide(VIEW) 요구.
      // [C2b] 따라서 라우트도 slip.edit-requests.decide 로 게이팅(seed MASTER/MANAGER). 구 RoleGuard 의
      // REVIEWER 역할셋(WAREHOUSE 포함)은 BE 가 실제론 decide 로 막으므로 decide 가 정합.
      {
        path: '/admin/slip-edit-requests',
        element: (
          <PermissionGuard pageCode="slip.edit-requests.decide" action="view">
            <SlipEditRequestsPage />
          </PermissionGuard>
        ),
      },
      // [Issue 4 Slice 4] 회계 수정/삭제 요청 대시보드 — MANAGER / MASTER.
      // AdminLayout (MASTER 전용) 외부에 배치 — 회계 관리자 공용 자체 RoleGuard.
      // BE: accounting-service `GET /api/v1/accounting/edit-requests?targetRole=MANAGER`.
      {
        path: '/admin/accounting-edit-requests',
        element: (
          <PermissionGuard pageCode="accounting.edit-requests.decide" action="view">
            <AccountingEditRequestsPage />
          </PermissionGuard>
        ),
      },
      // [D-AX-20] 사진 감사 — WAREHOUSE / MANAGER / MASTER.
      // AdminLayout (MASTER 전용) 외부에 배치 — 창고 직원도 접근 가능.
      {
        path: '/admin/photo-audit',
        element: (
          <PermissionGuard pageCode="slip.photo-audit" action="view">
            <PhotoAuditPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/admin/app-notices',
        element: (
          <PermissionGuard pageCode="dev.popup-notice" action="view">
            <AppNoticeManagementPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/admin/activity-logs',
        element: (
          <PermissionGuard pageCode="dev.activity-log" action="view">
            <ActivityLogPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/admin/app-releases',
        element: (
          <PermissionGuard pageCode="admin.app-release" action="view">
            <AppReleaseManagementPage />
          </PermissionGuard>
        ),
      },

      // [P0-9] 입고 검수 목록 — WAREHOUSE / MANAGER / MASTER.
      // 매뉴얼 docs/manual/02-창고/01-입고-처리.md 검수 UI ✅.
      {
        path: '/warehouse/inbound-inspections',
        element: (
          <PermissionGuard pageCode="inbound.inspection" action="view">
            <InboundInspectionListPage />
          </PermissionGuard>
        ),
      },

      // [Phase 10 P2-6 / slice 9] 재고 실사 — WAREHOUSE / MASTER 만.
      // 매뉴얼 docs/manual/02-창고/05-재고-실사.md 와 경로 일치.
      {
        path: '/warehouse/audit',
        element: (
          <PermissionGuard pageCode="inventory.audit" action="view">
            <InventoryAuditListPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/warehouse/audit/new',
        element: (
          <PermissionGuard pageCode="inventory.audit" action="view">
            <InventoryAuditFormPage />
          </PermissionGuard>
        ),
      },
      {
        path: '/warehouse/audit/:id',
        element: (
          <PermissionGuard pageCode="inventory.audit" action="view">
            <InventoryAuditDetailPage />
          </PermissionGuard>
        ),
      },


      // [PR-E1 FE-1] DPS 입고 비교 — WAREHOUSE / MASTER / MANAGER / INVENTORY.
      // BE: inventory-service `/warehouse/audit/dps-compare` (commit 4b14084).
      {
        path: '/warehouse/dps-compare',
        element: (
          <PermissionGuard pageCode="inventory.dps" action="view">
            <InventoryDpsComparePage />
          </PermissionGuard>
        ),
      },

      // [P0-B GAS 보강] 품목별 DPS 분析 — WAREHOUSE / MANAGER / MASTER.
      // BE: inventory-service `GET /warehouse/audit/dps-compare/by-product`
      // 정적 path — `/warehouse/dps-compare` 뒤에 등록 (정적 path 우선 react-router 규칙 준수).
      {
        path: '/warehouse/dps-compare/by-product',
        element: (
          <PermissionGuard pageCode="inventory.dps" action="view">
            <DpsByProductPage />
          </PermissionGuard>
        ),
      },

      // [P1-3] 안전재고 알림 목록 — MASTER / MANAGER / WAREHOUSE.
      // 매뉴얼 docs/manual/02-창고/03-재고-조회.md 안전재고 알림 섹션 ✅.
      // BE: inventory-service `GET /inventory/safety-stock-alerts` (P1-3 슬라이스).
      {
        path: '/inventory/safety-stock-alerts',
        element: (
          <PermissionGuard pageCode="inventory.safety-stock" action="view">
            <SafetyStockAlertsPage />
          </PermissionGuard>
        ),
      },

      // [D-SER-23] 시리얼 보상 실패 복구 — inventory.list(view) 권한.
      // 창고 운영 그룹 진입점. BE: slip-service GET/PATCH /api/v1/slips/compensation-failures.
      {
        path: '/inventory/compensation-failures',
        element: (
          <PermissionGuard pageCode="inventory.list" action="view">
            <CompensationFailuresPage />
          </PermissionGuard>
        ),
      },

      // [SP-D1 404] 인앱 한국어 404 — AuthGuard + AppLayout 내부 미매칭 catch-all.
      // 로그인 사용자가 존재하지 않는 URL 진입 시 사이드바를 유지한 채 한국어 404 렌더.
      // 비인증 최상위 미매칭은 AuthGuard 가 /login 으로 redirect (현행 유지, 별도 처리 불필요).
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]

// 웹 배포(vite.web.config: VITE_PLATFORM='web')만 BrowserRouter(서버 SPA fallback 전제).
// Electron(file://) 및 mock/dev 렌더러는 새로고침 404 회피 위해 HashRouter.
const isWebDeploy = import.meta.env['VITE_PLATFORM'] === 'web'
const createPlatformRouter = isWebDeploy ? createBrowserRouter : createHashRouter
const router = createPlatformRouter(routes)

/**
 * 앱 루트가 import 하는 RouterProvider wrapper.
 */
export function AppRouter() {
  return <RouterProvider router={router} />
}
