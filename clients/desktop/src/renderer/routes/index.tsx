/**
 * 라우트 정의 — `HashRouter` 기반.
 *
 * Electron 의 `file://` 프로토콜에서는 `BrowserRouter` 의 history mode 가
 * 새로고침 시 404 를 일으키므로 `createHashRouter` 를 사용한다.
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
 * 기존 PR #18 의 `/slips`, `/slips/new` 라우트는 폐기.
 */
import {
  createHashRouter,
  RouterProvider,
  useSearchParams,
} from 'react-router-dom'
import { AuthGuard } from '../components/AuthGuard'
import { AppLayout } from '../components/AppLayout'
import { RoleGuard } from '../components/RoleGuard'
import { LoginPage } from './LoginPage'
import { DashboardPage } from './DashboardPage'
import { WarehousesPage } from './WarehousesPage'
import { SlipListPage } from './SlipListPage'
import { SlipFormPage } from './SlipFormPage'
import { SlipDetailPage } from './SlipDetailPage'
import { TransferListPage } from './TransferListPage'
import { TransferFormPage } from './TransferFormPage'
import { TransferDetailPage } from './TransferDetailPage'
import { LinkDispatchListPage } from './LinkDispatchListPage'
import { DELIVERY_BATCH_ROLES } from '../api/delivery'
// InvoiceView (P0-4 거래명세서 1차 mock) 은 SP-08-6-4 SalesInvoicePrintPage 로 대체됨.
import { DispatchView } from '../print/DispatchView'
// P0-4 인쇄 양식 5건 1차 mock — Designer 단계 신규 (출고/입고/견적/세금계산서)
import { OutboundView } from '../print/OutboundView'
import { InboundView } from '../print/InboundView'
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
// P0-4 세금계산서 라우트 3종 (ACCOUNTANT/MANAGER/MASTER — RoleGuard).
// BE: accounting-service `/accounting/tax-invoices/*` (commit f8b8b49).
import { TaxInvoiceListPage } from './TaxInvoiceListPage'
import { TaxInvoiceFormPage } from './TaxInvoiceFormPage'
import { TaxInvoiceDetailPage } from './TaxInvoiceDetailPage'
// GAS 이식 — 세금계산서 일괄발행 4탭 페이지 (ACCOUNTANT / MANAGER / MASTER).
// BE: accounting-service POST /batch/preview / GET /batch/{id}/excel / /batch/exclusions / /batch/history
import { TaxInvoiceBatchPage } from './accounting/TaxInvoiceBatchPage'
// [supplier-profile + datagrid] 사업자 양식 페이지 (ACCOUNTANT read / MANAGER+MASTER write).
// BE: accounting-service `/api/v1/accounting/supplier-profiles`
import { SupplierProfilePage } from './accounting/SupplierProfilePage'
import { SUPPLIER_PROFILE_READ_ROLES } from '../api/supplierProfileApi'
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
import { PARTNER_DC_CONFIG_ROLES } from '../api/sales'
// Phase 10 P0-2 — 본인 비밀번호 변경 페이지 (재로그인 강제)
import { PasswordChangePage } from './PasswordChangePage'
// P0-2 셀프 재설정 — 비인증 page 방식 2종 (AuthGuard 외부 최상위 등록)
import { PasswordResetRequestPage } from './PasswordResetRequestPage'
import { PasswordResetConfirmPage } from './PasswordResetConfirmPage'
// [Phase 10 P1-5] arologis 수동 배차 admin UI (MASTER/MANAGER).
import { ArologisManualDispatchPage } from './ArologisManualDispatchPage'
import { ARO_MANUAL_DISPATCH_ROLES } from '../api/arologisManualApi'
// [Phase 10 PR-E1 FE-2] arologis 가배차 분류 admin UI (REGION 권역 + 시도 광역 2-탭, MASTER/MANAGER/DISPATCH)
import { ArologisPreClassifyPage } from './ArologisPreClassifyPage'
import { ARO_PRECLASSIFY_ROLES } from '../api/arologisDispatchApi'
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
import { PARTNER_FULL_ROLES } from '../api/partnerApi'
// [PR-D Phase B FE-A] 구글 시트 동기화 admin (MASTER 전용 — AdminLayout 가드)
import { SheetSyncPage as AdminSheetSyncPage } from './admin/SheetSyncPage'
// [PR-D Phase B FE-B] arologis 지역 관리 admin UI — DISPATCH 조회 + MANAGER/MASTER 관리.
import { RegionsPage as AdminRegionsPage } from './admin/RegionsPage'
import { ARO_REGIONS_ADMIN_ROLES } from '../api/regionApi'
// [PR-D Phase B FE-E] 발송금지 거래처 admin (MASTER 전용 — partner-service /api/v1/partners/admin/blocks)
import { BlockedPartnersPage as AdminBlockedPartnersPage } from './admin/BlockedPartnersPage'
// [PR-F1 Designer mock] 알리고 주소록 자동 동기화 — MASTER 전용 (AdminLayout 가드).
// legacy GAS 9번 이식, BE FE-1 슬라이스 endpoint 연결 예정.
import { AligoAddressBookPage as AdminAligoAddressBookPage } from './admin/AligoAddressBookPage'
import { ALIGO_ADDRESS_BOOK_ROLES } from '../api/aligoAddressBookApi'
// [PR-F1 FE-2] arologis 운송사 실배차 비교 — DISPATCH/MANAGER/MASTER.
import { ArologisDispatchReconcilePage } from './ArologisDispatchReconcilePage'
import { ARO_DISPATCH_RECONCILE_ROLES } from '../api/dispatchReconcileApi'
// [PR-F2 Designer mock] vendor 발주서 OCR 업로드 — SALES/MANAGER/MASTER (영업 그룹).
// legacy GAS #10 (에어디자이너) + #14 (제이시스템) 운송장/발주서 OCR native 이식.
// BE 미연결 (Tesseract OCR endpoint backlog), mock state 로 3-step UX 시뮬레이션.
import { SalesVendorOrderUploadPage } from './SalesVendorOrderUploadPage'
// [PR-D Phase B FE-D] 단톡방 매핑 admin — MASTER/MANAGER (BE @PreAuthorize 일치)
// AdminLayout 은 MASTER 전용이므로 별도 RoleGuard 로 MASTER/MANAGER 진입 허용.
import { ChatRoomsPage as AdminChatRoomsPage } from './admin/ChatRoomsPage'
import { CHAT_ROOM_ADMIN_ROLES } from '../api/chatRoomApi'
// [Phase 10 P2-6 / slice 9] 재고 실사 3 페이지 (WAREHOUSE/MASTER)
import { InventoryAuditListPage } from './InventoryAuditListPage'
import { InventoryAuditFormPage } from './InventoryAuditFormPage'
import { InventoryAuditDetailPage } from './InventoryAuditDetailPage'
// [P0-9] 입고 검수 목록 (WAREHOUSE/MANAGER/MASTER)
import { InboundInspectionListPage } from './InboundInspectionListPage'
// [PR-E1 FE-5] 전표 정리 리스트 (legacy GAS 13번 자동 조회 이식) — SALES/MANAGER/MASTER
import { SlipCleanupPage } from './SlipCleanupPage'
import { SLIP_CLEANUP_ROLES } from '../api/slipCleanupApi'
// [PR-E1 FE-1] DPS 입고 비교 (legacy GAS 1번/16번 native 이식 — WAREHOUSE/MASTER/MANAGER/INVENTORY)
import { InventoryDpsComparePage } from './InventoryDpsComparePage'
import { DPS_COMPARE_ROLES } from '../api/dpsCompareApi'
// [P0-B GAS 보강] 품목별 DPS 분석 (품목별 DPS 입고 pivot — WAREHOUSE/MANAGER/MASTER)
import { DpsByProductPage } from './warehouse/DpsByProductPage'
import { DPS_BY_PRODUCT_ROLES } from '../api/dpsByProductApi'
// [PR-E1 FE-6] 배차안내 SMS 발송 (preview + send 2-step) — DISPATCH / MANAGER / MASTER 가드
import { DispatchSmsPage } from './DispatchSmsPage'
import { DISPATCH_SMS_ROLES } from '../api/dispatchSmsApi'
// [Phase 10 PR-E1 FE-3] arologis 미배차 리스트 — 일자 필터 + 수동 배차로 이동 link (MASTER/MANAGER/DISPATCH)
import { ArologisUnassignedPage } from './ArologisUnassignedPage'
import { ARO_UNASSIGNED_ROLES } from '../api/arologisDispatchApi'
// [PR-E1 FE-4] 내일자 전표 이미지 페이지 + Designer NextDaySlipView 통합 print route
import { NextDaySlipPage } from './NextDaySlipPage'
import { NEXT_DAY_SLIP_ROLES } from '../api/nextDaySlipApi'
import { NextDaySlipView } from '../print/NextDaySlipView'
// [PR-E2 FE-9] 홈택스 일괄 등록 양식 export — ACCOUNTANT/MANAGER/MASTER (BE c48e156).
import { HometaxExportPage } from './HometaxExportPage'
import { HOMETAX_EXPORT_ROLES } from '../api/hometaxExportApi'
// [PR-E2 FE-8] 거래명세서 일괄 페이지 + Designer StatementBatchView 통합 print route.
// BE: accounting-service `GET /accounting/statements/batch-data` (commit c48e156).
// 인쇄 view 는 Designer commit 69fd8f0 의 page-break per partner 활용.
import { StatementBatchPage } from './StatementBatchPage'
import { STATEMENT_BATCH_ROLES } from '../api/statementBatchApi'
import { StatementBatchView } from '../print/StatementBatchView'
// [PR-E2 FE-7] 거래처별 원장 페이지 + Designer PartnerLedgerView 통합 print route.
// BE: accounting-service `GET /accounting/sales/aggregate` + `/accounting/journals/ledger-data` (commit c48e156).
// 인쇄 view 는 Designer commit 69fd8f0 의 PartnerLedgerView 재사용.
import { PartnerLedgerPage } from './PartnerLedgerPage'
import { PARTNER_LEDGER_ROLES } from '../api/partnerLedgerApi'
import { PartnerLedgerView } from '../print/PartnerLedgerView'
// [PR-H3 FE-1] 전표 수정/삭제 요청 처리 대시보드 — WAREHOUSE/MANAGER/MASTER.
// BE: slip-service `GET/POST /api/v1/slips/edit-requests*` (PR-H3 BE-1 슬라이스).
import { SlipEditRequestsPage } from './admin/SlipEditRequestsPage'
import { SLIP_EDIT_REQUEST_REVIEWER_ROLES } from '../api/slipEditRequest'
// [D-AX-20] 사진 감사 — WAREHOUSE / MANAGER / MASTER.
// Gateway: `/api/v1/slips/admin/photo-audit` -> slip-service `/slips/admin/photo-audit`.
import { PhotoAuditPage } from './admin/PhotoAuditPage'
import { SLIP_PHOTO_AUDIT_ROLES } from '../api/slipPhotoAuditApi'
// [P0-1 Slice A] 재무 보고서 3개 (ACCOUNTANT/MANAGER/MASTER — RoleGuard).
// BE: accounting-service `/accounting/reports/income-statement` + `/balance-sheet`
import { ReportListPage } from './ReportListPage'
import { IncomeStatementPage } from './IncomeStatementPage'
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
// [P0-1 Slice C] 인쇄 전용 레이아웃 4종.
import { CashFlowStatementPrintLayout } from './accounting/print/CashFlowStatementPrintLayout'
import { EquityChangesPrintLayout } from './accounting/print/EquityChangesPrintLayout'
import { DailySummaryPrintLayout } from './accounting/print/DailySummaryPrintLayout'
import { MonthlySummaryPrintLayout } from './accounting/print/MonthlySummaryPrintLayout'
// [P1-3] 안전재고 알림 — MASTER / MANAGER / WAREHOUSE (창고 운영 그룹).
// BE: inventory-service `GET /inventory/safety-stock-alerts` (P1-3 슬라이스).
import { SafetyStockAlertsPage } from './SafetyStockAlertsPage'
import { SAFETY_STOCK_ROLES } from '../api/safetyStockApi'
// [P1-5] arologis 배차 admin 3개 신규 화면 — MANAGER / MASTER.
// - KakaoAutoDispatchPage: 카카오톡 자동 매칭 실행 + 결과 표
// - ManualDispatchAdminPage: 배차 list + 기사 직접 선택 modal
// - DriverAssignmentPage: 가용 기사 + 미배정 배차 2-panel 배정 UI
import { KakaoAutoDispatchPage } from './KakaoAutoDispatchPage'
import { ManualDispatchAdminPage } from './ManualDispatchAdminPage'
import { DriverAssignmentPage } from './DriverAssignmentPage'
import { ARO_ADMIN_DISPATCH_ROLES } from '../api/arologisAdminDispatchApi'
// [SP-08-6-5 P2] 일마감 + 원장 신규 화면 (ACCOUNTANT/MANAGER/MASTER — RoleGuard).
// BE: accounting-service `/accounting/daily-closings` + `/accounting/ledgers`
import { DailyClosingPage } from './DailyClosingPage'
import { GeneralLedgerPage } from './GeneralLedgerPage'
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
// [samhan-dispatch-board Phase A] 배차 메뉴 — DISPATCH / MANAGER / MASTER.
// BE: slip-service `/admin/dispatch-board/*` + `/admin/dispatch-tasks/*` (Phase A spec § 6).
import DispatchBoardPage from './dispatch-board/DispatchBoardPage'
const DISPATCH_BOARD_ROLES = ['DISPATCH', 'MANAGER', 'MASTER'] as const

