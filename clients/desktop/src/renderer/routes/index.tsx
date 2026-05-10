/**
 * 라우트 정의 — `HashRouter` 기반.
 *
 * Electron 의 `file://` 프로토콜에서는 `BrowserRouter` 의 history mode 가
 * 새로고침 시 404 를 일으키므로 `createHashRouter` 를 사용한다.
 *
 * IA 재편 (slip-output-format 슬라이스 — Q1=A 새 슬라이스):
 * - `/login` → LoginPage (보호 X)
 * - `/`             대시보드
 * - `/warehouses`   창고
 * - `/sales`        판매조회 (출고전표 목록)
 * - `/sales/new`    출고전표 작성
 * - `/sales/link-dispatch`  링크발송 (배송 묶음 + e-sign URL SMS) — link-dispatch-slice
 * - `/sales/:id`    출고전표 상세 + lifecycle
 * - `/sales/:id/print/invoice`   거래명세서 인쇄 미리보기
 * - `/sales/:id/print/dispatch`  출고전표 작업지시서 인쇄
 * - `/purchases`    구매조회 (입고전표 목록)
 * - `/purchases/new` 입고전표 작성
 * - `/purchases/:id` 입고전표 상세 + lifecycle
 * - `/transfers`     재고이동 목록
 * - `/transfers/new` 재고이동 작성
 * - `/transfers/:id` 재고이동 상세 + lifecycle
 *
 * accounting-slice-A 신규 라우트 (ACCOUNTANT/MASTER 만 — RoleGuard):
 * - `/accounting/accounts`              계정과목 트리
 * - `/accounting/journals`              분개장 목록
 * - `/accounting/journals/new`          분개 작성
 * - `/accounting/journals/:id/edit`     분개 편집 (DRAFT 만)
 * - `/accounting/journals/:id`          분개 상세 + 확정/역분개
 * - `/accounting/balances`              시산표 (월별)
 *
 * P0-1 Slice A 신규 라우트 (ACCOUNTANT/MASTER 만 — RoleGuard):
 * - `/accounting/reports`                    재무 보고서 목록 (3개 카드)
 * - `/accounting/reports/income-statement`   손익계산서 (월별)
 * - `/accounting/reports/balance-sheet`      재무상태표 (기준일)
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
import { InvoiceView } from '../print/InvoiceView'
import { DispatchView } from '../print/DispatchView'
// P0-4 인쇄 양식 5건 1차 mock — Designer 단계 신규 (출고/입고/견적/세금계산서)
import { OutboundView } from '../print/OutboundView'
import { InboundView } from '../print/InboundView'
import { QuoteView } from '../print/QuoteView'
import { TaxInvoiceView } from '../print/TaxInvoiceView'
// signature-slice-C 모바일 mock 라우트 (Phase 5 nginx 분리 전 시뮬레이션 — AuthGuard 외부)
import { MobileSignaturePage } from './MobileSignaturePage'
import { MobileRecipientPage } from './MobileRecipientPage'
// accounting-slice-A 회계 라우트 5종 (ACCOUNTANT/MASTER 만 — RoleGuard 적용)
import { AccountTreePage } from './AccountTreePage'
import { JournalListPage } from './JournalListPage'
import { JournalFormPage } from './JournalFormPage'
import { JournalDetailPage } from './JournalDetailPage'
import { TrialBalancePage } from './TrialBalancePage'
// P0-4 세금계산서 라우트 3종 (ACCOUNTANT/MASTER — RoleGuard).
// BE: accounting-service `/accounting/tax-invoices/*` (commit f8b8b49).
import { TaxInvoiceListPage } from './TaxInvoiceListPage'
import { TaxInvoiceFormPage } from './TaxInvoiceFormPage'
import { TaxInvoiceDetailPage } from './TaxInvoiceDetailPage'
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
// Phase 10 P0-2 — 본인 비밀번호 변경 페이지 (재로그인 강제)
import { PasswordChangePage } from './PasswordChangePage'
// [Phase 10 P1-5] arologis 수동 배차 admin UI (DISPATCH/MASTER 가드 — backlog DISPATCH role 부재로 MASTER/MANAGER 매핑)
import { ArologisManualDispatchPage } from './ArologisManualDispatchPage'
import { ARO_MANUAL_DISPATCH_ROLES } from '../api/arologisManualApi'
// [Phase 10 PR-E1 FE-2] arologis 가배차 분류 admin UI (REGION 권역 + 시도 광역 2-탭, MASTER/MANAGER/DISPATCH)
import { ArologisPreClassifyPage } from './ArologisPreClassifyPage'
import { ARO_PRECLASSIFY_ROLES } from '../api/arologisDispatchApi'
// [Phase 10 P2-4 / slice 8] 매출 마감 — 일별/월별 (ACCOUNTANT/MASTER 진입, 역마감은 MASTER 만)
import { MonthEndClosingPage } from './MonthEndClosingPage'
// [Phase 10 P0-5 / slice 4] 관리자 통합 admin (MASTER 전용 5 페이지)
import { AdminLayout } from '../components/AdminLayout'
import { UsersPage as AdminUsersPage } from './admin/UsersPage'
import { RolesPage as AdminRolesPage } from './admin/RolesPage'
import { PartnersPage as AdminPartnersPage } from './admin/PartnersPage'
import { WarehousesPage as AdminWarehousesPage } from './admin/WarehousesPage'
import { DepartmentsPage as AdminDepartmentsPage } from './admin/DepartmentsPage'
// [PR-D Phase B FE-A] 구글 시트 동기화 admin (MASTER 전용 — AdminLayout 가드)
import { SheetSyncPage as AdminSheetSyncPage } from './admin/SheetSyncPage'
// [PR-D Phase B FE-B] arologis 가배차 지역 분류 admin UI — MASTER/MANAGER (DISPATCH backlog)
import { RegionsPage as AdminRegionsPage } from './admin/RegionsPage'
import { ARO_REGIONS_ADMIN_ROLES } from '../api/regionApi'
// [PR-D Phase B FE-E] 발송금지 거래처 admin (MASTER 전용 — partner-service /api/v1/partners/admin/blocks)
import { BlockedPartnersPage as AdminBlockedPartnersPage } from './admin/BlockedPartnersPage'
// [PR-F1 Designer mock] 알리고 주소록 자동 동기화 — MASTER 전용 (AdminLayout 가드).
// legacy GAS 9번 이식, BE FE-1 슬라이스 endpoint 연결 예정.
import { AligoAddressBookPage as AdminAligoAddressBookPage } from './admin/AligoAddressBookPage'
// [PR-F1 Designer mock] arologis 운송사 실배차 비교 — DISPATCH/MANAGER/MASTER (DISPATCH backlog → MANAGER/MASTER).
// legacy GAS 11번 이식, BE FE-2 슬라이스 endpoint 연결 예정.
import { ArologisDispatchReconcilePage } from './ArologisDispatchReconcilePage'
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
// [PR-E1 FE-5] 전표 정리 리스트 (legacy GAS 13번 자동 조회 이식) — SALES/MANAGER/MASTER + ACCOUNTANT
import { SlipCleanupPage } from './SlipCleanupPage'
import { SLIP_CLEANUP_ROLES } from '../api/slipCleanupApi'
// [PR-E1 FE-1] DPS 입고 비교 (legacy GAS 1번/16번 native 이식 — WAREHOUSE/MASTER/MANAGER/INVENTORY)
import { InventoryDpsComparePage } from './InventoryDpsComparePage'
import { DPS_COMPARE_ROLES } from '../api/dpsCompareApi'
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
// [P0-1 Slice A] 재무 보고서 3개 (ACCOUNTANT/MASTER — RoleGuard).
// BE: accounting-service `/accounting/reports/income-statement` + `/balance-sheet`
import { ReportListPage } from './ReportListPage'
import { IncomeStatementPage } from './IncomeStatementPage'
import { BalanceSheetPage } from './BalanceSheetPage'

/**
 * Print route wrapper — `?perRoom=1` query 시 Designer NextDaySlipView 의
 * pageBreakPerRoom prop 활성. NextDaySlipView 자체 보존 (Designer 산출물 무수정).
 */
