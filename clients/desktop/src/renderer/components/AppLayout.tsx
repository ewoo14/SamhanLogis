/**
 * 인증된 사용자용 앱 셸 레이아웃 — 좌측 사이드바 + 우측 본문 (Outlet).
 *
 * 사이드바 IA (desktop-menu-5category 슬라이스 — 5대분류 재편, PR #462):
 * 상단 고정 링크 2개 + 8개 SidebarCategory 그룹 구조.
 *
 * 상단 고정 (그룹 미소속, 항상 표시):
 * - 홈        (`/`, NavLink end) — 대시보드 라벨 폐기, "홈" 단독.
 * - 알림 내역 (`/notifications`)
 *
 * 8 SidebarCategory 그룹 (각 그룹은 권한 1개라도 보이면 헤더+자식 노출, 전무 시 완전 미렌더):
 * - 판매     — 판매관리/견적서/주문서/거래처/DC설정/발송금지/전표정리/내일자전표/품목 관리/시트 동기화
 * - 구매     — 구매관리/재고이동 관리/입고 검수/재고실사/DPS 비교
 * - 회계     — 매출·입고전표/계정과목/분개장/세금계산서/시산표/재무보고서/마감/원장/운영 회계 항목
 * - 그룹웨어 — 링크발송/알리고 주소록/메신저
 * - 인사     — 인사 관리/권한설정/권한 일괄/그룹 권한/권한그룹 관리/권한 위임
 * - 배차     — 배차현황/가배차리스트/미배차리스트/배차안내 SMS/실배차 비교/배차지역 관리/배차 admin
 * - 창고 운영 — 창고관리/재고 현황/안전재고/보상 실패 복구/전표 수정 요청/사진 감사
 *
 * 그룹/항목 권한은 usePermissions().canAccess(pageCode, action) 동적 RBAC 단일 소스이며,
 * 라우트 PermissionGuard 와 동일 page-code 로 일원화한다 (사이드바 노출↔진입 redirect 역전 방지).
 * 기존 PR #18 의 `/slips` IA 및 평면(홈/창고/판매/구매 단일 NavLink) IA 는 폐기.
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
import { useQueryClient } from '@tanstack/react-query'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { canQueryPurchases, canQuerySales, useSessionStore } from '../stores/session'
import { usePageTitleStore } from '../stores/pageTitle'
// [SP-D1 cycle 2] 동적 RBAC 권한 훅 — 사이드바 메뉴 동적 hidden 연동.
import { usePermissions } from '../hooks/usePermissions'
import { useMenuCatalog } from '../hooks/useMenuCatalog'
import { NotificationBellDropdown } from './NotificationBellDropdown'
import { recordMenuAccess } from '../api/activityLog'
import { resolveBuildAppVersion } from '../version/versionCheck'
import { sanitizeDisplayName } from '../common/userDisplayName'

const CURRENT_VERSION = resolveBuildAppVersion(
  import.meta.env.VITE_APP_VERSION ?? (import.meta.env.MODE === 'test' ? '0.1.0' : undefined),
)

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
  id,
  variant = 'subgroup',
}: {
  label: string
  open: boolean
  onToggle: () => void
  testId: string
  controls: string
  id?: string
  variant?: 'subgroup' | 'category'
}) {
  const isCategory = variant === 'category'

  return (
    <button
      id={id}
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
        minHeight: isCategory ? 26 : 34,
        padding: isCategory ? '4px 8px' : 'var(--space-2) var(--space-3)',
        border: 'none',
        borderRadius: isCategory ? 0 : 'var(--radius-md)',
        background: 'transparent',
        color: isCategory ? 'var(--color-neutral-400)' : 'var(--color-neutral-700)',
        cursor: 'pointer',
        fontSize: isCategory ? 11 : 13,
        fontWeight: 600,
        textAlign: 'left',
        textTransform: isCategory ? 'uppercase' : undefined,
        letterSpacing: isCategory ? 0.5 : undefined,
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

function compactSidebarLabel(label: string): string {
  return label.replace(/\s+/g, '')
}

function readSidebarGroupOpen(storageKey: string): boolean {
  if (typeof window === 'undefined') return false

  try {
    return window.localStorage.getItem(storageKey) === 'true'
  } catch {
    return false
  }
}

function writeSidebarGroupOpen(storageKey: string, open: boolean): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(storageKey, String(open))
  } catch {
    // localStorage 접근이 막힌 환경에서는 세션 내 상태만 유지한다.
  }
}

const MENU_ACCESS_DEBOUNCE_MS = 1_000

const ROUTE_PAGE_CODES: Array<{ prefix: string; pageCode: string; label: string }> = [
  { prefix: '/admin/app-releases', pageCode: 'admin.app-release', label: '버전 관리' },
  { prefix: '/admin/app-notices', pageCode: 'dev.popup-notice', label: '팝업공지' },
  { prefix: '/admin/activity-logs', pageCode: 'dev.activity-log', label: '로그' },
  { prefix: '/notifications', pageCode: 'notifications.center', label: '알림 내역' },
  { prefix: '/warehouses', pageCode: 'inventory.warehouse', label: '창고 관리' },
  { prefix: '/sales/partner-orders', pageCode: 'sales.partner-order.list', label: '거래처주문' },
  { prefix: '/sales/estimates', pageCode: 'estimates.list', label: '견적' },
  { prefix: '/sales', pageCode: 'sales.slip.list', label: '판매관리' },
  { prefix: '/purchases', pageCode: 'purchases.slip.list', label: '구매관리' },
  { prefix: '/accounting/admin/cash-receipts', pageCode: 'accounting.cash-receipts', label: '입금보고서' },
  { prefix: '/accounting/bank-card-admin', pageCode: 'accounting.bank-card-admin', label: '계좌/카드 관리' },
  { prefix: '/accounting', pageCode: 'accounting.reports', label: '회계' },
  { prefix: '/arologis', pageCode: 'arologis.dispatch.ops', label: '배차' },
  { prefix: '/dispatch-board', pageCode: 'dispatch.board', label: '배차현황' },
]

function pageCodeForPath(pathname: string): { pageCode: string; label: string } | null {
  if (pathname === '/') return { pageCode: 'dashboard.admin', label: '홈' }
  return ROUTE_PAGE_CODES.find((entry) => pathname.startsWith(entry.prefix)) ?? null
}

/**
 * PR #921 chore-B SONNET5 R1 — 이 pathname 의 `.app-main` 렌더가 "그 자체로 인쇄 대상"인지 판정한다.
 * ①전체 페이지 인쇄 라우트(20개 — 경로에 `/print` 세그먼트 보유: `/sales/:id/print/statement` 류
 * prefix/중간/suffix 전부 매치) ②페이지 내 `window.print()` 로 `.app-main` 자신을 인쇄하는 조회
 * 화면(판매조회/구매조회 일괄 인쇄 — PR #921 R-2 fence #6). global.css `@media print` 의
 * `.app-main:not(.is-print-surface)` 차폐 규칙과 짝을 이룬다 — 전역 모달 게이트
 * (AppVersionGate/AppNoticeGate) 나 기타 모달이 이 라우트 위에 열려 있어도 인쇄 대상 자신을
 * 지우지 않기 위함이다(불변식 I-3). `/print` 판정은 세그먼트 경계(`/` 또는 문자열 끝)까지 확인해
 * 우연한 부분일치(예: `/imprint`)를 배제한다.
 *
 * PR #921 chore-B R4 (CODEX SOL 2차 적대검증 B-1) — `/sales/query`·`/purchases/query` 는
 * deep-link/bookmark 호환용 **별칭**일 뿐, 사이드바 판매관리/구매관리 메뉴의 실제 진입점은
 * `/sales`·`/purchases`(routes/index.tsx `{ path: '/sales', element: <SalesQueryPage /> }` —
 * 별칭과 동일 컴포넌트를 렌더)다. 이 둘이 누락돼 기본 메뉴 경로에서 검색 모달을 열고 인쇄하면
 * 목록이 차폐됐다. `/sales/closing`(회계)·`/sales/link-dispatch`(그룹웨어) 같은 타 그룹 자식
 * 경로까지 인쇄 표면으로 오판하지 않도록 prefix 가 아닌 **exact 매칭**만 추가한다.
 * PR #921 chore-B CODEX LUNA 5.6 B-2 — React Router 와 같은 화면으로 해석되는 trailing slash·
 * 대소문자 변형도 같은 exact 경로로 판정하도록 비교 전에 정규화한다. 자식 경로는 정규화 후에도
 * 허용 목록과 exact 일치하지 않으므로 계속 제외된다.
 */
