/**
 * 인증된 사용자용 앱 셸 레이아웃 — 좌측 사이드바 + 우측 본문 (Outlet).
 *
 * 사이드바 메뉴 (slip-output-format 슬라이스 IA 재편 — Q1=A 새 슬라이스):
 * - 홈 (`/`)
 * - 창고 관리 (`/warehouses`)
 * - 판매관리 (`/sales`)     — [2a 통합] SalesQueryPage 직행. 영업원 메인. legacy SlipListPage 는 `/sales/slips`.
 * - 구매관리 (`/purchases`) — [2a 통합] PurchaseQueryPage 직행. 회계원 메인. legacy SlipListPage 는 `/purchases/slips`.
 * - 재고이동 관리 (`/transfers`) — 창고 간 이동, 창고원/재고원
 * - 링크발송 (`/sales/link-dispatch`) — 배송 묶음 + e-sign URL SMS 발송, MANAGER/MASTER
 *
 * accounting-slice-A 신규 그룹 "회계" — ACCOUNTANT/MANAGER/MASTER 가시:
 * - 계정과목 (`/accounting/accounts`)
 * - 분개장   (`/accounting/journals`)
 * - 시산표   (`/accounting/balances`)
 *
 * 기존 PR #18 의 `/slips` IA 는 폐기. 영업/회계/창고 흐름 분리.
 *
 * 우상단에는 현재 사용자명 + 역할 + 사용자 dropdown 메뉴 (비밀번호 변경 / 로그아웃) 를 표시한다.
 * 인쇄 화면 (`/print/...`) 에서는 @media print CSS 가 사이드바/헤더를 숨긴다.
 *
 * Slice A (sales-polish-2-slice) 갱신 — Designer `wireframes.md` § 1 + `components.md` § 2:
 * - 헤더 `<h2>업무 화면</h2>` 고정 → `usePageTitleStore` 의 동적 화면명 + meta bracket
 * - 사용자 피드백 #2 ("상단 '업무 화면' 표시" 모호) 해결
 * - 빈 title 시 "업무 화면" fallback 표시 (라우트 전환 race condition 호환)
 *
 * Phase 10 P0-2 갱신:
 * - 우상단 사용자 chip → dropdown 토글 (비밀번호 변경 link 추가)
 * - 외부 클릭 / Esc 키 dropdown 자동 닫기
 */
import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { hasBuiltinRoleGroup, useSessionStore } from '../stores/session'
import { usePageTitleStore } from '../stores/pageTitle'
// [SP-D1 cycle 2] 동적 RBAC 권한 훅 — 사이드바 메뉴 동적 hidden 연동.
import { usePermissions } from '../hooks/usePermissions'
import type { AuthSnapshot } from '../types/electron'
import { NotificationBellDropdown } from './NotificationBellDropdown'

/**
 * 사이드바 NavLink — 권한 없으면 완전 미렌더 (hidden).
 *
 * SP-D1 정책: 권한 없는 메뉴는 회색 비활성화가 아닌 완전 미노출.
 * show=false 시 null 반환 — DOM 에 렌더되지 않음.
 *
 * @param show - 권한 보유 여부 (false 시 미렌더)
 */
function SidebarLink({
  to,
  show,
  'data-testid': testId,
  style,
  children,
}: {
  to: string
  show: boolean
  /** @deprecated SP-D1 hidden 정책으로 tooltip 미사용. 하위호환 유지용. */
  requiredRole?: string
  'data-testid'?: string
  style?: React.CSSProperties
  children: React.ReactNode
}) {
  if (!show) return null

  return (
    <NavLink
      to={to}
      data-testid={testId}
      style={style}
    >
      {children}
    </NavLink>
  )
}

function SidebarGroupToggle({
  label,
  open,
  onToggle,
  testId,
  controls,
}: {
  label: string
  open: boolean
  onToggle: () => void
  testId: string
  controls: string
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        minHeight: 34,
        padding: 'var(--space-2) var(--space-3)',
        border: 'none',
        borderRadius: 'var(--radius-md)',
        background: 'transparent',
        color: 'var(--color-neutral-700)',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: 600,
        textAlign: 'left',
      }}
    >
      <span>{label}</span>
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        aria-hidden="true"
        style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 120ms ease' }}
      >
        <path
          d="M3.5 5.25 7 8.75l3.5-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}