function NextDaySlipPrintRoute() {
  const [params] = useSearchParams()
  const perRoom = params.get('perRoom') === '1'
  return <NextDaySlipView pageBreakPerRoom={perRoom} />
}

/** 회계 권한 풀네임 화이트리스트 (feedback_role_naming_full.md). */
const ACCOUNTING_ROLES = ['ACCOUNTANT', 'MASTER'] as const

/** 재고 실사 권한 — WAREHOUSE / MASTER (사용자 요구). */
const AUDIT_ROLES = ['WAREHOUSE', 'MASTER'] as const

/**
 * PR-F1 Designer mock 단계 임시 권한 (DISPATCH / MANAGER / MASTER).
 * BE FE-2 슬라이스에서 정식 `ARO_DISPATCH_RECONCILE_ROLES` 가 export 되면 교체.
 */
const ARO_DISPATCH_RECONCILE_ROLES = ['DISPATCH', 'MANAGER', 'MASTER'] as const

/**
 * PR-F2 Designer mock 단계 임시 권한 (SALES / MANAGER / MASTER).
 * BE Tesseract OCR endpoint 합류 시 정식 `VENDOR_ORDER_OCR_ROLES` 로 교체.
 * 영업 그룹 메뉴 — 거래처 (vendor) 발주서를 영업 직원이 받아 처리.
 */
const VENDOR_ORDER_OCR_ROLES = ['SALES', 'MANAGER', 'MASTER'] as const

