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
 * - `/sales/link-dispatch`  링크발송 (배송 묶음 + e-sign URL SMS) — notification-slice-B
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
 * [Phase 6 v2] sales sub-route ([판매] 메뉴 4 sub):
 * - `/sales/estimates`            견적서 목록
 * - `/sales/estimates/new`        견적서 작성
 * - `/sales/estimates/:id`        견적서 상세
 * - `/sales/estimates/:id/print`  견적서 인쇄 미리보기 (legacy 종합견적서 양식 1:1)
 * - `/sales/partner-orders`       주문서 조회 (read-only)
 * - `/sales/partner-orders/:id`   주문서 상세
 * - `/sales/order-approvals`      주문서 승인 (v2 §정정 9 — 기존 long-pending 폐기)
 * - `/sales/partner-dc-config`    거래처 DC율 설정 (v2 §정정 14 신규)
 *
 * 기존 PR #18 의 `/slips`, `/slips/new` 라우트는 폐기.
 * v1 의 `/sales/long-pending` 은 `/sales/order-approvals` 로 통합 (v2 §정정 9).
 */
import { createHashRouter, RouterProvider } from 'react-router-dom'
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
// signature-slice-C 모바일 mock 라우트 (Phase 5 nginx 분리 전 시뮬레이션 — AuthGuard 외부)
import { MobileSignaturePage } from './MobileSignaturePage'
import { MobileRecipientPage } from './MobileRecipientPage'
// accounting-slice-A 회계 라우트 5종 (ACCOUNTANT/MASTER 만 — RoleGuard 적용)
import { AccountTreePage } from './AccountTreePage'
import { JournalListPage } from './JournalListPage'
import { JournalFormPage } from './JournalFormPage'
import { JournalDetailPage } from './JournalDetailPage'
import { TrialBalancePage } from './TrialBalancePage'
// [Phase 6 v2] sales 라우트 — 견적/주문/승인/DC 4 sub
import { SalesEstimateListPage } from './SalesEstimateListPage'
import { SalesEstimateFormPage } from './SalesEstimateFormPage'
import { SalesEstimateDetailPage } from './SalesEstimateDetailPage'
import { SalesEstimatePrintPage } from './SalesEstimatePrintPage'
import { SalesPartnerOrderListPage } from './SalesPartnerOrderListPage'
import { SalesPartnerOrderDetailPage } from './SalesPartnerOrderDetailPage'
import { SalesOrderApprovalsPage } from './SalesOrderApprovalsPage'
import { SalesPartnerDcConfigPage } from './SalesPartnerDcConfigPage'

/** 회계 권한 풀네임 화이트리스트 (feedback_role_naming_full.md). */
const ACCOUNTING_ROLES = ['ACCOUNTANT', 'MASTER'] as const

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
      // notification-slice-B: 링크발송 (배송 묶음) — `/sales/:id` 보다 먼저 매칭되어야 함
      { path: '/sales/link-dispatch', element: <LinkDispatchListPage /> },

      // [Phase 6 v2] sales sub-route ([판매] 메뉴 4 sub)
      { path: '/sales/estimates', element: <SalesEstimateListPage /> },
      { path: '/sales/estimates/new', element: <SalesEstimateFormPage /> },
      { path: '/sales/estimates/:id', element: <SalesEstimateDetailPage /> },
      { path: '/sales/estimates/:id/print', element: <SalesEstimatePrintPage /> },
      { path: '/sales/partner-orders', element: <SalesPartnerOrderListPage /> },
      { path: '/sales/partner-orders/:id', element: <SalesPartnerOrderDetailPage /> },
      { path: '/sales/order-approvals', element: <SalesOrderApprovalsPage /> },
      { path: '/sales/partner-dc-config', element: <SalesPartnerDcConfigPage /> },

      { path: '/sales/:id', element: <SlipDetailPage mode="OUTBOUND" /> },
      { path: '/sales/:id/print/invoice', element: <InvoiceView /> },
      { path: '/sales/:id/print/dispatch', element: <DispatchView /> },

      // 구매조회 (입고전표)
      { path: '/purchases', element: <SlipListPage mode="INBOUND" /> },
      { path: '/purchases/new', element: <SlipFormPage mode="INBOUND" /> },
      { path: '/purchases/:id', element: <SlipDetailPage mode="INBOUND" /> },

      // 재고이동
      { path: '/transfers', element: <TransferListPage /> },
      { path: '/transfers/new', element: <TransferFormPage /> },
      { path: '/transfers/:id', element: <TransferDetailPage /> },

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
    ],
  },
])

/**
 * 앱 루트가 import 하는 RouterProvider wrapper.
 */
export function AppRouter() {
  return <RouterProvider router={router} />
}