function isPrintSurfacePath(pathname: string): boolean {
  const normalizedPathname = pathname.replace(/\/$/, '').toLowerCase()

  if (
    normalizedPathname === '/sales' ||
    normalizedPathname === '/sales/query' ||
    normalizedPathname === '/purchases' ||
    normalizedPathname === '/purchases/query'
  ) {
    return true
  }
  return /(^|\/)print(\/|$)/.test(normalizedPathname)
}

/**
 * 현재 경로가 사이드바 그룹의 활성 대상(to)에 해당하는지 판정한다.
 *
 * [2026-06-11 P2 #1/#5] cross-group 자동펼침 오탐 차단 —
 *   기본 매칭은 prefix(`${to}/` 하위 포함)이지만, `exact=true` 면 정확 일치만 활성으로 본다.
 *   예: 판매 그룹의 진입점 `/sales` 를 exact 로 두면 `/sales/closing`(회계)·`/sales/link-dispatch`
 *   (그룹웨어) 진입 시 판매 그룹이 prefix 매칭으로 동시 자동펼침되던 갭을 제거한다
 *   (spec '활성 그룹만 펼침' 준수).
 *
 * @param exact true 면 prefix 하위 경로를 활성으로 보지 않고 정확 일치만 활성 처리.
 */
function isSidebarTargetActive(
  currentPathname: string,
  currentFullPath: string,
  to: string,
  exact = false,
): boolean {
  const [targetPathname, targetSearch] = to.split('?')

  if (!targetPathname || targetPathname === '/') {
    return currentPathname === targetPathname
  }

  if (targetSearch) {
    return currentFullPath === to
  }

  if (exact) {
    return currentPathname === targetPathname
  }

  return currentPathname === targetPathname || currentPathname.startsWith(`${targetPathname}/`)
}

function SidebarCategory({
  label,
  show,
  activeTargets,
  exactTargets = [],
  testId,
  children,
}: {
  label: string
  show: boolean
  activeTargets: string[]
  /**
   * [2026-06-11 P2 #1/#5] 정확 일치(exact)로만 그룹을 활성화할 경로 목록.
   * prefix 매칭이 다른 그룹 하위 경로(예: '/sales' ⊃ '/sales/closing')를 오활성화하는
   * cross-group 자동펼침을 방지하기 위해, 1세그먼트 진입점은 여기에 둔다.
   */
  exactTargets?: string[]
  testId: string
  children: React.ReactNode
}) {
  const location = useLocation()
  const currentFullPath = `${location.pathname}${location.search}`
  const activeByRoute =
    activeTargets.some((to) =>
      isSidebarTargetActive(location.pathname, currentFullPath, to),
    )
    || exactTargets.some((to) =>
      isSidebarTargetActive(location.pathname, currentFullPath, to, true),
    )
  const storageKey = `samhan.sidebar.group.${label}`
  const [open, setOpen] = useState(() => readSidebarGroupOpen(storageKey))

  useEffect(() => {
    if (activeByRoute) {
      setOpen(true)
    }
  }, [activeByRoute, currentFullPath])

  if (!show) return null

  // [2026-06-11] 그룹 헤더 자체를 토글 버튼으로 일반화한다.
  // 기본은 접힘이며, 현재 route 가 그룹 자식 경로에 속하면 해당 그룹만 자동 펼침된다.
  const compactLabel = compactSidebarLabel(label)
  const headingId = `sidebar-group-heading-${compactLabel}`
  const controls = `sidebar-group-content-${compactLabel}`
  const handleToggle = () => {
    setOpen((current) => {
      const next = !current
      writeSidebarGroupOpen(storageKey, next)
      return next
    })
  }

  return (
    <>
      <div
        className="app-sidebar-group"
        role="heading"
        aria-level={2}
        style={{ marginTop: 16 }}
      >
        <SidebarGroupToggle
          id={headingId}
          label={label}
          open={open}
          onToggle={handleToggle}
          testId={testId}
          controls={controls}
          variant="category"
        />
      </div>
      {open ? (
        <div id={controls} role="group" aria-labelledby={headingId}>
          {children}
        </div>
      ) : null}
    </>
  )
}

/**
 * [samhan-dispatch-board Phase A] 배차 보드 route (/dispatch-board) — DISPATCH/MANAGER/MASTER.
 * Samhan Public 배차담당자 → 차량 그룹 + arologis 발송 흐름.
 */