/**
 * Print route wrapper — `?perRoom=1` query 시 Designer NextDaySlipView 의
 * pageBreakPerRoom prop 활성. NextDaySlipView 자체 보존 (Designer 산출물 무수정).
 */
function NextDaySlipPrintRoute() {
  const [params] = useSearchParams()
  const perRoom = params.get('perRoom') === '1'
  return <NextDaySlipView pageBreakPerRoom={perRoom} />
}

/**
 * 회계 권한 풀네임 화이트리스트 (feedback_role_naming_full.md).
 * ACCOUNTANT / MANAGER / MASTER — BE @PreAuthorize 와 1:1 일치 (PR #134 BE+QA 결함 fix).
 */
const ACCOUNTING_ROLES = ['ACCOUNTANT', 'MANAGER', 'MASTER'] as const

/** 재고 실사 권한 — WAREHOUSE / MASTER (사용자 요구). */
const AUDIT_ROLES = ['WAREHOUSE', 'MASTER'] as const

/** P0-9 입고 검수 권한 — WAREHOUSE / MANAGER / MASTER (재고 적용 권한과 일치). */
const INBOUND_INSPECTION_ROLES = ['WAREHOUSE', 'MANAGER', 'MASTER'] as const

/** 전표 신규 작성 권한 — slip-service SlipController#create 와 1:1. */
const SLIP_CREATE_ROLES = ['SALES', 'MANAGER', 'MASTER'] as const