function SidebarCategory({
  label,
  show,
  children,
}: {
  label: string
  show: boolean
  children: React.ReactNode
}) {
  if (!show) return null

  return (
    <>
      <div
        className="app-sidebar-group"
        aria-hidden="true"
        style={{
          marginTop: 16,
          padding: '4px 8px',
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--color-neutral-400)',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {label}
      </div>
      {children}
    </>
  )
}

/**
 * [samhan-dispatch-board Phase A] 배차 메뉴 (/dispatch-board) — DISPATCH/MANAGER/MASTER.
 * Samhan Public 배차담당자 → 차량 그룹 + arologis 발송 흐름.
 */

function hasAnyBuiltinRoleGroup(auth: AuthSnapshot | null, roles: readonly string[]): boolean {
  return roles.some((role) => hasBuiltinRoleGroup(auth, role))
}

export function AppLayout() {
  const auth = useSessionStore((s) => s.auth)
  const logout = useSessionStore((s) => s.logout)
  const title = usePageTitleStore((s) => s.title)
  const meta = usePageTitleStore((s) => s.meta)
  const navigate = useNavigate()

  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [accountingAdminOpen, setAccountingAdminOpen] = useState(true)
  const userMenuRef = useRef<HTMLDivElement | null>(null)

  // [SP-D1 cycle 2] 동적 RBAC 권한 훅 — 5분 캐시. 사이드바 메뉴 hidden 연동.
  const { canAccess: dynamicCanAccess } = usePermissions()

  // 외부 클릭 시 dropdown 닫기
  useEffect(() => {
    if (!userMenuOpen) return
    const handler = (e: MouseEvent) => {
      const node = userMenuRef.current
      if (node && !node.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [userMenuOpen])

  // Esc 키 dropdown 닫기
  useEffect(() => {
    if (!userMenuOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setUserMenuOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [userMenuOpen])

  const handleLogout = async () => {
    setUserMenuOpen(false)
    await logout()
    navigate('/login', { replace: true })
  }

  const handlePasswordChange = () => {
    setUserMenuOpen(false)
    navigate('/password/change')
  }

  // race condition 호환 — 빈 title 시 "업무 화면" fallback (Designer § 2.7)
  const displayTitle = title || '업무 화면'

  // [SP-D2] 회계 그룹 사이드바 — 동적 RBAC 연동.
  // SP-D1 정책: 권한 없는 메뉴는 회색 비활성 X — 완전 미노출(null) 의무.
  //
  // 회계 카테고리 헤더: 12개 PageCode 중 1개라도 canAccess=true 면 표시.
  // RBAC 캐시 미로드 시 dynamicCanAccess 는 false 로 동작해 admin 메뉴 flash 를 방지한다.
  const showAccountingAccounts    = dynamicCanAccess('accounting.accounts',        'view')
  const showAccountingJournals    = dynamicCanAccess('accounting.journals',        'view')
  const showAccountingBalances    = dynamicCanAccess('accounting.balances',        'view')
  const showAccountingReports     = dynamicCanAccess('accounting.reports',         'view')
  const showAccountingPeriodClose = dynamicCanAccess('accounting.period-close',    'view')
  const showAccountingStatBatch   = dynamicCanAccess('accounting.statement-batch', 'view')
  const showAccountingPartnerLedger = dynamicCanAccess('accounting.partner-ledger', 'view')
  const showAccountingSalesSlip   = dynamicCanAccess('accounting.sales-slip.list', 'view')
  const showAccountingPurchaseSlip = dynamicCanAccess('accounting.purchase-slip.list', 'view')
  const showAccountingTaxInvoiceBatch = dynamicCanAccess('accounting.tax-invoice.batch-issue', 'view')
  const showAccountingTaxInvoiceInbound = dynamicCanAccess('accounting.tax-invoice.inbound', 'view')
  const showAccountingTaxInvoice  = dynamicCanAccess('accounting.tax-invoice.list', 'view')
  const showAccountingDailyClose  = dynamicCanAccess('accounting.daily-closing',   'view')
  const showAccountingLedger      = dynamicCanAccess('accounting.general-ledger',  'view')
  const showAccountingDepositMatch = dynamicCanAccess('accounting.deposit-match',  'view')
  const showAccountingAdminCash = dynamicCanAccess('ecount.mig14.cash-list', 'view')
  const showAccountingAdminOrder = dynamicCanAccess('ecount.mig14.order-list', 'view')
  const showAccountingAdminAging = dynamicCanAccess('ecount.mig14.aging-snapshot', 'view')
  const showAccountingAdminLedger = dynamicCanAccess('ecount.mig14.ledger', 'view')
  const showAccountingAdminMigOps = dynamicCanAccess('ecount.mig.ops-dashboard', 'view')
  const showAccountingEditRequests = dynamicCanAccess('accounting.edit-requests.decide', 'view')
  const showAccountingAdminGroup =
    showAccountingAdminCash || showAccountingAdminOrder
    || showAccountingAdminAging || showAccountingAdminLedger
    || showAccountingAdminMigOps || showAccountingEditRequests
  // 회계 카테고리 헤더: 12 PageCode 중 1개라도 가시이면 표시
  const showAccounting =
    showAccountingAccounts || showAccountingJournals || showAccountingBalances
    || showAccountingReports || showAccountingPeriodClose || showAccountingStatBatch
    || showAccountingSalesSlip || showAccountingPurchaseSlip
    || showAccountingPartnerLedger || showAccountingTaxInvoice || showAccountingDailyClose
    || showAccountingLedger || showAccountingDepositMatch
    || showAccountingAdminGroup
  const showDeliveryBatch = dynamicCanAccess('slip.delivery-batch', 'view')

  // [SP-D4] 잔여 7 도메인 22 PageCode 동적 RBAC 연동.
  // SP-D 일관성: dynamicCanAccess 는 캐시 미로드 시 false 로 deny 하며 로딩 flash 를 만들지 않는다.
  const showSalesSlipList          = dynamicCanAccess('sales.slip.list',             'view')
  const showPurchaseSlipList       = dynamicCanAccess('purchases.slip.list',         'view')
  const showEstimatesList          = dynamicCanAccess('estimates.list',               'view')
  const showPartnerOrderList       = dynamicCanAccess('sales.partner-order.list',     'view')
  const showVendorOrder            = dynamicCanAccess('sales.vendor-order',           'view')
  const showInventoryWarehouse     = dynamicCanAccess('inventory.warehouse',          'view')
  // inventory.stock — 현재 사이드바 직접 노출 없음 (재고 현황 서브페이지). 라우트 가드에서 사용.
  const showInventoryStockTransfer = dynamicCanAccess('inventory.stock-transfer',     'view')
  const showInventoryStockBalance  = dynamicCanAccess('inventory.stock-balance',      'view')
  const showInventoryDps           = dynamicCanAccess('inventory.dps',                'view')
  const showInventoryAuditPage     = dynamicCanAccess('inventory.audit',              'view')
  const showAdminEmployees         = dynamicCanAccess('admin.employees',              'view')
  const showAdminUsersMgmt         = dynamicCanAccess('admin.users',                  'view')
  const showPermissionAdmin        = dynamicCanAccess('system.permission-admin', 'view')
  // [C5-2b] MASTER role 문자열 fallback 제거 → system.permission-admin 동적 권한만 사용.
  // BE @RequirePermission(page="system.permission-admin") 가 MASTER bypass 포함 단일 가드.
  const showPermissionDelegation   = showPermissionAdmin
  const showPartnersList           = dynamicCanAccess('partners.list',                'view')
  const showPartnersBlock          = dynamicCanAccess('partners.block',               'view')
  // partners.edit-request — 현재 미사용 (사이드바 직접 노출/라우트 가드 소비처 없음 — 향후 메뉴 연결 예약).
  const _showPartnersEditRequest   = dynamicCanAccess('partners.edit-request',        'view')
  // products.* — [PR-B] products.list VIEW → '품목 관리' 사이드바 진입점.
  const showProductsList           = dynamicCanAccess('products.list',                'view')
  const _showProductsAdmin         = dynamicCanAccess('products.admin',               'view')
  const showProductsSync           = dynamicCanAccess('products.sync',                'view')
  const showArologisAdminPage      = dynamicCanAccess('arologis.admin',               'view')
  const showArologisRegionPage     = dynamicCanAccess('arologis.region',              'view')
  // SP-D4 그룹 헤더 가시성 (1개라도 true 이면 그룹 노출)
  const showInventoryGroup =
    showInventoryWarehouse || showInventoryStockTransfer || showInventoryStockBalance
    || showInventoryDps || showInventoryAuditPage
  // (사이클1 Codex fix C-4) showPartnersGroup 제거 — /admin/partners 직접 링크는 partners.list 1:1.
  const showAdminHrGroup   = showAdminEmployees || showAdminUsersMgmt || showPermissionAdmin || showPermissionDelegation

  // [C5 follow-up 사이클1 fix] arologis 메뉴 가시성 = 라우트 PermissionGuard 와 동일 page-code 단일 소스.
  // (사이클1 리뷰 FE P1-2 + Designer D-002: 그룹 UUID 매칭은 라우트 가드와 소스 이원화 — seed 불일치 시
  //  사이드바 노출↔진입 redirect 역전 발생. 라우트가 이미 page-code 게이팅이므로 동일 코드로 일원화.)
  const showArologisManual = dynamicCanAccess('arologis.dispatch.admin', 'view')
  // 가배차 분류 / 미배차 리스트 / 실배차 비교 — 라우트 공통 arologis.dispatch.ops
  const showArologisOps = dynamicCanAccess('arologis.dispatch.ops', 'view')
  const showDispatchSmsPage = dynamicCanAccess('dispatch.batch', 'view')
  const showDispatchSmsSendAudit = dynamicCanAccess('notification.dispatch-sms.send-audit', 'view')
  // arologis 그룹 가시성 — 수동 배차 / ops 3종 / 배차안내 SMS / 발송 이력 / P1-5 admin 중 하나라도 보이면 그룹 노출
  const showArologis
    = showArologisManual
    || showArologisOps
    || showDispatchSmsPage
    || showDispatchSmsSendAudit
    || showArologisAdminPage

  // 단톡방 매핑 entry 의 MASTER 제외 분기에서만 사용 — 빌트인 MASTER 그룹 UUID 내부 비교(화면 노출 없음).
  const showAdmin = hasAnyBuiltinRoleGroup(auth, ['MASTER'])
  const showAudit = showInventoryAuditPage
  const showDpsCompare = showInventoryDps
  const showDpsByProduct = showInventoryDps
  const showSlipEditRequests = dynamicCanAccess('slip.edit-requests.decide', 'view')
  const showPhotoAudit = dynamicCanAccess('slip.photo-audit', 'view')
  const showInventoryCompensationFailures = dynamicCanAccess('inventory.list', 'view')
  // [P0-9] 입고 검수 — WAREHOUSE / MANAGER / MASTER (inventory-service 권한과 일치)
  // [C5-2b] 입고 검수 정적 fallback 제거 — dynamicCanAccess 단독 사용.
  const showInboundInspection = dynamicCanAccess('inbound.inspection', 'view')
  const showSafetyStockAlerts = dynamicCanAccess('inventory.safety-stock', 'view')
  // 창고 운영 그룹 가시성 — 재고 실사 / DPS 입고 비교 / 품목별 DPS 분석 / 전표 요청 / 사진 감사 / 입고 검수 / 안전재고 알림 중 하나라도 보이면 그룹 노출
  // [SP-D4] inventory 그룹 PageCode 변수 병합 (showInventoryGroup 은 이 시점에서 미정의이므로 개별 항목 직접 OR)
  const showWarehouseOps = showAudit || showDpsCompare || showDpsByProduct || showSlipEditRequests || showPhotoAudit || showInboundInspection || showSafetyStockAlerts
  // [PR-D Phase B FE-D] 단톡방 매핑 — MASTER / MANAGER (BE @PreAuthorize 일치).
  // showAdmin 이 false 인 MANAGER 도 entry 가 가시되도록 별도 분기.
  // [PR-E1 FE-5] 전표 정리 entry — SALES / MANAGER / MASTER
  const showSlipCleanup = dynamicCanAccess('slip.cleanup', 'view')
  const showNextDaySlip = dynamicCanAccess('slip.print.next-day', 'view')
  const showVendorOrderOcr = showVendorOrder
  // [SP-09-3 + SP-D1 cycle 2] 영수증 OCR 업로드 entry — 동적 RBAC 권한 연동.
  // 기존 정적 역할 체크(WAREHOUSE/ACCOUNTANT/MANAGER/MASTER) → purchases.receipt-ocr 동적 canAccess 로 전환.
  // dynamicCanAccess 는 로딩 중 false(보수적 deny) → 캐시 완료 후 DB 값 적용.
  const showReceiptOcr = dynamicCanAccess('purchases.receipt-ocr', 'view')
  const showChatRoomAdmin = dynamicCanAccess('messenger.admin', 'view')

  // [Slice 2] admin GAS 이식 — 일반 카테고리 병행 노출
  const showRegionMgmt = showArologisRegionPage
  const showSheetSync = showProductsSync
  const showAligoAddressBook = dynamicCanAccess('aligo.address-book', 'view')
  const showBlockedPartners = showPartnersBlock
  const showPartnerManagement = showPartnersList
  const showPartnerDcConfig = dynamicCanAccess('sales.partner-dc-config', 'view')
  // [samhan-dispatch-board Phase A + SP-D1 cycle 2] 배차 메뉴 — 동적 RBAC 권한 연동.
  // 기존 정적 역할 체크 → dispatch.board 동적 canAccess 로 전환.
  const showDispatchBoard = dynamicCanAccess('dispatch.board', 'view')
  const showSales =
    showSalesSlipList || showEstimatesList || showPartnerOrderList
    || showPartnerDcConfig || showPartnerManagement || showSlipCleanup
    || showNextDaySlip || showVendorOrderOcr || showBlockedPartners
    || showProductsList || showSheetSync
  const showPurchase =
    showPurchaseSlipList || showReceiptOcr || showInventoryStockTransfer
    || showInboundInspection || showAudit || showDpsCompare || showDpsByProduct
  const showGroupware =
    showDeliveryBatch || showAligoAddressBook || (showChatRoomAdmin && !showAdmin)
  const showArologisGroup = showDispatchBoard || showArologis
  const showWarehouseOpsGroup =
    showInventoryWarehouse || showInventoryStockBalance || showSafetyStockAlerts
    || showInventoryCompensationFailures || showSlipEditRequests || showPhotoAudit

  return (
    <div className="app-shell">
      <aside className="app-sidebar no-print">
        <h1>Samhan Public</h1>
        <nav>
          <NavLink to="/" end>
            홈
          </NavLink>
          <NavLink to="/notifications" data-testid="sidebar-notifications">
            알림 내역
          </NavLink>

          {/* [Phase 6 v4 → P2-1] 판매 그룹 — 견적서 SamhanLogis 도메인 (legacy webview 폐기) + 4종 sub.
              [SP-D4] estimates.list / sales.partner-order.list 동적 RBAC 연동. */}
          <SidebarCategory label="판매" show={showSales}>
            <SidebarLink
              to="/sales"
              show={showSalesSlipList}
              data-testid="sidebar-sales"
            >
              판매관리
            </SidebarLink>
            {/* [SP-D4] estimates.list 동적 RBAC 연동 (기존 NavLink → SidebarLink). */}
            <SidebarLink
              to="/sales/estimates"
              show={showEstimatesList}
              data-testid="sidebar-sales-estimates"
            >
              견적서 관리
            </SidebarLink>
            {/* [SP-D4] sales.partner-order.list 동적 RBAC 연동 (기존 NavLink → SidebarLink). */}
            <SidebarLink
              to="/sales/partner-orders"
              show={showPartnerOrderList}
              data-testid="sidebar-sales-partner-orders"
            >
              주문서 관리
            </SidebarLink>
            <SidebarLink
              to="/sales/order-approvals"
              show={showPartnerOrderList}
            >
              주문서 승인
            </SidebarLink>
            {/* [C5 후속 C-4] 거래처 관리 — /admin/partners 라우트와 동일한 partners.list VIEW 기준. */}
            <SidebarLink
              to="/admin/partners"
              show={showPartnerManagement}
              requiredRole="SALES / MANAGER / MASTER"
              data-testid="sidebar-sales-partners"
            >
              거래처 관리
            </SidebarLink>
            <SidebarLink
              to="/sales/partner-dc-config"
              show={showPartnerDcConfig}
              requiredRole="SALES / MANAGER / MASTER"
              data-testid="sidebar-sales-partner-dc-config"
            >
              거래처 DC 설정
            </SidebarLink>
            {/* [C5 후속 C-4] 발송금지 거래처 — /admin/blocked-partners 라우트와 동일한 partners.block VIEW 기준. */}
            <SidebarLink
              to="/admin/blocked-partners"
              show={showBlockedPartners}
              requiredRole="MANAGER / MASTER"
              data-testid="sidebar-sales-blocked-partners"
            >
              발송금지 거래처
            </SidebarLink>
            <SidebarLink
              to="/sales/slip-cleanup"
              show={showSlipCleanup}
              requiredRole="SALES / MANAGER / MASTER"
              data-testid="sidebar-sales-slip-cleanup"
            >
              전표 정리
            </SidebarLink>
            <SidebarLink
              to="/sales/next-day-slip"
              show={showNextDaySlip}
              requiredRole="SALES / MANAGER / MASTER"
              data-testid="sidebar-sales-next-day-slip"
            >
              내일자 전표 이미지
            </SidebarLink>
            {/* [PR-F2 Designer mock] vendor 발주서 OCR 업로드 — SALES/MANAGER/MASTER.
                [SP-D4] sales.vendor-order 동적 RBAC 기반. */}
            <SidebarLink
              to="/sales/vendor-order-upload"
              show={showVendorOrderOcr}
              requiredRole="SALES / MANAGER / MASTER"
              data-testid="sidebar-sales-vendor-order-upload"
            >
              vendor 발주 OCR
            </SidebarLink>
            <SidebarLink
              to="/products/catalog"
              show={showProductsList}
              data-testid="sidebar-products-catalog"
            >
              품목 관리
            </SidebarLink>
            <SidebarLink
              to="/admin/sheet-sync"
              show={showSheetSync && showProductsList}
              requiredRole="MANAGER / MASTER"
              data-testid="sidebar-settings-sheet-sync-in-products"
            >
              시트 동기화
            </SidebarLink>
            <SidebarLink
              to="/admin/sheet-sync"
              show={showSheetSync && !showProductsList}
              requiredRole="MANAGER / MASTER"
              data-testid="sidebar-settings-sheet-sync"
            >
              시트 동기화
            </SidebarLink>
          </SidebarCategory>

          <SidebarCategory label="구매" show={showPurchase}>
            <SidebarLink
              to="/purchases"
              show={showPurchaseSlipList}
              data-testid="sidebar-purchases"
            >
              구매관리
            </SidebarLink>
            {/* [SP-09-3] 영수증 OCR 업로드 — WAREHOUSE / ACCOUNTANT / MANAGER / MASTER.
                구매관리 하위 진입점. ACCOUNTANT 추가 (2026-05-18 사용자 정정). */}
            <SidebarLink
              to="/purchases/receipt-ocr"
              show={showReceiptOcr}
              requiredRole="WAREHOUSE / ACCOUNTANT / MANAGER / MASTER"
              data-testid="sidebar-purchases-receipt-ocr"
            >
              영수증 OCR
            </SidebarLink>
            <SidebarLink
              to="/transfers"
              show={showInventoryStockTransfer}
              data-testid="sidebar-transfers"
            >
              재고이동 관리
            </SidebarLink>
            {/* [P0-9] 입고 검수 — WAREHOUSE/MANAGER/MASTER. */}
            <SidebarLink
              to="/warehouse/inbound-inspections"
              show={showInboundInspection}
              requiredRole="WAREHOUSE / MANAGER / MASTER"
              data-testid="sidebar-warehouse-inbound-inspections"
            >
              입고 검수
            </SidebarLink>
            <SidebarLink
              to="/warehouse/audit"
              show={showAudit}
              requiredRole="WAREHOUSE / MASTER"
            >
              재고 실사
            </SidebarLink>
            <SidebarLink
              to="/warehouse/dps-compare"
              show={showDpsCompare}
              requiredRole="WAREHOUSE / MANAGER / MASTER / INVENTORY"
              data-testid="sidebar-warehouse-dps-compare"
            >
              DPS 입고 비교
            </SidebarLink>
            {/* [P0-B GAS 보강] 품목별 DPS 분석 — DPS 비교 하위 들여쓰기 sub item */}
            <SidebarLink
              to="/warehouse/dps-compare/by-product"
              show={showDpsByProduct}
              requiredRole="WAREHOUSE / MANAGER / MASTER"
              data-testid="sidebar-warehouse-dps-by-product"
              style={{ paddingLeft: 20, fontSize: 13 }}
            >
              품목별 DPS 분석
            </SidebarLink>
          </SidebarCategory>

          <SidebarCategory label="회계" show={showAccounting}>
              {/* [SP-D2] 회계 각 메뉴 — SidebarLink + dynamicCanAccess 로 전환.
                  권한 없는 메뉴는 완전 미노출(null). 회색 비활성 X. */}
              <SidebarLink
                to="/accounting/sales-slips"
                show={showAccountingSalesSlip}
                data-testid="sidebar-accounting-sales-slips"
              >
                매출전표
              </SidebarLink>
              <SidebarLink
                to="/accounting/purchase-slips"
                show={showAccountingPurchaseSlip}
                data-testid="sidebar-accounting-purchase-slips"
              >
                매입전표
              </SidebarLink>
              <SidebarLink
                to="/accounting/accounts"
                show={showAccountingAccounts}
                data-testid="sidebar-accounting-accounts"
              >
                계정과목
              </SidebarLink>
              <SidebarLink
                to="/accounting/journals"
                show={showAccountingJournals}
                data-testid="sidebar-accounting-journals"
              >
                분개장
              </SidebarLink>
              <SidebarLink
                to="/accounting/tax-invoices"
                show={showAccountingTaxInvoice}
                data-testid="sidebar-accounting-tax-invoices"
              >
                세금계산서
              </SidebarLink>
              <SidebarLink
                to="/accounting/tax-invoices/batch"
                show={showAccountingTaxInvoiceBatch}
                data-testid="sidebar-accounting-tax-invoice-batch-issue"
              >
                세금계산서 발행 묶음
              </SidebarLink>
              <SidebarLink
                to="/accounting/tax-invoices/inbound"
                show={showAccountingTaxInvoiceInbound}
                data-testid="sidebar-accounting-tax-invoice-inbound"
              >
                수신 세금계산서
              </SidebarLink>
              <SidebarLink
                to="/accounting/balances"
                show={showAccountingBalances}
                data-testid="sidebar-accounting-balances"
              >
                시산표
              </SidebarLink>
              {/* [P0-1 Slice A+B+C] 재무 보고서 서브메뉴 — accounting.reports PageCode 로 통합. */}
              {showAccountingReports ? (
                <>
                  <NavLink
                    to="/accounting/reports"
                    end
                    data-testid="sidebar-accounting-reports"
                  >
                    재무 보고서
                  </NavLink>
                  <NavLink
                    to="/accounting/reports/income-statement"
                    data-testid="sidebar-accounting-income-statement"
                    style={{ paddingLeft: 20, fontSize: 13 }}
                  >
                    손익계산서
                  </NavLink>
                  <NavLink
                    to="/accounting/reports/balance-sheet"
                    data-testid="sidebar-accounting-balance-sheet"
                    style={{ paddingLeft: 20, fontSize: 13 }}
                  >
                    재무상태표
                  </NavLink>
                  <NavLink
                    to="/accounting/reports/vat"
                    end
                    data-testid="sidebar-accounting-vat-report"
                    style={{ paddingLeft: 20, fontSize: 13 }}
                  >
                    부가세 신고서
                  </NavLink>
                  <NavLink
                    to="/accounting/reports/corporate-tax"
                    end
                    data-testid="sidebar-accounting-corporate-tax"
                    style={{ paddingLeft: 20, fontSize: 13 }}
                  >
                    법인세 신고서
                  </NavLink>
                  <NavLink
                    to="/accounting/reports/partner-aging?type=RECEIVABLE"
                    end
                    data-testid="sidebar-accounting-partner-aging-receivable"
                    style={{ paddingLeft: 20, fontSize: 13 }}
                  >
                    미수금 (거래처별)
                  </NavLink>
                  <NavLink
                    to="/accounting/reports/partner-aging?type=PAYABLE"
                    end
                    data-testid="sidebar-accounting-partner-aging-payable"
                    style={{ paddingLeft: 20, fontSize: 13 }}
                  >
                    미지급금 (거래처별)
                  </NavLink>
                  <NavLink
                    to="/accounting/reports/cash-flow"
                    end
                    data-testid="sidebar-accounting-cash-flow"
                    style={{ paddingLeft: 20, fontSize: 13 }}
                  >
                    현금흐름표
                  </NavLink>
                  <NavLink
                    to="/accounting/reports/equity-changes"
                    end
                    data-testid="sidebar-accounting-equity-changes"
                    style={{ paddingLeft: 20, fontSize: 13 }}
                  >
                    자본변동표
                  </NavLink>
                  <NavLink
                    to="/accounting/reports/daily-summary"
                    end
                    data-testid="sidebar-accounting-daily-summary"
                    style={{ paddingLeft: 20, fontSize: 13 }}
                  >
                    일계표
                  </NavLink>
                  <NavLink
                    to="/accounting/reports/monthly-summary"
                    end
                    data-testid="sidebar-accounting-monthly-summary"
                    style={{ paddingLeft: 20, fontSize: 13 }}
                  >
                    월계표
                  </NavLink>
                </>
              ) : null}
              <SidebarLink
                to="/sales/closing"
                show={showAccountingPeriodClose}
                data-testid="sidebar-accounting-sales-closing"
              >
                매출 마감
              </SidebarLink>
              <SidebarLink
                to="/accounting/period-close"
                show={showAccountingPeriodClose}
                data-testid="sidebar-accounting-period-close"
              >
                월말 마감
              </SidebarLink>
              {/* [PR-E2 FE-8] 거래명세서 일괄 — accounting.statement-batch 동적 RBAC. */}
              <SidebarLink
                to="/accounting/statement-batch"
                show={showAccountingStatBatch}
                data-testid="sidebar-accounting-statement-batch"
              >
                거래명세서 일괄
              </SidebarLink>
              {/* [PR-E2 FE-7] 거래처 원장 — accounting.partner-ledger 동적 RBAC. */}
              <SidebarLink
                to="/accounting/partner-ledger"
                show={showAccountingPartnerLedger}
                data-testid="sidebar-accounting-partner-ledger"
              >
                거래처 원장
              </SidebarLink>
              {/* [PR-E2 FE-9] 홈택스 일괄 양식 — accounting.partner-ledger 동적 RBAC. */}
              <SidebarLink
                to="/accounting/hometax-export"
                show={showAccountingPartnerLedger}
                data-testid="sidebar-accounting-hometax-export"
              >
                홈택스 일괄 양식
              </SidebarLink>
              {/* [supplier-profile + datagrid] 공급자 설정 — accounting.partner-ledger 동적 RBAC. */}
              <SidebarLink
                to="/accounting/supplier-profiles"
                show={showAccountingPartnerLedger}
                data-testid="sidebar-accounting-supplier-profile"
              >
                공급자 설정
              </SidebarLink>
              {/* [SP-09-4] KFTC 오픈뱅킹 입금 매칭 — accounting.deposit-match 동적 RBAC. */}
              <SidebarLink
                to="/accounting/deposit-match"
                show={showAccountingDepositMatch}
                data-testid="sidebar-accounting-deposit-match"
              >
                입금 매칭
              </SidebarLink>
              {/* [SP-08-6-5 P2] 일마감 — accounting.daily-closing 동적 RBAC. */}
              <SidebarLink
                to="/accounting/daily-closing"
                show={showAccountingDailyClose}
                data-testid="sidebar-accounting-daily-closings"
              >
                일마감
              </SidebarLink>
              {/* [SP-08-6-5 P2] 원장 — accounting.general-ledger 동적 RBAC. */}
              <SidebarLink
                to="/accounting/ledgers"
                show={showAccountingLedger}
                data-testid="sidebar-accounting-ledgers"
              >
                원장
              </SidebarLink>
              {/* [MIG-18] 회계 관리자 그룹 — 동적 RBAC 캐시 false 시 그룹 전체 hidden. */}
              {showAccountingAdminGroup ? (
                <>
                  <SidebarGroupToggle
                    label="회계 관리자"
                    open={accountingAdminOpen}
                    onToggle={() => setAccountingAdminOpen((value) => !value)}
                    testId="sidebar-accounting-admin-group-toggle"
                    controls="sidebar-accounting-admin-group"
                  />
                  {accountingAdminOpen ? (
                    <div id="sidebar-accounting-admin-group" data-testid="sidebar-accounting-admin-group">
                      <SidebarLink
                        to="/accounting/admin/cash-disbursements"
                        show={showAccountingAdminCash}
                        data-testid="sidebar-accounting-admin-cash-disbursements"
                        style={{ paddingLeft: 28, fontSize: 13 }}
                      >
                        지출 트랜잭션
                      </SidebarLink>
                      <SidebarLink
                        to="/accounting/admin/cash-receipts"
                        show={showAccountingAdminCash}
                        data-testid="sidebar-accounting-admin-cash-receipts"
                        style={{ paddingLeft: 28, fontSize: 13 }}
                      >
                        입금 트랜잭션
                      </SidebarLink>
                      <SidebarLink
                        to="/accounting/admin/orders"
                        show={showAccountingAdminOrder}
                        data-testid="sidebar-accounting-admin-orders"
                        style={{ paddingLeft: 28, fontSize: 13 }}
                      >
                        주문서 관리
                      </SidebarLink>
                      <SidebarLink
                        to="/accounting/admin/aging-snapshot"
                        show={showAccountingAdminAging}
                        data-testid="sidebar-accounting-admin-aging-snapshot"
                        style={{ paddingLeft: 28, fontSize: 13 }}
                      >
                        잔액 스냅샷
                      </SidebarLink>
                      <SidebarLink
                        to="/accounting/admin/ledger/sales"
                        show={showAccountingAdminLedger}
                        data-testid="sidebar-accounting-admin-sales-ledger"
                        style={{ paddingLeft: 28, fontSize: 13 }}
                      >
                        매출 원장 대조
                      </SidebarLink>
                      <SidebarLink
                        to="/accounting/admin/ledger/purchase"
                        show={showAccountingAdminLedger}
                        data-testid="sidebar-accounting-admin-purchase-ledger"
                        style={{ paddingLeft: 28, fontSize: 13 }}
                      >
                        매입 원장 대조
                      </SidebarLink>
                      <SidebarLink
                        to="/accounting/admin/migration-ops"
                        show={showAccountingAdminMigOps}
                        data-testid="sidebar-accounting-admin-migration-ops"
                        style={{ paddingLeft: 28, fontSize: 13 }}
                      >
                        운영 대시보드
                      </SidebarLink>
                      <SidebarLink
                        to="/admin/accounting-edit-requests"
                        show={showAccountingEditRequests}
                        data-testid="sidebar-accounting-admin-edit-requests"
                        style={{ paddingLeft: 28, fontSize: 13 }}
                      >
                        회계 수정 요청
                      </SidebarLink>
                    </div>
                  ) : null}
                </>
              ) : null}
          </SidebarCategory>

          {/* [SP-D2] MANAGER 전용 단독 노출 블록 폐기 — 동적 RBAC 통합으로 메인 회계 블록에서 처리.
              showAccounting 이 dynamicCanAccess 기반으로 전환되어 MANAGER 도 포함됨. */}

          <SidebarCategory label="그룹웨어" show={showGroupware}>
            <SidebarLink
              to="/sales/link-dispatch"
              show={showDeliveryBatch}
              requiredRole="MANAGER / MASTER"
              data-testid="sidebar-link-dispatch"
            >
              링크발송
            </SidebarLink>
            <SidebarLink
              to="/admin/aligo-address-book"
              show={showAligoAddressBook}
              requiredRole="MANAGER / MASTER"
              data-testid="sidebar-messenger-aligo-address-book"
            >
              알리고 주소록
            </SidebarLink>
            <SidebarLink
              to="/admin/chat-rooms"
              show={showChatRoomAdmin && !showAdmin}
              requiredRole="MASTER / MANAGER"
              data-testid="sidebar-admin-chat-rooms"
            >
              단톡방 매핑
            </SidebarLink>
          </SidebarCategory>

          {/*
            [PR-HR] 인사 카테고리 — 대표실 부서 + MASTER 만 접근 가능.
            disabled 시 tooltip: "대표실 부서 권한자만 접근 가능".
            활성 시 AdminLayout (/admin/users) 로 진입.
          */}
          {/* SP-D1: 인사 카테고리 — 권한 캐시 미로드 시 완전 미노출.
              SP-D4: admin.employees / admin.users 동적 RBAC 연동 — showAdminHrGroup 추가.
              Phase 1 Task 14: 권한 관리 진입점은 MASTER + system.permission-admin(view) 로 fail-closed. */}
          <SidebarCategory label="인사" show={showAdminHrGroup}>
            {/* admin.employees — MASTER/MANAGER (SP-D4 §2). */}
            <SidebarLink
              to="/admin/users"
              show={showAdminEmployees}
              data-testid="sidebar-hr-users"
            >
              인사 관리
            </SidebarLink>
            {/* 권한 관리 — MASTER 전용. route 도 RoleGuard + system.permission-admin(view) 로 이중 가드. */}
            <SidebarLink
              to="/admin/permission-matrix"
              show={showPermissionAdmin}
              data-testid="sidebar-hr-permission-matrix"
            >
              권한설정
            </SidebarLink>
            <SidebarLink
              to="/admin/permission-matrix/bulk"
              show={showPermissionAdmin}
              data-testid="sidebar-hr-permission-bulk"
            >
              권한 일괄 적용
            </SidebarLink>
            <SidebarLink
              to="/admin/permission-groups/matrix"
              show={showPermissionAdmin}
              data-testid="sidebar-hr-permission-groups-matrix"
            >
              그룹 권한
            </SidebarLink>
            <SidebarLink
              to="/admin/permission-groups/manage"
              show={showPermissionAdmin}
              data-testid="sidebar-hr-permission-groups-manage"
            >
              권한그룹 관리
            </SidebarLink>
            <SidebarLink
              to="/admin/permission-groups/delegation"
              show={showPermissionDelegation}
              data-testid="sidebar-hr-permission-delegation"
            >
              권한 위임
            </SidebarLink>
          </SidebarCategory>

          <SidebarCategory label="arologis" show={showArologisGroup}>
              {/* [samhan-dispatch-board Phase A] 배차 메뉴 — DISPATCH/MANAGER/MASTER.
                  Samhan Public 배차담당자 → 미배차 출고전표 + 차량 그룹 + arologis 발송. */}
              <SidebarLink
                to="/dispatch-board"
                show={showDispatchBoard}
                requiredRole="DISPATCH / MANAGER / MASTER"
                data-testid="sidebar-dispatch-board"
              >
                배차 메뉴
              </SidebarLink>
              <SidebarLink
                to="/arologis/manual"
                show={showArologisManual}
                requiredRole="DISPATCH / MANAGER / MASTER"
              >
                수동 배차
              </SidebarLink>
              {/* [Phase 10 PR-E1 FE-2] 가배차 분류 — MASTER/MANAGER/DISPATCH. */}
              <SidebarLink
                to="/arologis/pre-classify"
                show={showArologisOps}
                requiredRole="DISPATCH / MANAGER / MASTER"
                data-testid="sidebar-arologis-preclassify"
              >
                가배차 분류
              </SidebarLink>
              {/* [Phase 10 PR-E1 FE-3] 미배차 리스트 — MASTER/MANAGER/DISPATCH. */}
              <SidebarLink
                to="/arologis/unassigned"
                show={showArologisOps}
                requiredRole="DISPATCH / MANAGER / MASTER"
                data-testid="sidebar-arologis-unassigned"
              >
                미배차 리스트
              </SidebarLink>
              {/* [PR-E1 FE-6] 배차안내 SMS — DISPATCH/MANAGER/MASTER. */}
              <SidebarLink
                to="/arologis/dispatch-sms"
                show={showDispatchSmsPage}
                requiredRole="DISPATCH / MANAGER / MASTER"
                data-testid="sidebar-arologis-dispatch-sms"
              >
                배차안내 SMS
              </SidebarLink>
              {/* [SP-09-2 FE] SMS 발송 이력 — SEND_AUDIT 전용 조회화면. */}
              <SidebarLink
                to="/arologis/dispatch-sms/send-audit"
                show={showDispatchSmsSendAudit}
                requiredRole="DISPATCH / MANAGER / MASTER"
                data-testid="sidebar-arologis-sms-send-audit"
              >
                SMS 발송 이력
              </SidebarLink>
              {/* [SP-04] 운송사 실배차 비교 — hidden route 를 공식 메뉴 entry 로 승격. */}
              <SidebarLink
                to="/arologis/dispatch-reconcile"
                show={showArologisOps}
                requiredRole="DISPATCH / MANAGER / MASTER"
                data-testid="sidebar-arologis-dispatch-reconcile"
              >
                실배차 비교
              </SidebarLink>
              {/* [C5 후속 C-4] 배차지역 관리 — /admin/regions 라우트와 동일한 arologis.region VIEW 기준. */}
              <SidebarLink
                to="/admin/regions"
                show={showRegionMgmt}
                requiredRole="DISPATCH / MANAGER / MASTER"
                data-testid="sidebar-arologis-region-mgmt"
              >
                배차지역 관리
              </SidebarLink>
              {/* [P1-5] arologis 배차 admin 3개 신규 메뉴 — MANAGER / MASTER. */}
              <SidebarLink
                to="/arologis/admin/auto-dispatch"
                show={showArologisAdminPage}
                requiredRole="MANAGER / MASTER"
                data-testid="sidebar-arologis-auto-dispatch"
              >
                자동 매칭
              </SidebarLink>
              <SidebarLink
                to="/arologis/admin/manual-dispatch"
                show={showArologisAdminPage}
                requiredRole="MANAGER / MASTER"
                data-testid="sidebar-arologis-manual-dispatch-admin"
              >
                배차 관리
              </SidebarLink>
              <SidebarLink
                to="/arologis/admin/driver-assignment"
                show={showArologisAdminPage}
                requiredRole="MANAGER / MASTER"
                data-testid="sidebar-arologis-driver-assignment"
              >
                기사 배정
              </SidebarLink>
          </SidebarCategory>

          <SidebarCategory label="창고 운영" show={showWarehouseOpsGroup}>
              <SidebarLink
                to="/warehouses"
                show={showInventoryWarehouse}
                data-testid="sidebar-warehouses"
              >
                창고관리
              </SidebarLink>
              {/* [C5 후속 C-4] 재고 현황 — /inventory/stock-balance 라우트와 동일한 inventory.stock-balance VIEW 기준. */}
              <SidebarLink
                to="/inventory/stock-balance"
                show={showInventoryStockBalance}
                requiredRole="WAREHOUSE / MANAGER / MASTER"
                data-testid="sidebar-inventory-stock-balance"
              >
                재고 현황
              </SidebarLink>
              {/* [P1-3] 안전재고 알림 — MASTER/MANAGER/WAREHOUSE. */}
              <SidebarLink
                to="/inventory/safety-stock-alerts"
                show={showSafetyStockAlerts}
                requiredRole="MASTER / MANAGER / WAREHOUSE"
                data-testid="sidebar-warehouse-safety-stock-alerts"
              >
                안전재고 알림
              </SidebarLink>
              {/* [D-SER-23] 시리얼 보상 실패 복구 — inventory.list(view) 권한 보유자 노출.
                  SP-D4 기준: WAREHOUSE/MANAGER/MASTER 에 inventory.list view 부여. */}
              <SidebarLink
                to="/inventory/compensation-failures"
                show={showInventoryCompensationFailures}
                requiredRole="WAREHOUSE / MANAGER / MASTER"
                data-testid="sidebar-warehouse-compensation-failures"
              >
                보상 실패 복구
              </SidebarLink>
              {/* [PR-H3 FE-1] 전표 수정/삭제 요청 대시보드 — WAREHOUSE/MANAGER/MASTER. */}
              <SidebarLink
                to="/admin/slip-edit-requests"
                show={showSlipEditRequests}
                requiredRole="WAREHOUSE / MANAGER / MASTER"
                data-testid="sidebar-warehouse-slip-edit-requests"
              >
                전표 수정 요청
              </SidebarLink>
              {/* [D-AX-20] 사진 감사 — WAREHOUSE/MANAGER/MASTER. */}
              <SidebarLink
                to="/admin/photo-audit"
                show={showPhotoAudit}
                requiredRole="WAREHOUSE / MANAGER / MASTER"
                data-testid="sidebar-warehouse-photo-audit"
              >
                사진 감사
              </SidebarLink>
          </SidebarCategory>
        </nav>
        <div style={{ marginTop: 'auto', fontSize: 12, color: 'var(--color-neutral-500)' }}>
          v0.1.0 · 사내 전용
        </div>
      </aside>
      <main className="app-main">
        <header className="app-header no-print">
          <h2 data-testid="header-page-title">
            {displayTitle}
            {meta ? <span className="app-header-meta">[{meta}]</span> : null}
          </h2>
          <div className="app-header-actions">
            <NotificationBellDropdown />
            <div
              ref={userMenuRef}
              style={{ position: 'relative', display: 'inline-block' }}
            >
              <button
                type="button"
                className="app-user-chip"
                onClick={() => setUserMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                data-testid="header-user-name"
                style={{
                  background: 'transparent',
                  border: '1px solid var(--color-neutral-200)',
                  borderRadius: 6,
                  padding: '6px 10px',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                {auth?.fullName ?? '사용자'} · {auth?.role ?? '-'}
                <span aria-hidden="true" style={{ marginLeft: 6, fontSize: 10 }}>
                  ▼
                </span>
              </button>
              {userMenuOpen ? (
                <div
                  role="menu"
                  data-testid="header-user-menu"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    right: 0,
                    minWidth: 180,
                    background: 'var(--color-neutral-0)',
                    border: '1px solid var(--color-neutral-200)',
                    borderRadius: 6,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    padding: 4,
                    zIndex: 1000,
                  }}
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handlePasswordChange}
                    data-testid="header-user-menu-password-change"
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      background: 'transparent',
                      border: 'none',
                      padding: '8px 12px',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 13,
                      color: 'var(--color-neutral-800)',
                    }}
                    onMouseEnter={(e) => {
                      ;(e.currentTarget as HTMLButtonElement).style.background
                        = 'var(--color-neutral-100)'
                    }}
                    onMouseLeave={(e) => {
                      ;(e.currentTarget as HTMLButtonElement).style.background
                        = 'transparent'
                    }}
                  >
                    비밀번호 변경
                  </button>
                  <div
                    style={{
                      height: 1,
                      background: 'var(--color-neutral-200)',
                      margin: '4px 0',
                    }}
                  />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleLogout}
                    data-testid="sidebar-logout"
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      background: 'transparent',
                      border: 'none',
                      padding: '8px 12px',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 13,
                      color: 'var(--color-neutral-800)',
                    }}
                    onMouseEnter={(e) => {
                      ;(e.currentTarget as HTMLButtonElement).style.background
                        = 'var(--color-neutral-100)'
                    }}
                    onMouseLeave={(e) => {
                      ;(e.currentTarget as HTMLButtonElement).style.background
                        = 'transparent'
                    }}
                  >
                    로그아웃
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  )
}