const router = createHashRouter([
  { path: '/login', element: <LoginPage /> },
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

      // 판매조회 (출고전표)
      { path: '/sales', element: <SlipListPage mode="OUTBOUND" /> },
      { path: '/sales/new', element: <SlipFormPage mode="OUTBOUND" /> },
      // link-dispatch-slice: 링크발송 (배송 묶음) — `/sales/:id` 보다 먼저 매칭되어야 함
      { path: '/sales/link-dispatch', element: <LinkDispatchListPage /> },

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
      { path: '/sales/partner-orders', element: <SalesPartnerOrderListPage /> },
      { path: '/sales/partner-orders/:id', element: <SalesPartnerOrderDetailPage /> },
      { path: '/sales/order-approvals', element: <SalesOrderApprovalsPage /> },
      { path: '/sales/partner-dc-config', element: <SalesPartnerDcConfigPage /> },

      // P0-4 견적서 인쇄 (estimateNumber path param) — Designer commit 5dcbbef QuoteView 재사용.
      // P2-1 견적서 상세/편집 (id UUID path param) — `/sales/:id` 보다 먼저 매칭되어야 함.
      { path: '/sales/estimates/:estimateNumber/print', element: <QuoteView /> },
      { path: '/sales/estimates/:id/edit', element: <EstimateFormPage /> },
      { path: '/sales/estimates/:id', element: <EstimateDetailPage /> },

      // [PR-E1 FE-5] 전표 정리 리스트 — `/sales/:id` 보다 먼저 매칭되어야 함.
      // BE: slip-service `GET /slips/cleanup` (commit 281415f). SALES/MANAGER/MASTER + ACCOUNTANT.
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
      { path: '/sales/:id/print/invoice', element: <InvoiceView /> },
      { path: '/sales/:id/print/dispatch', element: <DispatchView /> },
      // P0-4 신규 — 출고전표 (88mm/A4 분기). 세금계산서는 별도 accounting-service id 라우트로 이전.
      { path: '/sales/:id/print/outbound', element: <OutboundView /> },

      // 구매조회 (입고전표)
      { path: '/purchases', element: <SlipListPage mode="INBOUND" /> },
      { path: '/purchases/new', element: <SlipFormPage mode="INBOUND" /> },
      { path: '/purchases/:id', element: <SlipDetailPage mode="INBOUND" /> },
      // P0-4 신규 — 입고전표 (A4/88mm 분기)
      { path: '/purchases/:id/print/inbound', element: <InboundView /> },

      // 재고이동
      { path: '/transfers', element: <TransferListPage /> },
      { path: '/transfers/new', element: <TransferFormPage /> },
      { path: '/transfers/:id', element: <TransferDetailPage /> },

      // Phase 10 P0-2 — 본인 비밀번호 변경 (모든 인증 사용자 접근 가능)
      { path: '/password/change', element: <PasswordChangePage /> },

      // accounting-slice-A — 회계 라우트 5종 (ACCOUNTANT/MASTER 만)
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

      // [PR-F1 Designer mock] arologis 운송사 실배차 비교 — DISPATCH / MANAGER / MASTER.
      // legacy GAS 11번 이식 mock. BE FE-2 (multipart `POST /api/v1/arologis/dispatch/reconcile`)
      // 연결 시점에 실 API 통합. ARO_DISPATCH_RECONCILE_ROLES 는 BE-2 슬라이스에서 정식 export 예정.
      {
        path: '/arologis/dispatch-reconcile',
        element: (
          <RoleGuard allow={ARO_DISPATCH_RECONCILE_ROLES}>
            <ArologisDispatchReconcilePage />
          </RoleGuard>
        ),
      },

      // [Phase 10 P2-4 / slice 8] 매출 마감 — 매뉴얼 docs/manual/02-창고/04-매출-마감.md 경로 일치.
      // 진입 가드 ACCOUNTANT/MASTER (역마감 버튼은 페이지 내부에서 MASTER 만 노출).
      {
        path: '/warehouse/closing',
        element: (
          <RoleGuard allow={ACCOUNTING_ROLES}>
            <MonthEndClosingPage />
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

      // [Phase 10 P0-5 / slice 4] 관리자 통합 admin — MASTER 전용 5 페이지.
      // AdminLayout 자체에 RoleGuard(MASTER) 가 있으므로 outlet children 은 별도 가드 불필요.
      {
        path: '/admin',
        element: <AdminLayout />,
        children: [
          { path: 'users', element: <AdminUsersPage /> },
          { path: 'roles', element: <AdminRolesPage /> },
          { path: 'partners', element: <AdminPartnersPage /> },
          { path: 'warehouses', element: <AdminWarehousesPage /> },
          { path: 'departments', element: <AdminDepartmentsPage /> },
          // [PR-D Phase B FE-A] 구글 시트 동기화
          { path: 'sheet-sync', element: <AdminSheetSyncPage /> },
          // [PR-D Phase B FE-E] 발송금지 거래처 (BE 가 MASTER 강제 — AdminLayout MASTER 가드와 일치)
          { path: 'blocked-partners', element: <AdminBlockedPartnersPage /> },
          // [PR-F1 Designer mock] 알리고 주소록 자동 동기화 (MASTER, AdminLayout 가드)
          { path: 'aligo-address-book', element: <AdminAligoAddressBookPage /> },
        ],
      },

      // [PR-D Phase B FE-B] arologis 가배차 지역 분류 — MASTER / MANAGER (DISPATCH backlog).
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
    ],
  },
])

/**
 * 앱 루트가 import 하는 RouterProvider wrapper.
 */
export function AppRouter() {
  return <RouterProvider router={router} />
}