/** 거래처 주문 운영 화면 권한 — PARTNER 데스크톱 직접 진입은 차단한다. */
const SALES_PARTNER_ORDER_ROLES = ['SALES', 'MANAGER', 'MASTER'] as const

/** 재고이동 신규 작성 권한 — inventory-service StockTransferController#create 와 1:1. */
const TRANSFER_CREATE_ROLES = ['MASTER', 'MANAGER', 'WAREHOUSE', 'INVENTORY'] as const

/**
 * PR-F2 Designer mock 단계 임시 권한 (SALES / MANAGER / MASTER).
 * BE Tesseract OCR endpoint 합류 시 정식 `VENDOR_ORDER_OCR_ROLES` 로 교체.
 * 영업 그룹 메뉴 — 거래처 (vendor) 발주서를 영업 직원이 받아 처리.
 */
const VENDOR_ORDER_OCR_ROLES = ['SALES', 'MANAGER', 'MASTER'] as const

/** 설정 시트 동기화 — MANAGER / MASTER. product-service endpoint 는 인증 사용자만 강제하므로 FE에서 운영 권한을 좁힌다. */
const SHEET_SYNC_ROLES = ['MANAGER', 'MASTER'] as const

/** 발송금지 거래처 — MANAGER / MASTER. CSV import / 해제는 페이지 내부에서 MASTER 만 노출한다. */
const BLOCKED_PARTNER_ROLES = ['MANAGER', 'MASTER'] as const