export function AppLayout() {
  const auth = useSessionStore((s) => s.auth)
  const logout = useSessionStore((s) => s.logout)
  const title = usePageTitleStore((s) => s.title)
  const meta = usePageTitleStore((s) => s.meta)
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  // PR #921 chore-B SONNET5 R1 — I-3: 이 라우트 자신이 인쇄 대상이면(20개 인쇄 라우트 +
  // 판매/구매조회 일괄 인쇄) 전역 모달 게이트가 위에 열려 있어도 .app-main 을 인쇄에서 지우지
  // 않는다. global.css `.app-main:not(.is-print-surface)` 규칙과 짝.
  const isPrintSurface = isPrintSurfacePath(location.pathname)

  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement | null>(null)
  const drawerRef = useRef<HTMLElement | null>(null)
  const drawerToggleRef = useRef<HTMLButtonElement | null>(null)
  const wasDrawerOpenRef = useRef(false)
  const lastMenuAccessRef = useRef<string | null>(null)

  // [SP-D1 cycle 2] 동적 RBAC 권한 훅 — 5분 캐시. 사이드바 메뉴 hidden 연동.
  const { canAccess: dynamicCanAccess } = usePermissions()
  const {
    menus: menuCatalog,
    isLoading: isMenuCatalogLoading,
    isError: isMenuCatalogError,
  } = useMenuCatalog()
  const publicMenuCatalog = (menuCatalog ?? [])
    .filter((entry) => entry.app === 'samhan-public')
    .filter((entry) => dynamicCanAccess(entry.pageCode, 'view'))
    .sort((left, right) => left.category.localeCompare(right.category, 'ko') || left.order - right.order)
  const catalogGroups = Array.from(
    publicMenuCatalog.reduce((groups, entry) => {
      const group = groups.get(entry.category) ?? []
      group.push(entry)
      groups.set(entry.category, group)
      return groups
    }, new Map<string, typeof publicMenuCatalog>()),
  )
  const dispatchMenuTestIds: Record<string, string> = {
    '/admin/users': 'sidebar-hr-users',
    '/admin/carriers': 'sidebar-hr-carriers',
    '/admin/permission-matrix': 'sidebar-hr-permission-matrix',
    '/admin/permission-matrix/bulk': 'sidebar-hr-permission-bulk',
    '/admin/permission-groups/matrix': 'sidebar-hr-permission-groups-matrix',
    '/admin/permission-groups/manage': 'sidebar-hr-permission-groups-manage',
    '/admin/permission-groups/delegation': 'sidebar-hr-permission-delegation',
    '/admin/approval-line-config': 'sidebar-hr-approval-line-config',
    '/admin/slip-cutoff': 'sidebar-hr-slip-cutoff',
    '/admin/app-releases': 'sidebar-dev-app-releases',
    '/admin/app-notices': 'sidebar-dev-popup-notice',
    '/admin/activity-logs': 'sidebar-dev-activity-log',
    '/inventory/compensation-failures': 'sidebar-warehouse-compensation-failures',
    '/accounting/tax-invoices/batch': 'sidebar-accounting-tax-invoice-batch-issue',
    '/sales/estimate-config': 'sidebar-sales-estimate-config',
    '/accounting/bank-card-admin': 'sidebar-accounting-bank-card-admin',
    '/dispatch-board/history': 'sidebar-dispatch-history',
    '/admin/dispatch-groups': 'sidebar-dispatch-groups',
    '/arologis/pre-classify': 'sidebar-arologis-preclassify',
    '/arologis/unassigned': 'sidebar-arologis-unassigned',
    '/arologis/dispatch-sms': 'sidebar-arologis-dispatch-sms',
    '/arologis/dispatch-reconcile': 'sidebar-arologis-dispatch-reconcile',
    '/admin/regions': 'sidebar-arologis-region-mgmt',
    '/admin/external-carriers': 'sidebar-dispatch-external-carriers',
    '/arologis/admin/auto-dispatch': 'sidebar-arologis-auto-dispatch',
    '/arologis/admin/manual-dispatch': 'sidebar-arologis-manual-dispatch-admin',
    '/arologis/admin/driver-assignment': 'sidebar-arologis-driver-assignment',
    '/sales': 'sidebar-sales',
    '/sales/estimates': 'sidebar-sales-estimates',
    '/sales/partner-orders': 'sidebar-sales-partner-orders',
    '/sales/order-approvals': 'sidebar-sales-partners',
    '/sales/partner-dc-config': 'sidebar-sales-partner-dc-config',
    '/admin/blocked-partners': 'sidebar-sales-blocked-partners',
    '/sales/slip-cleanup': 'sidebar-sales-slip-cleanup',
    '/sales/next-day-slip': 'sidebar-sales-next-day-slip',
    '/products/catalog': 'sidebar-products-catalog',
    '/products/estimate-items': 'sidebar-products-estimate-items',
    '/products/classifications': 'sidebar-products-classifications',
    '/products/price-schedule': 'sidebar-products-price-schedule',
    '/admin/sheet-sync': 'sidebar-settings-sheet-sync',
    '/purchases': 'sidebar-purchases',
    '/transfers': 'sidebar-transfers',
    '/warehouse/inbound-inspections': 'sidebar-warehouse-inbound-inspections',
    '/warehouse/audit': 'sidebar-warehouse-dps-compare',
    '/warehouse/dps-compare/by-product': 'sidebar-warehouse-dps-by-product',
    '/accounting/sales-slips': 'sidebar-accounting-sales-slips',
    '/accounting/purchase-slips': 'sidebar-accounting-purchase-slips',
    '/accounting/accounts': 'sidebar-accounting-accounts',
    '/accounting/journals': 'sidebar-accounting-journals',
    '/accounting/tax-invoices': 'sidebar-accounting-tax-invoices',
    '/accounting/tax-invoices/inbound': 'sidebar-accounting-tax-invoice-inbound',
    '/accounting/balances': 'sidebar-accounting-balances',
    '/sales/closing': 'sidebar-accounting-sales-closing',
    '/accounting/period-close': 'sidebar-accounting-period-close',
    '/accounting/sales-commission-settlements': 'sidebar-accounting-sales-commission-settlements',
    '/accounting/statement-batch': 'sidebar-accounting-statement-batch',
    '/accounting/partner-ledger': 'sidebar-accounting-partner-ledger',
    '/accounting/hometax-export': 'sidebar-accounting-hometax-export',
    '/accounting/supplier-profiles': 'sidebar-accounting-supplier-profile',
    '/accounting/bank-transactions': 'sidebar-accounting-bank-transactions',
    '/accounting/deposit-mappings': 'sidebar-accounting-deposit-mapping',
    '/accounting/admin/cash-receipts': 'sidebar-accounting-cash-receipts',
    '/accounting/daily-closing': 'sidebar-accounting-daily-closings',
    '/accounting/ledgers': 'sidebar-accounting-ledgers',
    '/accounting/admin/ledger/sales': 'sidebar-accounting-admin-sales-ledger',
    '/accounting/admin/ledger/purchase': 'sidebar-accounting-admin-purchase-ledger',
    '/accounting/admin/migration-ops': 'sidebar-accounting-admin-migration-ops',
    '/admin/accounting-edit-requests': 'sidebar-accounting-admin-edit-requests',
    '/groupware/approvals': 'sidebar-groupware-approvals',
    '/groupware/approval-templates': 'sidebar-groupware-approval-templates',
    '/groupware/document-templates': 'sidebar-groupware-document-templates',
    '/sales/link-dispatch': 'sidebar-link-dispatch',
    '/admin/aligo-address-book': 'sidebar-messenger-aligo-address-book',
    '/messenger': 'sidebar-messenger',
    '/warehouses': 'sidebar-warehouses',
    '/inventory/stock-balance': 'sidebar-inventory-stock-balance',
    '/inventory/inout-analysis': 'sidebar-inventory-inout-analysis',
    '/inventory/safety-stock-alerts': 'sidebar-warehouse-safety-stock-alerts',
    '/admin/slip-edit-requests': 'sidebar-warehouse-slip-edit-requests',
    '/admin/photo-audit': 'sidebar-warehouse-photo-audit',
  }

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

  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

  useEffect(() => {
    const target = pageCodeForPath(location.pathname)
    if (!target || !auth) return undefined
    if (lastMenuAccessRef.current === target.pageCode) return undefined

    const timer = window.setTimeout(() => {
      lastMenuAccessRef.current = target.pageCode
      void recordMenuAccess({
        resourceId: target.pageCode,
        userId: auth.userId,
        userRole: auth.role,
        description: `${target.label} 메뉴 진입`,
        occurredAt: new Date().toISOString(),
      }).catch((error) => {
        console.warn('[activity-log] 메뉴 접근 기록 실패', error)
      })
    }, MENU_ACCESS_DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [auth, location.pathname])

  useEffect(() => {
    const handler = () => {
      if (window.innerWidth > 768) {
        setDrawerOpen(false)
      }
    }

    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  useEffect(() => {
    if (!drawerOpen) return

    const previousOverflow = document.body.style.overflow
    const focusableSelector = 'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])'
    const getDrawerFocusableElements = () =>
      Array.from(drawerRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDrawerOpen(false)
        return
      }

      if (e.key !== 'Tab' || window.innerWidth > 768) {
        return
      }

      const focusableElements = getDrawerFocusableElements()
      if (focusableElements.length === 0) {
        return
      }

      const firstFocusable = focusableElements[0]!
      const lastFocusable = focusableElements[focusableElements.length - 1]!
      const activeElement = document.activeElement

      if (e.shiftKey && activeElement === firstFocusable) {
        e.preventDefault()
        lastFocusable.focus()
        return
      }

      if (!e.shiftKey && activeElement === lastFocusable) {
        e.preventDefault()
        firstFocusable.focus()
      }
    }

    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handler)

    getDrawerFocusableElements()[0]?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handler)
    }
  }, [drawerOpen])

  useEffect(() => {
    if (wasDrawerOpenRef.current && !drawerOpen) {
      drawerToggleRef.current?.focus()
    }
    wasDrawerOpenRef.current = drawerOpen
  }, [drawerOpen])

  const handleLogout = async () => {
    setUserMenuOpen(false)
    await logout()
    queryClient.removeQueries({ queryKey: ['permissions', 'my'] })
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
  const showAccountingReceivables = dynamicCanAccess('accounting.receivables',     'view')
  const showAccountingPeriodClose = dynamicCanAccess('accounting.period-close',    'view')
  const showAccountingStatBatch   = dynamicCanAccess('accounting.statement-batch', 'view')
  const showAccountingPartnerLedger = dynamicCanAccess('accounting.partner-ledger', 'view')
  const showAccountingSalesSlip   = dynamicCanAccess('accounting.sales-slip.accounting', 'view')
  const showAccountingPurchaseSlip = dynamicCanAccess('accounting.purchase-slip.accounting', 'view')
  const showAccountingTaxInvoiceBatch = dynamicCanAccess('accounting.tax-invoice.batch-issue', 'view')
  const showAccountingTaxInvoiceInbound = dynamicCanAccess('accounting.tax-invoice.inbound.manage', 'view')
  const showAccountingTaxInvoice  = dynamicCanAccess('accounting.tax-invoice.list', 'view')
  const showAccountingDailyClose  = dynamicCanAccess('accounting.daily-closing',   'view')
  const showAccountingLedger      = dynamicCanAccess('accounting.general-ledger',  'view')
  const showAccountingBankMatching = dynamicCanAccess('accounting.bank-matching',  'view')
  const showAccountingDepositMapping = dynamicCanAccess('accounting.deposit-mapping', 'view')
  const showAccountingCashReceipts = dynamicCanAccess('accounting.cash-receipts', 'view')
  const showAccountingSalesCommissionSettlement = dynamicCanAccess('accounting.sales-commission-settlement', 'view')
  const showAccountingBankCardAdmin = dynamicCanAccess('accounting.bank-card-admin',  'view')
  const showAccountingAdminLedger = dynamicCanAccess('ecount.mig14.ledger', 'view')
  const showAccountingAdminMigOps = dynamicCanAccess('ecount.mig.ops-dashboard', 'view')
  const showAccountingEditRequests = dynamicCanAccess('accounting.edit-requests.decide', 'view')
  // 회계 카테고리 헤더: 회계 PageCode 중 1개라도 가시이면 표시.
  // [Round B P1] 세금계산서 발행 묶음(batch-issue)·수신 세금계산서(inbound) 누락 보강 —
  //   해당 권한 단독 보유자(자식 링크 597/604행 존재)가 회계 그룹 전체를 잃던 갭 해소.
  const showAccounting =
    showAccountingAccounts || showAccountingJournals || showAccountingBalances
    || showAccountingReports || showAccountingReceivables || showAccountingPeriodClose || showAccountingStatBatch
    || showAccountingSalesSlip || showAccountingPurchaseSlip
    || showAccountingPartnerLedger || showAccountingTaxInvoice
    || showAccountingTaxInvoiceBatch || showAccountingTaxInvoiceInbound
    || showAccountingSalesCommissionSettlement
    || showAccountingDailyClose
    || showAccountingLedger || showAccountingBankMatching || showAccountingDepositMapping || showAccountingCashReceipts || showAccountingBankCardAdmin
    || showAccountingAdminLedger
    || showAccountingAdminMigOps || showAccountingEditRequests
  const showDeliveryBatch = dynamicCanAccess('slip.delivery-batch', 'view')

  // [SP-D4] 잔여 7 도메인 22 PageCode 동적 RBAC 연동.
  // SP-D 일관성: dynamicCanAccess 는 캐시 미로드 시 false 로 deny 하며 로딩 flash 를 만들지 않는다.
  // PageCode VIEW seed보다 좁은 slip-service 유형별 조회 guard를 메뉴에도 적용해
  // 메뉴→목록 진입 뒤 403이 발생하는 경로를 만들지 않는다.
  const showSalesSlipList          = dynamicCanAccess('sales.slip.list', 'view') && canQuerySales(auth)
  const showPurchaseSlipList       = dynamicCanAccess('purchases.slip.list', 'view') && canQueryPurchases(auth)
  const showEstimatesList          = dynamicCanAccess('estimates.list',               'view')
  const showPartnerOrderList       = dynamicCanAccess('sales.partner-order.list',     'view')
  const showInventoryWarehouse     = dynamicCanAccess('inventory.warehouse',          'view')
  // inventory.stock — 현재 사이드바 직접 노출 없음 (재고 현황 서브페이지). 라우트 가드에서 사용.
  const showInventoryStockTransfer = dynamicCanAccess('inventory.stock-transfer',     'view')
  const showInventoryStockBalance  = dynamicCanAccess('inventory.stock-balance',      'view')
  const showInOutAnalysis          = dynamicCanAccess('accounting.sales-slip.list',  'view')
  const showInventoryDps           = dynamicCanAccess('inventory.dps',                'view')
  const showInventoryAuditPage     = dynamicCanAccess('inventory.audit',              'view')
  const showAdminEmployees         = dynamicCanAccess('admin.employees',              'view')
  const showCarrierMaster           = dynamicCanAccess('hr.carriers',                 'view')
  // admin.users — 인사 그룹 자식 링크 소비처 없음('인사 관리'/admin/users 는 admin.employees 게이트).
  // [Round B P3] showAdminHrGroup 에서 제거 — admin.users 단독 권한자가 빈 '인사' 헤더만 보던 갭 해소.
  // 사이드바/라우트 직접 소비처 없으나 page-code 자체는 유효 → 향후 메뉴 연결 예약(underscore).
  const _showAdminUsersMgmt        = dynamicCanAccess('admin.users',                  'view')
  const showPermissionAdmin        = dynamicCanAccess('system.permission-admin', 'view')
  // [C5-2b] MASTER role 문자열 fallback 제거 → system.permission-admin 동적 권한만 사용.
  // BE @RequirePermission(page="system.permission-admin") 가 MASTER bypass 포함 단일 가드.
  const showPermissionDelegation   = showPermissionAdmin
  const showAppReleaseAdmin        = dynamicCanAccess('admin.app-release', 'view')
  const showPopupNoticeAdmin       = dynamicCanAccess('dev.popup-notice', 'view')
  const showActivityLogAdmin       = dynamicCanAccess('dev.activity-log', 'view')
  const showApprovalLineConfig     = dynamicCanAccess('admin.approval-line-config', 'view')
  const showSlipCutoff             = dynamicCanAccess('hr.slip-cutoff',              'view')
  const showPartnersList           = dynamicCanAccess('partners.list',                'view')
  const showPartnersBlock          = dynamicCanAccess('partners.block',               'view')
  // partners.edit-request — 현재 미사용 (사이드바 직접 노출/라우트 가드 소비처 없음 — 향후 메뉴 연결 예약).
  const _showPartnersEditRequest   = dynamicCanAccess('partners.edit-request',        'view')
  // products.* — [PR-B] products.list VIEW → '품목 관리' 사이드바 진입점.
  const showProductsList           = dynamicCanAccess('products.list',                'view')
  const _showProductsAdmin         = dynamicCanAccess('products.admin',               'view')
  const showProductsSync           = dynamicCanAccess('products.sync',                'view')
  const showPriceSchedule          = dynamicCanAccess('products.price-schedule',       'view')
  const showArologisAdminPage      = dynamicCanAccess('arologis.admin',               'view')
  const showArologisRegionPage     = dynamicCanAccess('arologis.region',              'view')
  // [Round A P3] 구 showInventoryGroup 집계 변수 삭제 — 창고운영 그룹 게이트는
  // showWarehouseOpsGroup(창고운영 자식 6개와 1:1 정합) 로 교체되어 미소비(dead) 였음.
  // (사이클1 Codex fix C-4) showPartnersGroup 제거 — /admin/partners 직접 링크는 partners.list 1:1.
  const showAdminHrGroup   = showAdminEmployees || showCarrierMaster || showPermissionAdmin || showPermissionDelegation || showApprovalLineConfig || showSlipCutoff
  // DEV-3: 개발 그룹은 버전관리(admin.app-release) + 팝업공지(dev.popup-notice) + 로그(dev.activity-log) 중 하나라도 노출한다.
  const showDevelopmentGroup = showAppReleaseAdmin || showPopupNoticeAdmin || showActivityLogAdmin

  // [C5 follow-up 사이클1 fix] arologis 메뉴 가시성 = 라우트 PermissionGuard 와 동일 page-code 단일 소스.
  // (사이클1 리뷰 FE P1-2 + Designer D-002: 그룹 UUID 매칭은 라우트 가드와 소스 이원화 — seed 불일치 시
  //  사이드바 노출↔진입 redirect 역전 발생. 라우트가 이미 page-code 게이팅이므로 동일 코드로 일원화.)
  const showArologisManual = dynamicCanAccess('arologis.dispatch.admin', 'view')
  // 가배차리스트 / 미배차리스트 / 실배차 비교 — 라우트 공통 arologis.dispatch.ops
  const showArologisOps = dynamicCanAccess('arologis.dispatch.ops', 'view')
  const showDispatchSmsPage = dynamicCanAccess('notification.dispatch-sms.display', 'view')
  const showExternalCarriers = dynamicCanAccess('dispatch.external-carriers', 'view')
  // arologis 그룹 가시성 — arologis.dispatch.admin route 권한 / ops 3종 / 배차안내문자 / P1-5 admin 중 하나라도 보이면 그룹 노출
  const showArologis
    = showArologisManual
    || showArologisOps
    || showDispatchSmsPage
    || showExternalCarriers
    || showArologisAdminPage
  const showChatRoomAdmin = dynamicCanAccess('messenger.admin', 'view')

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
  // [Round A P3] 구 showWarehouseOps 집계 변수 삭제 — 창고운영 그룹 게이트 교체 후 미소비(dead) 였음.
  //   실제 그룹 가시성은 아래 showWarehouseOpsGroup(창고운영 자식 6개와 1:1 정합) 가 담당한다.
  // [PR-E1 FE-5] 전표 정리 entry — SALES / MANAGER / MASTER
  const showSlipCleanup = dynamicCanAccess('slip.cleanup', 'view')
  const showNextDaySlip = dynamicCanAccess('slip.print.next-day', 'view')
  const showMessengerSend = dynamicCanAccess('messenger.send', 'view')
  const showGroupwareApprovals = dynamicCanAccess('groupware.approvals', 'view')
  const showGroupwareApprovalTemplates = dynamicCanAccess('groupware.approval-templates', 'view')
  const showGroupwareDocumentTemplates = showGroupwareApprovalTemplates

  // [Slice 2] admin GAS 이식 — 일반 카테고리 병행 노출
  const showRegionMgmt = showArologisRegionPage
  const showSheetSync = showProductsSync
    const showAligoAddressBook = dynamicCanAccess('aligo.address-book', 'view')
    const showBlockedPartners = showPartnersBlock
    const showPartnerManagement = showPartnersList
    const showPartnerDcConfig = dynamicCanAccess('sales.partner-dc-config', 'view')
    const showEstimateConfig = dynamicCanAccess('sales.estimate-config', 'view')
  // [samhan-dispatch-board Phase A + SP-D1 cycle 2] 배차 보드 route — 동적 RBAC 권한 연동.
  // 기존 정적 역할 체크 → dispatch.board 동적 canAccess 로 전환.
  const showDispatchBoard = dynamicCanAccess('dispatch.board', 'view')
  const showSales =
    showSalesSlipList || showEstimatesList || showPartnerOrderList
    || showPartnerDcConfig || showEstimateConfig || showPartnerManagement || showSlipCleanup
    || showNextDaySlip || showBlockedPartners
    || showProductsList || showPriceSchedule || showSheetSync
  const showPurchase =
    showPurchaseSlipList || showInventoryStockTransfer
    || showInboundInspection || showAudit || showDpsCompare || showDpsByProduct
  const showGroupware =
    showDeliveryBatch || showAligoAddressBook
    || showGroupwareApprovals || showGroupwareApprovalTemplates || showGroupwareDocumentTemplates
    || showMessengerSend
  // [Round A P3] showRegionMgmt(arologis.region) 포함 — 배차지역 관리 단독 권한자가
  //   arologis 그룹 헤더+자식 전체를 잃던 선재 갭 해소(SidebarCategory show=false면 자식도 숨김).
  const showArologisGroup = showDispatchBoard || showArologis || showRegionMgmt
  const hasCatalogMenu = !isMenuCatalogLoading && publicMenuCatalog.length > 0
  const dispatchMenuCatalog = publicMenuCatalog.filter((entry) => entry.category === '배차')
  const showWarehouseOpsGroup =
    showInventoryWarehouse || showInventoryStockBalance || showInOutAnalysis || showSafetyStockAlerts
    || showInventoryCompensationFailures || showSlipEditRequests || showPhotoAudit

  return (
    <div className="app-shell">
      <aside
        id="app-drawer"
        ref={drawerRef}
        className={`app-sidebar no-print${drawerOpen ? ' is-open' : ''}`}
        role={drawerOpen ? 'dialog' : undefined}
        aria-modal={drawerOpen ? 'true' : undefined}
        aria-labelledby={drawerOpen ? 'app-drawer-title' : undefined}
      >
        <h1 id="app-drawer-title">Samhan Public</h1>
        <nav
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('a')) {
              setDrawerOpen(false)
            }
          }}
        >
          <NavLink to="/" end>
            홈
          </NavLink>
          <NavLink to="/notifications" data-testid="sidebar-notifications">
            알림 내역
          </NavLink>

          {isMenuCatalogLoading ? (
            <p role="status" data-testid="sidebar-menu-catalog-loading">
              메뉴 권한을 확인하는 중입니다.
            </p>
          ) : isMenuCatalogError ? (
            <p role="alert" data-testid="sidebar-menu-catalog-error">
              메뉴 권한을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
            </p>
          ) : catalogGroups.length === 0 ? (
            <p data-testid="sidebar-menu-catalog-empty">권한이 있는 메뉴가 없습니다.</p>
          ) : (
            catalogGroups.map(([category, entries]) => (
              <SidebarCategory
                key={category}
                label={category}
                show
                testId={`sidebar-category-toggle-${compactSidebarLabel(category)}`}
                activeTargets={entries.map((entry) => entry.route)}
              >
                {entries.map((entry) => (
                  <SidebarLink
                    key={`${entry.app}:${entry.route}`}
                    to={entry.route}
                    show
                    data-testid={dispatchMenuTestIds[entry.route] ?? `sidebar-catalog-${entry.route.replace(/[^a-zA-Z0-9]+/g, '-')}`}
                  >
                    {entry.label}
                  </SidebarLink>
                ))}
              </SidebarCategory>
            ))
          )}

          {false ? <>
          {false ? <SidebarLink to="/admin/chat-rooms" show={showChatRoomAdmin} data-testid="sidebar-chat-rooms">단톡방</SidebarLink> : null}
          {/* [Phase 6 v4 → P2-1] 판매 그룹 — 견적서 SamhanLogis 도메인 (legacy webview 폐기) + 4종 sub.
              [SP-D4] estimates.list / sales.partner-order.list 동적 RBAC 연동. */}
          <SidebarCategory
            label="판매"
            show={showSales}
            testId="sidebar-category-toggle-판매"
            // [2026-06-11 P2 #1/#5] bare '/sales' 제거 — '/sales/closing'(회계)·'/sales/link-dispatch'
            //   (그룹웨어) prefix 오매칭으로 판매 그룹이 cross-group 동시 자동펼침되던 갭 해소.
            //   판매 전용 정확 경로만 나열하고, 판매관리 진입점('/sales')은 exactTargets 로 분리해
            //   하위 경로가 판매를 오활성화하지 않게 한다.
            activeTargets={[
              '/sales/estimates',
              '/sales/partner-orders',
              '/sales/order-approvals',
              '/admin/partners',
              '/sales/partner-dc-config',
              '/sales/estimate-config',
              '/admin/blocked-partners',
              '/sales/slip-cleanup',
              '/sales/next-day-slip',
              '/products/catalog',
              '/products/estimate-items',
              '/products/classifications',
              '/products/price-schedule',
              '/admin/sheet-sync',
            ]}
            exactTargets={['/sales']}
          >
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
              <SidebarLink
                to="/sales/estimate-config"
                show={showEstimateConfig}
                requiredRole="MANAGER / MASTER"
                data-testid="sidebar-sales-estimate-config"
              >
                견적 가격 설정
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
            <SidebarLink
              to="/products/catalog"
              show={showProductsList}
              data-testid="sidebar-products-catalog"
            >
              기초품목 관리
            </SidebarLink>
            <SidebarLink
              to="/products/estimate-items"
              show={showProductsList}
              data-testid="sidebar-products-estimate-items"
            >
              견적품목 관리
            </SidebarLink>
              <SidebarLink
                to="/products/classifications"
                show={showProductsList}
                data-testid="sidebar-products-classifications"
              >
                분류 관리
              </SidebarLink>
              <SidebarLink
                to="/products/price-schedule"
                show={showPriceSchedule}
                data-testid="sidebar-products-price-schedule"
              >
                카테고리별 단가변동
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

          <SidebarCategory
            label="구매"
            show={showPurchase}
            testId="sidebar-category-toggle-구매"
            activeTargets={[
              '/purchases',
              '/transfers',
              '/warehouse/inbound-inspections',
              '/warehouse/audit',
              '/warehouse/dps-compare',
              '/warehouse/dps-compare/by-product',
            ]}
          >
            <SidebarLink
              to="/purchases"
              show={showPurchaseSlipList}
              data-testid="sidebar-purchases"
            >
              구매관리
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

          <SidebarCategory
            label="회계"
            show={showAccounting}
            testId="sidebar-category-toggle-회계"
            activeTargets={[
              '/accounting/sales-slips',
              '/accounting/purchase-slips',
              '/accounting/accounts',
              '/accounting/journals',
              '/accounting/tax-invoices',
              '/accounting/tax-invoices/batch',
              '/accounting/tax-invoices/inbound',
              '/accounting/balances',
              '/accounting/reports',
              '/accounting/reports/journal-status',
              '/accounting/reports/account-statement',
              '/accounting/reports/receivables-payables',
              '/accounting/reports/notes-receivable',
              '/accounting/reports/collection-plans',
              '/accounting/reports/funds-flow-comparison',
              '/accounting/funds/status',
              '/sales/closing',
              '/accounting/period-close',
              '/accounting/sales-commission-settlements',
              '/accounting/statement-batch',
              '/accounting/partner-ledger',
              '/accounting/hometax-export',
              '/accounting/supplier-profiles',
              '/accounting/bank-card-admin',
              '/accounting/bank-transactions',
              '/accounting/deposit-mappings',
              '/accounting/admin/cash-receipts',
              '/accounting/daily-closing',
              '/accounting/ledgers',
              '/accounting/admin/ledger/sales',
              '/accounting/admin/ledger/purchase',
              '/accounting/admin/migration-ops',
              '/admin/accounting-edit-requests',
            ]}
          >
              {/* [SP-D2] 회계 각 메뉴 — SidebarLink + dynamicCanAccess 로 전환.
                  권한 없는 메뉴는 완전 미노출(null). 회색 비활성 X. */}
              <SidebarLink
                to="/accounting/sales-slips"
                show={showAccountingSalesSlip}
                data-testid="sidebar-accounting-sales-slips"
              >
                출고전표
              </SidebarLink>
              <SidebarLink
                to="/accounting/purchase-slips"
                show={showAccountingPurchaseSlip}
                data-testid="sidebar-accounting-purchase-slips"
              >
                입고전표
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
                합계잔액시산표
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
                    to="/accounting/reports/income-statement/monthly"
                    data-testid="sidebar-accounting-monthly-income-statement"
                    style={{ paddingLeft: 20, fontSize: 13 }}
                  >
                    월별손익분석
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
                    to="/accounting/reports/receivables-payables"
                    end
                    data-testid="sidebar-accounting-receivables-payables"
                    style={{ paddingLeft: 20, fontSize: 13 }}
                  >
                    채권채무 현황
                  </NavLink>
                  <NavLink
                    to="/accounting/reports/notes-receivable"
                    end
                    data-testid="sidebar-accounting-notes-receivable"
                    style={{ paddingLeft: 20, fontSize: 13 }}
                  >
                    받을어음
                  </NavLink>
                  <NavLink
                    to="/accounting/reports/collection-plans"
                    end
                    data-testid="sidebar-accounting-collection-plans"
                    style={{ paddingLeft: 20, fontSize: 13 }}
                  >
                    수금계획
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
                  <NavLink
                    to="/accounting/reports/journal-status"
                    end
                    data-testid="sidebar-accounting-journal-status"
                    style={{ paddingLeft: 20, fontSize: 13 }}
                  >
                    전표현황
                  </NavLink>
                  <NavLink
                    to="/accounting/reports/account-statement"
                    end
                    data-testid="sidebar-accounting-account-statement"
                    style={{ paddingLeft: 20, fontSize: 13 }}
                  >
                    계정명세서
                  </NavLink>
                  <NavLink
                    to="/accounting/funds/status"
                    end
                    data-testid="sidebar-accounting-funds-status"
                    style={{ paddingLeft: 20, fontSize: 13 }}
                  >
                    자금현황
                  </NavLink>
                  <NavLink
                    to="/accounting/reports/funds-flow-comparison"
                    end
                    data-testid="sidebar-accounting-funds-flow-comparison"
                    style={{ paddingLeft: 20, fontSize: 13 }}
                  >
                    자금 입출금내역
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
              <SidebarLink
                to="/accounting/sales-commission-settlements"
                show={showAccountingSalesCommissionSettlement}
                data-testid="sidebar-accounting-sales-commission-settlements"
              >
                영업수수료 정산
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
              <SidebarLink
                to="/accounting/bank-card-admin"
                show={showAccountingBankCardAdmin}
                data-testid="sidebar-accounting-bank-card-admin"
              >
                계좌/카드 관리
              </SidebarLink>
              <SidebarLink
                to="/accounting/bank-transactions"
                show={showAccountingBankMatching}
                data-testid="sidebar-accounting-bank-transactions"
              >
                입출금 내역
              </SidebarLink>
              <SidebarLink
                to="/accounting/deposit-mappings"
                show={showAccountingDepositMapping}
                data-testid="sidebar-accounting-deposit-mapping"
              >
                입금자명 매핑
              </SidebarLink>
              <SidebarLink
                to="/accounting/admin/cash-receipts"
                show={showAccountingCashReceipts}
                data-testid="sidebar-accounting-cash-receipts"
              >
                입금보고서
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
              <SidebarLink
                to="/accounting/admin/ledger/sales"
                show={showAccountingAdminLedger}
                data-testid="sidebar-accounting-admin-sales-ledger"
              >
                매출 원장 대조
              </SidebarLink>
              <SidebarLink
                to="/accounting/admin/ledger/purchase"
                show={showAccountingAdminLedger}
                data-testid="sidebar-accounting-admin-purchase-ledger"
              >
                매입 원장 대조
              </SidebarLink>
              <SidebarLink
                to="/accounting/admin/migration-ops"
                show={showAccountingAdminMigOps}
                data-testid="sidebar-accounting-admin-migration-ops"
              >
                운영 대시보드
              </SidebarLink>
              <SidebarLink
                to="/admin/accounting-edit-requests"
                show={showAccountingEditRequests}
                data-testid="sidebar-accounting-admin-edit-requests"
              >
                회계 수정 요청
              </SidebarLink>
          </SidebarCategory>

          {/* [SP-D2] MANAGER 전용 단독 노출 블록 폐기 — 동적 RBAC 통합으로 메인 회계 블록에서 처리.
              showAccounting 이 dynamicCanAccess 기반으로 전환되어 MANAGER 도 포함됨. */}

          <SidebarCategory
            label="그룹웨어"
            show={showGroupware}
            testId="sidebar-category-toggle-그룹웨어"
            activeTargets={[
              '/groupware/approvals',
              '/groupware/approval-templates',
              '/groupware/document-templates',
              '/sales/link-dispatch',
              '/admin/aligo-address-book',
              '/messenger',
            ]}
          >
            <SidebarLink
              to="/groupware/approvals"
              show={showGroupwareApprovals}
              requiredRole="MASTER / MANAGER"
              data-testid="sidebar-groupware-approvals"
            >
              결재
            </SidebarLink>
            <SidebarLink
              to="/groupware/approval-templates"
              show={showGroupwareApprovalTemplates}
              requiredRole="MASTER / MANAGER"
              data-testid="sidebar-groupware-approval-templates"
            >
              결재 양식
            </SidebarLink>
            <SidebarLink
              to="/groupware/document-templates"
              show={showGroupwareDocumentTemplates}
              requiredRole="MASTER / MANAGER"
              data-testid="sidebar-groupware-document-templates"
            >
              결재 문서 양식
            </SidebarLink>
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
              to="/messenger"
              show={showMessengerSend}
              data-testid="sidebar-messenger"
            >
              메신저
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
          <SidebarCategory
            label="인사"
            show={showAdminHrGroup}
            testId="sidebar-category-toggle-인사"
            activeTargets={[
              '/admin/users',
              '/admin/permission-matrix',
              '/admin/permission-matrix/bulk',
              '/admin/permission-groups/matrix',
              '/admin/permission-groups/manage',
              '/admin/permission-groups/delegation',
              '/admin/approval-line-config',
              '/admin/slip-cutoff',
              '/admin/carriers',
            ]}
          >
            {/* admin.employees — MASTER/MANAGER (SP-D4 §2). */}
            <SidebarLink
              to="/admin/users"
              show={showAdminEmployees}
              data-testid="sidebar-hr-users"
            >
              인사 관리
            </SidebarLink>
            <SidebarLink
              to="/admin/carriers"
              show={showCarrierMaster}
              requiredRole="MANAGER / MASTER"
              data-testid="sidebar-hr-carriers"
            >
              운송사 목록
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
            <SidebarLink
              to="/admin/approval-line-config"
              show={showApprovalLineConfig}
              data-testid="sidebar-hr-approval-line-config"
            >
              결재라인 설정
            </SidebarLink>
            <SidebarLink
              to="/admin/slip-cutoff"
              show={showSlipCutoff}
              data-testid="sidebar-hr-slip-cutoff"
            >
              출고 마감시간 설정
            </SidebarLink>
          </SidebarCategory>

          <SidebarCategory
            label="개발"
            show={showDevelopmentGroup}
            testId="sidebar-category-toggle-개발"
            activeTargets={[
              '/admin/app-releases',
              '/admin/app-notices',
              '/admin/activity-logs',
            ]}
          >
            <SidebarLink
              to="/admin/activity-logs"
              show={showActivityLogAdmin}
              data-testid="sidebar-dev-activity-log"
            >
              로그
            </SidebarLink>
            <SidebarLink
              to="/admin/app-notices"
              show={showPopupNoticeAdmin}
              data-testid="sidebar-dev-popup-notice"
            >
              팝업공지
            </SidebarLink>
            <SidebarLink
              to="/admin/app-releases"
              show={showAppReleaseAdmin}
              data-testid="sidebar-dev-app-releases"
            >
              버전 관리
            </SidebarLink>
          </SidebarCategory>

          {/* [Round B P2] 그룹 헤더 라벨 'arologis'(코드명 노출) → 한국어 업무 라벨 '배차'.
              다른 6그룹과 일관(판매/구매/회계/그룹웨어/인사/창고 운영). testid 무관(라벨만). */}
            <SidebarCategory
              label="배차"
              show={hasCatalogMenu && showArologisGroup}
              testId="sidebar-category-toggle-배차"
             activeTargets={[
               '/dispatch-board/history',
               '/admin/dispatch-groups',
               '/arologis/pre-classify',
               '/arologis/unassigned',
               '/arologis/dispatch-sms',
               '/arologis/dispatch-reconcile',
               '/admin/regions',
               '/admin/external-carriers',
               '/arologis/admin/auto-dispatch',
               '/arologis/admin/manual-dispatch',
               '/arologis/admin/driver-assignment',
             ]}
           >
             <SidebarLink to="/dispatch-board/history" show={dispatchMenuCatalog.some((entry) => entry.route === '/dispatch-board/history')} data-testid="sidebar-dispatch-history">
               배차현황
             </SidebarLink>
             <SidebarLink to="/arologis/pre-classify" show={dispatchMenuCatalog.some((entry) => entry.route === '/arologis/pre-classify')} data-testid="sidebar-arologis-preclassify">
               가배차리스트
             </SidebarLink>
             <SidebarLink to="/arologis/unassigned" show={dispatchMenuCatalog.some((entry) => entry.route === '/arologis/unassigned')} data-testid="sidebar-arologis-unassigned">
               미배차리스트
             </SidebarLink>
             {dispatchMenuCatalog
               .filter((entry) => entry.route === '/dispatch-board/history' || entry.route === '/arologis/pre-classify' || entry.route === '/arologis/unassigned')
               .map((entry) => (
               <SidebarLink
                 key={entry.route}
                 to={entry.route}
                 show
                 data-testid={dispatchMenuTestIds[entry.route]}
               >
                 {entry.label}
               </SidebarLink>
             ))}
          </SidebarCategory>

          <SidebarCategory
            label="창고 운영"
            show={showWarehouseOpsGroup}
            testId="sidebar-category-toggle-창고운영"
            activeTargets={[
              '/warehouses',
              '/inventory/stock-balance',
              '/inventory/inout-analysis',
              '/inventory/safety-stock-alerts',
              '/inventory/compensation-failures',
              '/admin/slip-edit-requests',
              '/admin/photo-audit',
            ]}
          >
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
              <SidebarLink
                to="/inventory/inout-analysis"
                show={showInOutAnalysis}
                requiredRole="ACCOUNTANT / SALES / MANAGER / MASTER"
                data-testid="sidebar-inventory-inout-analysis"
              >
                입출고 내역·분석
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
          </> : null}
        </nav>
        <div style={{ marginTop: 'auto', fontSize: 12, color: 'var(--color-neutral-500)' }}>
          {CURRENT_VERSION} · 사내 전용
        </div>
      </aside>
      <div
        data-testid="app-drawer-backdrop"
        className={`app-drawer-backdrop no-print${drawerOpen ? ' is-open' : ''}`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />
      <main className={`app-main${isPrintSurface ? ' is-print-surface' : ''}`}>
        <header className="app-header no-print">
          <div className="app-header-title-row">
            <button
              type="button"
              ref={drawerToggleRef}
              data-testid="app-drawer-toggle"
              className="app-drawer-toggle no-print"
              aria-label="메뉴 열기"
              aria-expanded={drawerOpen}
              aria-controls="app-drawer"
              onClick={() => setDrawerOpen(true)}
            >
              <span aria-hidden="true">≡</span>
            </button>
            <h2 data-testid="header-page-title">
              {displayTitle}
              {meta ? <span className="app-header-meta">[{meta}]</span> : null}
            </h2>
          </div>
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
                {sanitizeDisplayName(auth?.fullName)} · {auth?.role ?? '-'}
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