const router = createHashRouter([
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
      { path: '/warehouses', element: <WarehousesPage /> },

      // [2a 영업·구매 메뉴 통합] 판매관리 — 풍성한 컬럼 + 다중 선택 (SalesQueryPage).
      // 기존 SlipListPage 는 `/sales/slips` 로 이전 — 2c 전표 작성 plumbing 시 활용 예정.
      { path: '/sales', element: <SalesQueryPage /> },
      { path: '/sales/slips', element: <SlipListPage mode="OUTBOUND" /> },
      {
        path: '/sales/new',
        element: (
          <RoleGuard allow={SLIP_CREATE_ROLES}>
            <SlipFormPage mode="OUTBOUND" />
          </RoleGuard>
        ),
      },
      // link-dispatch-slice: 링크발송 (배송 묶음) — MANAGER/MASTER, `/sales/:id` 보다 먼저 매칭되어야 함
      {
        path: '/sales/link-dispatch',
        element: (
          <RoleGuard allow={DELIVERY_BATCH_ROLES}>
            <LinkDispatchListPage />
          </RoleGuard>
        ),
      },

      // [PR-E1 FE-4] 내일자 전표 이미지 — SALES/MANAGER/MASTER (BE @PreAuthorize 일치).
      // `/sales/:id` 보다 먼저 매칭되어야 함 (정적 path 우선).
      {
        path: '/sales/next-day-slip',
        element: (
          <RoleGuard allow={NEXT_DAY_SLIP_ROLES}>
            <NextDaySlipPage />
          </RoleGuard>
        ),
      },
      // [PR-E1 FE-4] 내일자 전표 인쇄 미리보기 — Designer commit 1f85605 NextDaySlipView 통합.
      // `?date=YYYY-MM-DD` 필수, `?perRoom=1` 시 단톡방별 page-break-after 활성.
      {
        path: '/print/next-day-slip',
        element: (
          <RoleGuard allow={NEXT_DAY_SLIP_ROLES}>
            <NextDaySlipPrintRoute />
          </RoleGuard>
        ),
      },

      // P2-1 견적서 SamhanLogis 도메인 (slip-service `/slips/estimates`).
      // legacy webview (EstimateLegacyWebviewPage) 폐기. 정적 path 우선 매칭 의무.
      { path: '/sales/estimates', element: <EstimateListPage /> },
      { path: '/sales/estimates/new', element: <EstimateFormPage /> },
      {
        path: '/sales/partner-orders',
        element: (
          <RoleGuard allow={SALES_PARTNER_ORDER_ROLES}>
            <SalesPartnerOrderListPage />
          </RoleGuard>
        ),
      },
      {
        path: '/sales/partner-orders/:id',
        element: (
          <RoleGuard allow={SALES_PARTNER_ORDER_ROLES}>
            <SalesPartnerOrderDetailPage />
          </RoleGuard>
        ),
      },
      { path: '/sales/order-approvals', element: <SalesOrderApprovalsPage /> },
      {
        path: '/sales/partner-dc-config',
        element: (
          <RoleGuard allow={PARTNER_DC_CONFIG_ROLES}>
            <SalesPartnerDcConfigPage />
          </RoleGuard>
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
          <RoleGuard allow={SLIP_CLEANUP_ROLES}>
            <SlipCleanupPage />
          </RoleGuard>
        ),
      },

      // [PR-F2 Designer mock] vendor 발주서 OCR 업로드 — SALES / MANAGER / MASTER.
      // legacy GAS #10 (에어디자이너) + #14 (제이시스템) 운송장/발주서 OCR native 이식.
      // 정적 path (`/sales/vendor-order-upload`) → `/sales/:id` 보다 먼저 매칭되어야 함.
      // BE Tesseract OCR endpoint 미구현 — Designer mock state 만 3-step UX 시뮬레이션.
      {
        path: '/sales/vendor-order-upload',
        element: (
          <RoleGuard allow={VENDOR_ORDER_OCR_ROLES}>
            <SalesVendorOrderUploadPage />
          </RoleGuard>
        ),
      },

      { path: '/sales/:id', element: <SlipDetailPage mode="OUTBOUND" /> },
      // SP-08-6-4 — 거래명세서 (A4 portrait, legacy GAS 동등). 정적 suffix 먼저 매칭.
      { path: '/sales/:id/print/statement', element: <SalesTransactionStatementPrintPage /> },
      // SP-08-6-4 — 세금계산서 (A4 portrait, 공급자/공급받는자 박스 포함). InvoiceView 대체.
      { path: '/sales/:id/print/invoice', element: <SalesInvoicePrintPage /> },
      { path: '/sales/:id/print/dispatch', element: <DispatchView /> },
      // P0-4 신규 — 출고전표 (88mm/A4 분기). 세금계산서는 별도 accounting-service id 라우트로 이전.
      { path: '/sales/:id/print/outbound', element: <OutboundView /> },

      // [2a 영업·구매 메뉴 통합] 구매관리 — 풍성한 컬럼 + 다중 선택 (PurchaseQueryPage).
      // 기존 SlipListPage 는 `/purchases/slips` 로 이전 — 2c 전표 작성 plumbing 시 활용.
      // `/purchases/slips` 는 정적 path 이므로 `/purchases/:id` 보다 먼저 등록.
      { path: '/purchases', element: <PurchaseQueryPage /> },
      { path: '/purchases/slips', element: <SlipListPage mode="INBOUND" /> },
      {
        path: '/purchases/new',
        element: (
          <RoleGuard allow={SLIP_CREATE_ROLES}>
            <SlipFormPage mode="INBOUND" />
          </RoleGuard>
        ),
      },
      { path: '/purchases/:id', element: <SlipDetailPage mode="INBOUND" /> },
      // P0-4 신규 — 입고전표 (A4/88mm 분기)
      { path: '/purchases/:id/print/inbound', element: <InboundView /> },
      // SP-08-5-5 — 매입 전표 인쇄 양식 (A4 portrait, 창고/관리자 권한)
      { path: '/purchases/:id/print/purchase', element: <PurchaseSlipPrintPage /> },

      // 재고이동
      { path: '/transfers', element: <TransferListPage /> },
      {
        path: '/transfers/new',
        element: (
          <RoleGuard allow={TRANSFER_CREATE_ROLES}>
            <TransferFormPage />
          </RoleGuard>
        ),
      },
      { path: '/transfers/:id', element: <TransferDetailPage /> },

      // Phase 10 P0-2 — 본인 비밀번호 변경 (모든 인증 사용자 접근 가능)
      { path: '/password/change', element: <PasswordChangePage /> },

      // accounting-slice-A — 회계 라우트 5종 (ACCOUNTANT/MANAGER/MASTER)
      {
        path: '/accounting/accounts',
        element: (
          <RoleGuard allow={ACCOUNTING_ROLES}>
            <AccountTreePage />
          </RoleGuard>
        ),
      },
      {
        path: '/accounting/journals',
        element: (
          <RoleGuard allow={ACCOUNTING_ROLES}>
            <JournalListPage />
          </RoleGuard>
        ),
      },
      {
        path: '/accounting/journals/new',
        element: (
          <RoleGuard allow={ACCOUNTING_ROLES}>
            <JournalFormPage />
          </RoleGuard>
        ),
      },
      {
        path: '/accounting/journals/:id/edit',
        element: (
          <RoleGuard allow={ACCOUNTING_ROLES}>
            <JournalFormPage />
          </RoleGuard>
        ),
      },
      {
        path: '/accounting/journals/:id',
        element: (
          <RoleGuard allow={ACCOUNTING_ROLES}>
            <JournalDetailPage />
          </RoleGuard>
        ),
      },
      {
        path: '/accounting/balances',
        element: (
          <RoleGuard allow={ACCOUNTING_ROLES}>
            <TrialBalancePage />
          </RoleGuard>
        ),
      },

      // [P0-1 Slice A] 재무 보고서 — 손익계산서 / 재무상태표 / 보고서 목록.
      // ACCOUNTANT / MASTER 만. 정적 path 우선 매칭 필수.
      {
        path: '/accounting/reports',
        element: (
          <RoleGuard allow={ACCOUNTING_ROLES}>
            <ReportListPage />
          </RoleGuard>
        ),
      },
      {
        path: '/accounting/reports/income-statement',
        element: (
          <RoleGuard allow={ACCOUNTING_ROLES}>
            <IncomeStatementPage />
          </RoleGuard>
        ),
      },
      {
        path: '/accounting/reports/balance-sheet',
        element: (
          <RoleGuard allow={ACCOUNTING_ROLES}>
            <BalanceSheetPage />
          </RoleGuard>
        ),
      },
      // [P0-1 Slice A D5] 인쇄 전용 라우트 — 새 창 열기 패턴. AuthGuard 안쪽 유지.
      // `/income-statement` 보다 먼저 매칭되도록 정적 `/print` suffix 먼저 등록.
      {
        path: '/accounting/reports/income-statement/print',
        element: (
          <RoleGuard allow={ACCOUNTING_ROLES}>
            <IncomeStatementPrintLayout />
          </RoleGuard>
        ),
      },
      {
        path: '/accounting/reports/balance-sheet/print',
        element: (
          <RoleGuard allow={ACCOUNTING_ROLES}>
            <BalanceSheetPrintLayout />
          </RoleGuard>
        ),
      },

      // [P0-1 Slice B] 세금/거래처 보고서 4개 — ACCOUNTANT/MANAGER/MASTER.
      // 정적 `/print` suffix 먼저 등록 (부모 라우트 매칭 우선).
      {
        path: '/accounting/reports/vat',
        element: (
          <RoleGuard allow={ACCOUNTING_ROLES}>
            <VatReportPage />
          </RoleGuard>
        ),
      },
      {
        path: '/accounting/reports/vat/print',
        element: (
          <RoleGuard allow={ACCOUNTING_ROLES}>
            <VatReportPrintLayout />
          </RoleGuard>
        ),
      },
      {
        path: '/accounting/reports/corporate-tax',
        element: (
          <RoleGuard allow={ACCOUNTING_ROLES}>
            <CorporateTaxReportPage />
          </RoleGuard>
        ),
      },
      {
        path: '/accounting/reports/corporate-tax/print',
        element: (
          <RoleGuard allow={ACCOUNTING_ROLES}>
            <CorporateTaxReportPrintLayout />
          </RoleGuard>
        ),
      },
      {
        path: '/accounting/reports/partner-aging',
        element: (
          <RoleGuard allow={ACCOUNTING_ROLES}>
            <PartnerAgingPage />
          </RoleGuard>
        ),
      },
      {
        path: '/accounting/reports/partner-aging/print',
        element: (
          <RoleGuard allow={ACCOUNTING_ROLES}>
            <PartnerAgingPrintLayout />
          </RoleGuard>
        ),
      },

      // [P0-1 Slice C] 분석 보고서 4개 — ACCOUNTANT/MANAGER/MASTER.
      // 정적 `/print` suffix 먼저 등록 (부모 라우트 매칭 우선).
      {
        path: '/accounting/reports/cash-flow',
        element: (
          <RoleGuard allow={ACCOUNTING_ROLES}>
            <CashFlowStatementPage />
          </RoleGuard>
        ),
      },
      {
        path: '/accounting/reports/cash-flow/print',
        element: (
          <RoleGuard allow={ACCOUNTING_ROLES}>
            <CashFlowStatementPrintLayout />
          </RoleGuard>
        ),
      },
      {
        path: '/accounting/reports/equity-changes',
        element: (
          <RoleGuard allow={ACCOUNTING_ROLES}>
            <EquityChangesPage />
          </RoleGuard>
        ),
      },
      {
        path: '/accounting/reports/equity-changes/print',
        element: (
          <RoleGuard allow={ACCOUNTING_ROLES}>
            <EquityChangesPrintLayout />
          </RoleGuard>
        ),
      },
      {
        path: '/accounting/reports/daily-summary',
        element: (
          <RoleGuard allow={ACCOUNTING_ROLES}>
            <DailySummaryPage />
          </RoleGuard>
        ),
      },
      {
        path: '/accounting/reports/daily-summary/print',
        element: (
          <RoleGuard allow={ACCOUNTING_ROLES}>
            <DailySummaryPrintLayout />
          </RoleGuard>
        ),
      },
      {
        path: '/accounting/reports/monthly-summary',
        element: (
          <RoleGuard allow={ACCOUNTING_ROLES}>
            <MonthlySummaryPage />
          </RoleGuard>
        ),
      },
      {
        path: '/accounting/reports/monthly-summary/print',
        element: (
          <RoleGuard allow={ACCOUNTING_ROLES}>
            <MonthlySummaryPrintLayout />
          </RoleGuard>
        ),
      },

      // [PR-E2 FE-9] 홈택스 일괄 등록 양식 — ACCOUNTANT / MANAGER / MASTER.
      // BE: accounting-service `GET /accounting/tax-invoice/hometax-export` (commit c48e156).
      {
        path: '/accounting/hometax-export',
        element: (
          <RoleGuard allow={HOMETAX_EXPORT_ROLES}>
            <HometaxExportPage />
          </RoleGuard>
        ),
      },

      // [PR-E2 FE-8] 거래명세서 일괄 — ACCOUNTANT / MASTER.
      // BE: accounting-service `GET /accounting/statements/batch-data` (commit c48e156).
      // 다중 선택 → /print/statement-batch 진입 (page-break per partner).
      {
        path: '/accounting/statement-batch',
        element: (
          <RoleGuard allow={STATEMENT_BATCH_ROLES}>
            <StatementBatchPage />
          </RoleGuard>
        ),
      },
      // [PR-E2 FE-8] 거래명세서 일괄 인쇄 미리보기 — Designer commit 69fd8f0 StatementBatchView 통합.
      // `?from=&to=&partnerCodes=A,B,C` (partnerCodes 미지정 시 전체).
      {
        path: '/print/statement-batch',
        element: (
          <RoleGuard allow={STATEMENT_BATCH_ROLES}>
            <StatementBatchView />
          </RoleGuard>
        ),
      },

      // [PR-E2 FE-7] 거래처별 원장 생성 — ACCOUNTANT / MANAGER / MASTER.
      // BE: accounting-service `GET /accounting/sales/aggregate` (BE-A8) +
      //     `GET /accounting/journals/ledger-data` (BE-A9) (commit c48e156).
      // 집계 → 원장 detail → 인쇄 / 일괄 인쇄 / CSV 다운로드 통합.
      {
        path: '/accounting/partner-ledger',
        element: (
          <RoleGuard allow={PARTNER_LEDGER_ROLES}>
            <PartnerLedgerPage />
          </RoleGuard>
        ),
      },
      // [PR-E2 FE-7] 거래처 원장 인쇄 미리보기 — Designer commit 69fd8f0 PartnerLedgerView 통합.
      // `?partnerCode=&from=&to=` 필수.
      {
        path: '/print/partner-ledger',
        element: (
          <RoleGuard allow={PARTNER_LEDGER_ROLES}>
            <PartnerLedgerView />
          </RoleGuard>
        ),
      },

      // [Phase 10 P1-5] arologis 수동 배차 admin UI — MASTER / MANAGER (backlog DISPATCH).
      {
        path: '/arologis/manual',
        element: (
          <RoleGuard allow={ARO_MANUAL_DISPATCH_ROLES}>
            <ArologisManualDispatchPage />
          </RoleGuard>
        ),
      },

      // [Phase 10 PR-E1 FE-2] arologis 가배차 분류 admin UI — MASTER / MANAGER / DISPATCH.
      // 출고전표 자동 조회 → 권역 (REGION 마스터) + 시도 (광역 prefix) 2-탭 통합.
      {
        path: '/arologis/pre-classify',
        element: (
          <RoleGuard allow={ARO_PRECLASSIFY_ROLES}>
            <ArologisPreClassifyPage />
          </RoleGuard>
        ),
      },

      // [Phase 10 PR-E1 FE-3] arologis 미배차 리스트 — MASTER / MANAGER / DISPATCH.
      // 일자 단일 필터 + dispatch 미할당 슬립 표 + "수동 배차로 이동" link (/arologis/manual 자동 채움).
      {
        path: '/arologis/unassigned',
        element: (
          <RoleGuard allow={ARO_UNASSIGNED_ROLES}>
            <ArologisUnassignedPage />
          </RoleGuard>
        ),
      },

      // [Phase 10 PR-E1 FE-6] 배차안내 SMS 발송 (preview + send 2-step) — DISPATCH / MANAGER / MASTER.
      // 출고전표 자동 조회 + 단톡방 매핑 + blocked 가드 + 안내 SMS 발송.
      {
        path: '/arologis/dispatch-sms',
        element: (
          <RoleGuard allow={DISPATCH_SMS_ROLES}>
            <DispatchSmsPage />
          </RoleGuard>
        ),
      },

      // [samhan-dispatch-board Phase A] 배차 메뉴 — DISPATCH / MANAGER / MASTER.
      // 미배차 출고전표 50/page + 차량 그룹 (9 종류) + drag-and-drop + arologis 발송.
      // BE: slip-service `/admin/dispatch-board/*` + `/admin/dispatch-tasks/*`.
      {
        path: '/dispatch-board',
        element: (
          <RoleGuard allow={DISPATCH_BOARD_ROLES}>
            <DispatchBoardPage />
          </RoleGuard>
        ),
      },

      // [PR-F1 FE-2] arologis 운송사 실배차 비교 — DISPATCH / MANAGER / MASTER.
      // legacy GAS 11번 이식 + multipart `POST /admin/arologis/dispatch/reconcile`.
      {
        path: '/arologis/dispatch-reconcile',
        element: (
          <RoleGuard allow={ARO_DISPATCH_RECONCILE_ROLES}>
            <ArologisDispatchReconcilePage />
          </RoleGuard>
        ),
      },

      // [P1-5] arologis 배차 admin 신규 3개 라우트 — MANAGER / MASTER.
      // 매뉴얼: docs/manual/05-arologis/01-카카오톡-배차.md (Frontend admin UI ✅)
      //         docs/manual/05-arologis/02-수동-배차.md     (정식 admin 배차 UI ✅)
      //         docs/manual/05-arologis/03-기사-배정.md     (Frontend admin 배정 UI ✅)
      {
        path: '/arologis/admin/auto-dispatch',
        element: (
          <RoleGuard allow={ARO_ADMIN_DISPATCH_ROLES}>
            <KakaoAutoDispatchPage />
          </RoleGuard>
        ),
      },
      {
        path: '/arologis/admin/manual-dispatch',
        element: (
          <RoleGuard allow={ARO_ADMIN_DISPATCH_ROLES}>
            <ManualDispatchAdminPage />
          </RoleGuard>
        ),
      },
      {
        path: '/arologis/admin/driver-assignment',
        element: (
          <RoleGuard allow={ARO_ADMIN_DISPATCH_ROLES}>
            <DriverAssignmentPage />
          </RoleGuard>
        ),
      },

      // [Phase 10 P2-4 / slice 8] 매출 마감 — 매뉴얼 docs/manual/02-창고/04-매출-마감.md 경로 일치.
      // 진입 가드 ACCOUNTANT/MANAGER/MASTER (역마감 버튼은 페이지 내부에서 MASTER 만 노출).
      {
        path: '/warehouse/closing',
        element: (
          <RoleGuard allow={ACCOUNTING_ROLES}>
            <MonthEndClosingPage />
          </RoleGuard>
        ),
      },

      // [SP-08-6-5 P2] 일마감 — `/accounting/daily-closings` (ACCOUNTANT/MANAGER/MASTER 진입).
      // 날짜 range 필터 + 거래처 필터 + 마감 실행 + 역마감(MASTER 만).
      // BE: accounting-service `GET/POST /accounting/daily-closings` + `POST /{id}/reverse`.
      {
        path: '/accounting/daily-closings',
        element: (
          <RoleGuard allow={ACCOUNTING_ROLES}>
            <DailyClosingPage />
          </RoleGuard>
        ),
      },

      // [SP-08-6-5 P2] 원장 — `/accounting/ledgers` (ACCOUNTANT/MANAGER/MASTER 진입).
      // 기간 + 계정/거래처 필터 + 라인 테이블 + CSV 다운로드 + 출력.
      // BE: accounting-service `GET /accounting/ledgers`.
      {
        path: '/accounting/ledgers',
        element: (
          <RoleGuard allow={ACCOUNTING_ROLES}>
            <GeneralLedgerPage />
          </RoleGuard>
        ),
      },

      // [P2-3] 월말 마감 — `/accounting/period-close` (ACCOUNTANT/MANAGER/MASTER 진입).
      // 매뉴얼 docs/manual/03-회계/04-월말-마감.md Stage 1 일치.
      {
        path: '/accounting/period-close',
        element: (
          <RoleGuard allow={ACCOUNTING_ROLES}>
            <PeriodCloseListPage />
          </RoleGuard>
        ),
      },

      // [2a 메뉴 통합] `/sales/query` / `/purchases/query` 는 기존 deep-link / bookmark
      // 호환을 위한 alias — 사이드바에서는 제거되었고 `/sales`, `/purchases` 가 정식.
      { path: '/sales/query', element: <SalesQueryPage /> },
      { path: '/purchases/query', element: <PurchaseQueryPage /> },

      // [PR-HR] 403 접근 거부 페이지 — AdminLayout 대표실 부서 가드 + 일반 권한 부족 redirect 대상.
      { path: '/forbidden', element: <ForbiddenPage /> },

      // [P2-4] 매출 마감 — `/sales/closing` (ACCOUNTANT/MANAGER/MASTER 진입).
      // 일별/월별 toggle + 세금계산서 detail + CSV.
      // 매뉴얼 docs/manual/02-창고/04-매출-마감.md Stage 1 일치.
      // 정적 path 이므로 `/sales/:id` 보다 먼저 매칭됨 (react-router 정적 우선 규칙).
      {
        path: '/sales/closing',
        element: (
          <RoleGuard allow={ACCOUNTING_ROLES}>
            <SalesClosingPage />
          </RoleGuard>
        ),
      },

      // [supplier-profile + datagrid] 사업자 양식 — ACCOUNTANT (read) / MANAGER / MASTER (write).
      // BE: accounting-service `/api/v1/accounting/supplier-profiles`
      // 정적 path 이므로 `/accounting/tax-invoices/:id` 등과 충돌 없음.
      {
        path: '/accounting/supplier-profiles',
        element: (
          <RoleGuard allow={SUPPLIER_PROFILE_READ_ROLES}>
            <SupplierProfilePage />
          </RoleGuard>
        ),
      },

      // P0-4 세금계산서 — accounting-service `/accounting/tax-invoices/*` (commit f8b8b49).
      // ACCOUNTANT / MASTER 만. 정적 path (`/new`) 우선, 다음 print, 마지막 `:id`.
      {
        path: '/accounting/tax-invoices',
        element: (
          <RoleGuard allow={ACCOUNTING_ROLES}>
            <TaxInvoiceListPage />
          </RoleGuard>
        ),
      },
      // GAS 이식 — 세금계산서 일괄발행 4탭 (ACCOUNTANT / MANAGER / MASTER).
      // 정적 path (`/batch`) → `/accounting/tax-invoices/:id` 보다 먼저 매칭되어야 함.
      {
        path: '/accounting/tax-invoices/batch',
        element: (
          <RoleGuard allow={ACCOUNTING_ROLES}>
            <TaxInvoiceBatchPage />
          </RoleGuard>
        ),
      },
      {
        path: '/accounting/tax-invoices/new',
        element: (
          <RoleGuard allow={ACCOUNTING_ROLES}>
            <TaxInvoiceFormPage />
          </RoleGuard>
        ),
      },
      {
        path: '/accounting/tax-invoices/:id/print',
        element: (
          <RoleGuard allow={ACCOUNTING_ROLES}>
            <TaxInvoiceView />
          </RoleGuard>
        ),
      },
      {
        path: '/accounting/tax-invoices/:id/edit',
        element: (
          <RoleGuard allow={ACCOUNTING_ROLES}>
            <TaxInvoiceFormPage />
          </RoleGuard>
        ),
      },
      {
        path: '/accounting/tax-invoices/:id',
        element: (
          <RoleGuard allow={ACCOUNTING_ROLES}>
            <TaxInvoiceDetailPage />
          </RoleGuard>
        ),
      },

      // [P0-6] 거래처 4탭 신규 등록/목록 — SALES / MANAGER / MASTER.
      // AdminLayout (MASTER 전용) 외부 — SALES/MANAGER 도 생성 후 목록 복귀 가능.
      {
        path: '/admin/partners/new',
        element: (
          <RoleGuard allow={PARTNER_FULL_ROLES}>
            <AdminPartnerCreatePage />
          </RoleGuard>
        ),
      },
      {
        path: '/admin/partners',
        element: (
          <RoleGuard allow={PARTNER_FULL_ROLES}>
            <AdminPartnersPage />
          </RoleGuard>
        ),
      },

      // [SP-04] 일반 사이드바에서 직접 노출되는 admin-origin 운영 화면.
      // AdminLayout 은 MASTER+대표실 전용이므로 MANAGER 공용 메뉴는 별도 RoleGuard 로 분리한다.
      {
        path: '/admin/sheet-sync',
        element: (
          <RoleGuard allow={SHEET_SYNC_ROLES}>
            <AdminSheetSyncPage />
          </RoleGuard>
        ),
      },
      {
        path: '/admin/blocked-partners',
        element: (
          <RoleGuard allow={BLOCKED_PARTNER_ROLES}>
            <AdminBlockedPartnersPage />
          </RoleGuard>
        ),
      },
      {
        path: '/admin/aligo-address-book',
        element: (
          <RoleGuard allow={ALIGO_ADDRESS_BOOK_ROLES}>
            <AdminAligoAddressBookPage />
          </RoleGuard>
        ),
      },

      // [Phase 10 P0-5 / slice 4] 관리자 통합 admin — MASTER 전용 (대표실 부서 추가 가드 포함).
      // AdminLayout 자체에 RoleGuard(MASTER) + useQuery(is-executive-office) 이중 가드.
      // outlet children 은 AdminLayout 이 통과한 후이므로 별도 가드 불필요.
      {
        path: '/admin',
        element: <AdminLayout />,
        children: [
          // [PR-HR] 신규 인사 등록 — /admin/users/new (정적 path 우선 매칭).
          { path: 'users/new', element: <AdminUsersPage /> },
          { path: 'users', element: <AdminUsersPage /> },
          { path: 'roles', element: <AdminRolesPage /> },
          { path: 'warehouses', element: <AdminWarehousesPage /> },
          { path: 'departments', element: <AdminDepartmentsPage /> },
        ],
      },

      // [PR-D Phase B FE-B] arologis 지역 관리 — DISPATCH 조회 + MANAGER/MASTER 관리.
      // AdminLayout (MASTER 전용) 외부에 배치하여 MANAGER 도 접근 가능 — 자체 RoleGuard 적용.
      {
        path: '/admin/regions',
        element: (
          <RoleGuard allow={ARO_REGIONS_ADMIN_ROLES}>
            <AdminRegionsPage />
          </RoleGuard>
        ),
      },

      // [PR-D Phase B FE-D] 단톡방 매핑 — MASTER / MANAGER (BE @PreAuthorize 일치).
      // AdminLayout (MASTER 전용) 외부에 배치하여 MANAGER 도 접근 가능 — 자체 RoleGuard 적용.
      {
        path: '/admin/chat-rooms',
        element: (
          <RoleGuard allow={CHAT_ROOM_ADMIN_ROLES}>
            <AdminChatRoomsPage />
          </RoleGuard>
        ),
      },

      // [PR-H3 FE-1] 전표 수정/삭제 요청 대시보드 — WAREHOUSE / MANAGER / MASTER.
      // AdminLayout (MASTER 전용) 외부에 배치 — WAREHOUSE 도 접근 가능 (자체 RoleGuard).
      // BE: slip-service `GET /api/v1/slips/edit-requests?status=PENDING`.
      {
        path: '/admin/slip-edit-requests',
        element: (
          <RoleGuard allow={SLIP_EDIT_REQUEST_REVIEWER_ROLES}>
            <SlipEditRequestsPage />
          </RoleGuard>
        ),
      },
      // [D-AX-20] 사진 감사 — WAREHOUSE / MANAGER / MASTER.
      // AdminLayout (MASTER 전용) 외부에 배치 — 창고 직원도 접근 가능.
      {
        path: '/admin/photo-audit',
        element: (
          <RoleGuard allow={SLIP_PHOTO_AUDIT_ROLES}>
            <PhotoAuditPage />
          </RoleGuard>
        ),
      },

      // [P0-9] 입고 검수 목록 — WAREHOUSE / MANAGER / MASTER.
      // 매뉴얼 docs/manual/02-창고/01-입고-처리.md 검수 UI ✅.
      {
        path: '/warehouse/inbound-inspections',
        element: (
          <RoleGuard allow={INBOUND_INSPECTION_ROLES}>
            <InboundInspectionListPage />
          </RoleGuard>
        ),
      },

      // [Phase 10 P2-6 / slice 9] 재고 실사 — WAREHOUSE / MASTER 만.
      // 매뉴얼 docs/manual/02-창고/05-재고-실사.md 와 경로 일치.
      {
        path: '/warehouse/audit',
        element: (
          <RoleGuard allow={AUDIT_ROLES}>
            <InventoryAuditListPage />
          </RoleGuard>
        ),
      },
      {
        path: '/warehouse/audit/new',
        element: (
          <RoleGuard allow={AUDIT_ROLES}>
            <InventoryAuditFormPage />
          </RoleGuard>
        ),
      },
      {
        path: '/warehouse/audit/:id',
        element: (
          <RoleGuard allow={AUDIT_ROLES}>
            <InventoryAuditDetailPage />
          </RoleGuard>
        ),
      },

      // [PR-E1 FE-1] DPS 입고 비교 — WAREHOUSE / MASTER / MANAGER / INVENTORY.
      // BE: inventory-service `/warehouse/audit/dps-compare` (commit 4b14084).
      {
        path: '/warehouse/dps-compare',
        element: (
          <RoleGuard allow={DPS_COMPARE_ROLES}>
            <InventoryDpsComparePage />
          </RoleGuard>
        ),
      },

      // [P0-B GAS 보강] 품목별 DPS 분석 — WAREHOUSE / MANAGER / MASTER.
      // BE: inventory-service `GET /warehouse/audit/dps-compare/by-product`
      // 정적 path — `/warehouse/dps-compare` 뒤에 등록 (정적 path 우선 react-router 규칙 준수).
      {
        path: '/warehouse/dps-compare/by-product',
        element: (
          <RoleGuard allow={DPS_BY_PRODUCT_ROLES}>
            <DpsByProductPage />
          </RoleGuard>
        ),
      },

      // [P1-3] 안전재고 알림 목록 — MASTER / MANAGER / WAREHOUSE.
      // 매뉴얼 docs/manual/02-창고/03-재고-조회.md 안전재고 알림 섹션 ✅.
      // BE: inventory-service `GET /inventory/safety-stock-alerts` (P1-3 슬라이스).
      {
        path: '/inventory/safety-stock-alerts',
        element: (
          <RoleGuard allow={SAFETY_STOCK_ROLES}>
            <SafetyStockAlertsPage />
          </RoleGuard>
        ),
      },
    ],
  },
])

/**
 * 앱 루트가 import 하는 RouterProvider wrapper.
 */
export function AppRouter() {
  return <RouterProvider router={router} />
}
