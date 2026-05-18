/**
 * 인증된 사용자용 앱 셸 레이아웃 — 좌측 사이드바 + 우측 본문 (Outlet).
 *
 * 사이드바 메뉴 (slip-output-format 슬라이스 IA 재편 — Q1=A 새 슬라이스):
 * - 대시보드 (`/`)
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
import { useEffect, useRef, useState, useCallback } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { canInspectInbound, useSessionStore } from '../stores/session'
import { usePageTitleStore } from '../stores/pageTitle'
import { canAccessAccounting } from '../api/accounting'
import { ARO_MANUAL_DISPATCH_ROLES } from '../api/arologisManualApi'
// [Phase 10 PR-E1 FE-2/FE-3] arologis 가배차 분류 + 미배차 리스트 — MASTER/MANAGER/DISPATCH
import {
  ARO_PRECLASSIFY_ROLES,
  ARO_UNASSIGNED_ROLES,
} from '../api/arologisDispatchApi'
import { canAccessAdmin } from '../api/adminApi'
import { canAccessAudit } from '../api/auditApi'
import { canAccessChatRoomAdmin } from '../api/chatRoomApi'
import { SLIP_CLEANUP_ROLES } from '../api/slipCleanupApi'
// [PR-E1 FE-4] 내일자 전표 이미지 — SALES / MANAGER / MASTER (BE @PreAuthorize 일치)
import { canAccessNextDaySlip } from '../api/nextDaySlipApi'
// [PR-E1 FE-6] 배차안내 SMS 발송 — DISPATCH / MANAGER / MASTER (BE @PreAuthorize 일치)
import { canAccessDispatchSms } from '../api/dispatchSmsApi'
// [PR-E1 FE-1] DPS 입고 비교 — WAREHOUSE / MASTER / MANAGER / INVENTORY (BE @PreAuthorize 일치)
import { canAccessDpsCompare } from '../api/dpsCompareApi'
// [P0-B GAS 보강] 품목별 DPS 분석 — WAREHOUSE / MANAGER / MASTER (BE @PreAuthorize 일치)
import { canAccessDpsByProduct } from '../api/dpsByProductApi'
// [PR-E2 FE-9] 홈택스 일괄 등록 양식 — ACCOUNTANT / MANAGER / MASTER (BE @PreAuthorize 일치)
import { canAccessHometaxExport } from '../api/hometaxExportApi'
// [PR-E2 FE-7] 거래처별 원장 생성 — ACCOUNTANT / MANAGER / MASTER (사용자 명세 — MANAGER read-only 허용)
import { canAccessPartnerLedger } from '../api/partnerLedgerApi'
// [PR-H3 FE-1] 전표 수정/삭제 요청 처리 대시보드 — WAREHOUSE / MANAGER / MASTER (BE @PreAuthorize 일치)
import { SLIP_EDIT_REQUEST_REVIEWER_ROLES } from '../api/slipEditRequest'
// [P1-3] 안전재고 알림 — MASTER / MANAGER / WAREHOUSE. 헤더 배지 + 창고 운영 메뉴.
import {
  canAccessSafetyStock,
  fetchSafetyStockAlertCount,
} from '../api/safetyStockApi'
// [PR-F1 FE-2] 운송사 실배차 비교 — DISPATCH / MANAGER / MASTER
import { canAccessDispatchReconcile } from '../api/dispatchReconcileApi'
// [P1-5] arologis 배차 admin 3개 신규 화면 — MANAGER / MASTER
import { ARO_ADMIN_DISPATCH_ROLES } from '../api/arologisAdminDispatchApi'
// [D-AX-20] 사진 감사 — WAREHOUSE / MANAGER / MASTER
import { canAccessSlipPhotoAudit } from '../api/slipPhotoAuditApi'
// [SP-01] 거래처 관리 — SALES / MANAGER / MASTER
import { canAccessPartnerFull } from '../api/partnerApi'
import { canAccessDeliveryBatch } from '../api/delivery'
import { canAccessPartnerDcConfig } from '../api/sales'

/**
 * 사이드바 NavLink disabled 래퍼.
 *
 * <p>show=true 시 일반 NavLink, false 시 회색 disabled 처리 + tooltip.
 * pointer-events:none 은 CSS(.sidebar-disabled) 가 담당하고,
 * onClick preventDefault 를 이중 방어로 적용한다.
 *
 * @param show - 권한 보유 여부 (false 시 disabled)
 * @param requiredRole - tooltip 에 표시할 필요 ROLE 설명 (선택)
 */
function SidebarLink({
  to,
  show,
  requiredRole,
  'data-testid': testId,
  style,
  children,
}: {
  to: string
  show: boolean
  requiredRole?: string
  'data-testid'?: string
  style?: React.CSSProperties
  children: React.ReactNode
}) {
  const disabledTitle = requiredRole
    ? `권한이 없습니다 (필요 ROLE: ${requiredRole})`
    : '권한이 없습니다'

  return (
    <NavLink
      to={to}
      data-testid={testId}
      className={show ? undefined : 'sidebar-disabled'}
      aria-disabled={show ? undefined : true}
      title={show ? undefined : disabledTitle}
      onClick={(e) => {
        if (!show) e.preventDefault()
      }}
      style={style}
    >
      {children}
    </NavLink>
  )
}

/**
 * [PR-F2 Designer mock] vendor 발주서 OCR 업로드 — SALES / MANAGER / MASTER.
 * legacy GAS #10 (에어디자이너) + #14 (제이시스템) 운송장/발주서 OCR native 이식.
 * BE Tesseract OCR endpoint 합류 시 정식 가드 export 로 교체. 영업 그룹 메뉴.
 */
const VENDOR_ORDER_OCR_SIDEBAR_ROLES = ['SALES', 'MANAGER', 'MASTER'] as const

/**
 * [Slice 2] admin GAS 이식 메뉴 — 일반 카테고리 병행 노출 ROLE 가드.
 * 기존 /admin/* 라우트 그대로 유지 (마스터 메뉴 유지). 동일 라우트로 이동하는 항목만 추가.
 */
/** 배차지역 관리 (/admin/regions) — 배차(arologis) 카테고리 — DISPATCH/MANAGER/MASTER */
const REGION_MGMT_SIDEBAR_ROLES = ['DISPATCH', 'MANAGER', 'MASTER'] as const
/** 시트 동기화 (/admin/sheet-sync) — 설정 카테고리 — MANAGER/MASTER */
const SHEET_SYNC_SIDEBAR_ROLES = ['MANAGER', 'MASTER'] as const
/** 알리고 주소록 (/admin/aligo-address-book) — 메신저 카테고리 — MANAGER/MASTER */
const ALIGO_ADDRESS_BOOK_SIDEBAR_ROLES = ['MANAGER', 'MASTER'] as const
/** 발송금지 거래처 (/admin/blocked-partners) — 영업 카테고리 — MANAGER/MASTER */
const BLOCKED_PARTNERS_SIDEBAR_ROLES = ['MANAGER', 'MASTER'] as const
/**
 * [samhan-dispatch-board Phase A] 배차 메뉴 (/dispatch-board) — DISPATCH/MANAGER/MASTER.
 * Samhan Public 배차담당자 → 차량 그룹 + arologis 발송 흐름.
 */
const DISPATCH_BOARD_SIDEBAR_ROLES = ['DISPATCH', 'MANAGER', 'MASTER'] as const

export function AppLayout() {
  const auth = useSessionStore((s) => s.auth)
  const logout = useSessionStore((s) => s.logout)
  const title = usePageTitleStore((s) => s.title)
  const meta = usePageTitleStore((s) => s.meta)
  const navigate = useNavigate()

  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement | null>(null)

  // [P1-3] 안전재고 알림 건수 — 헤더 배지 + 60초 polling
  const [safetyStockCount, setSafetyStockCount] = useState(0)
  const showSafetyStock = canAccessSafetyStock(auth?.role)
  const refreshSafetyStockCount = useCallback(() => {
    if (!showSafetyStock) return
    fetchSafetyStockAlertCount()
      .then((count) => setSafetyStockCount(count))
      .catch(() => { /* 배지 조회 실패는 무시 */ })
  }, [showSafetyStock])
  useEffect(() => {
    refreshSafetyStockCount()
    const timer = setInterval(refreshSafetyStockCount, 60_000)
    return () => clearInterval(timer)
  }, [refreshSafetyStockCount])

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

  // accounting-slice-A — 회계 그룹은 ACCOUNTANT/MANAGER/MASTER 가시 (W-4: BE @PreAuthorize 일치)
  const showAccounting = canAccessAccounting(auth?.role)
  // [PR-E2 FE-9] 홈택스 일괄 양식 entry — ACCOUNTANT / MANAGER / MASTER 가시.
  // showAccounting 이 false 인 MANAGER 도 entry 단독 노출 가능 (별도 분기).
  const showHometaxExport = canAccessHometaxExport(auth?.role)
  // [PR-E2 FE-7] 거래처 원장 entry — ACCOUNTANT / MANAGER / MASTER 가시.
  // showAccounting 이 false 인 MANAGER 도 entry 단독 노출 가능 (별도 분기).
  const showPartnerLedger = canAccessPartnerLedger(auth?.role)
  const showDeliveryBatch = canAccessDeliveryBatch(auth?.role)

  // [Phase 10 P1-5] arologis 수동 배차 — DISPATCH / MANAGER / MASTER 가드
  const showArologisManual = !!auth?.role
    && (ARO_MANUAL_DISPATCH_ROLES as readonly string[]).includes(auth.role)
  // [Phase 10 PR-E1 FE-2] arologis 가배차 분류 — MASTER / MANAGER / DISPATCH (BE 와 동일 화이트리스트)
  const showArologisPreClassify = !!auth?.role
    && (ARO_PRECLASSIFY_ROLES as readonly string[]).includes(auth.role)
  // [PR-E1 FE-6] 배차안내 SMS — DISPATCH / MANAGER / MASTER
  const showDispatchSms = canAccessDispatchSms(auth?.role)
  // [Phase 10 PR-E1 FE-3] arologis 미배차 리스트 — MASTER / MANAGER / DISPATCH
  const showArologisUnassigned = !!auth?.role
    && (ARO_UNASSIGNED_ROLES as readonly string[]).includes(auth.role)
  // [PR-F1 FE-2] 운송사 실배차 비교 — DISPATCH / MANAGER / MASTER
  const showDispatchReconcile = canAccessDispatchReconcile(auth?.role)
  // [P1-5] arologis admin 3개 신규 화면 — MANAGER / MASTER
  const showArologisAdmin = !!auth?.role
    && (ARO_ADMIN_DISPATCH_ROLES as readonly string[]).includes(auth.role)
  // arologis 그룹 가시성 — 수동 배차 / 가배차 분류 / 미배차 리스트 / 배차안내 SMS / 실배차 비교 / P1-5 admin 중 하나라도 보이면 그룹 노출
  const showArologis
    = showArologisManual
    || showArologisPreClassify
    || showArologisUnassigned
    || showDispatchSms
    || showDispatchReconcile
    || showArologisAdmin

  // [Phase 10 P0-5] 관리자 admin 메뉴 — MASTER 만 가시
  const showAdmin = canAccessAdmin(auth?.role)
  // [Phase 10 P2-6] 재고 실사 메뉴 — WAREHOUSE / MASTER 만 가시
  const showAudit = canAccessAudit(auth?.role)
  // [PR-E1 FE-1] DPS 입고 비교 — WAREHOUSE / MASTER / MANAGER / INVENTORY 가시
  const showDpsCompare = canAccessDpsCompare(auth?.role)
  // [P0-B GAS 보강] 품목별 DPS 분석 — WAREHOUSE / MANAGER / MASTER 가시
  const showDpsByProduct = canAccessDpsByProduct(auth?.role)
  // [PR-H3 FE-1] 전표 수정/삭제 요청 대시보드 — WAREHOUSE / MANAGER / MASTER 가시
  const showSlipEditRequests = !!auth?.role
    && (SLIP_EDIT_REQUEST_REVIEWER_ROLES as readonly string[]).includes(auth.role)
  // [D-AX-20] 사진 감사 — WAREHOUSE / MANAGER / MASTER
  const showPhotoAudit = canAccessSlipPhotoAudit(auth?.role)
  // [P0-9] 입고 검수 — WAREHOUSE / MANAGER / MASTER (inventory-service 권한과 일치)
  const showInboundInspection = canInspectInbound(auth?.role)
  // [P1-3] 안전재고 알림 — MASTER / MANAGER / WAREHOUSE 가시
  const showSafetyStockAlerts = showSafetyStock
  // 창고 운영 그룹 가시성 — 재고 실사 / DPS 입고 비교 / 품목별 DPS 분석 / 전표 요청 / 사진 감사 / 입고 검수 / 안전재고 알림 중 하나라도 보이면 그룹 노출
  const showWarehouseOps = showAudit || showDpsCompare || showDpsByProduct || showSlipEditRequests || showPhotoAudit || showInboundInspection || showSafetyStockAlerts
  // [PR-D Phase B FE-D] 단톡방 매핑 — MASTER / MANAGER (BE @PreAuthorize 일치).
  // showAdmin 이 false 인 MANAGER 도 entry 가 가시되도록 별도 분기.
  // [PR-E1 FE-5] 전표 정리 entry — SALES / MANAGER / MASTER
  const showSlipCleanup = !!auth?.role
    && (SLIP_CLEANUP_ROLES as readonly string[]).includes(auth.role)
  // [PR-E1 FE-4] 내일자 전표 이미지 entry — SALES / MANAGER / MASTER
  const showNextDaySlip = canAccessNextDaySlip(auth?.role)
  // [PR-F2 Designer mock] vendor 발주서 OCR 업로드 entry — SALES / MANAGER / MASTER (영업 그룹).
  const showVendorOrderOcr = !!auth?.role
    && (VENDOR_ORDER_OCR_SIDEBAR_ROLES as readonly string[]).includes(auth.role)
  // [SP-09-3] 영수증 OCR 업로드 entry — WAREHOUSE / ACCOUNTANT / MANAGER / MASTER (구매 그룹).
  // 사용자 정정 2026-05-18: ACCOUNTANT 추가.
  const RECEIPT_OCR_SIDEBAR_ROLES = ['WAREHOUSE', 'ACCOUNTANT', 'MANAGER', 'MASTER'] as const
  const showReceiptOcr = !!auth?.role
    && (RECEIPT_OCR_SIDEBAR_ROLES as readonly string[]).includes(auth.role)
  const showChatRoomAdmin = canAccessChatRoomAdmin(auth?.role)

  // [Slice 2] admin GAS 이식 — 일반 카테고리 병행 노출
  const showRegionMgmt = !!auth?.role
    && (REGION_MGMT_SIDEBAR_ROLES as readonly string[]).includes(auth.role)
  const showSheetSync = !!auth?.role
    && (SHEET_SYNC_SIDEBAR_ROLES as readonly string[]).includes(auth.role)
  const showAligoAddressBook = !!auth?.role
    && (ALIGO_ADDRESS_BOOK_SIDEBAR_ROLES as readonly string[]).includes(auth.role)
  const showBlockedPartners = !!auth?.role
    && (BLOCKED_PARTNERS_SIDEBAR_ROLES as readonly string[]).includes(auth.role)
  const showPartnerManagement = canAccessPartnerFull(auth?.role)
  const showPartnerDcConfig = canAccessPartnerDcConfig(auth?.role)
  // [samhan-dispatch-board Phase A] 배차 메뉴 — DISPATCH/MANAGER/MASTER 가시.
  const showDispatchBoard = !!auth?.role
    && (DISPATCH_BOARD_SIDEBAR_ROLES as readonly string[]).includes(auth.role)

  return (
    <div className="app-shell">
      <aside className="app-sidebar no-print">
        <h1>Samhan Public</h1>
        <nav>
          <NavLink to="/" end>
            대시보드
          </NavLink>
          <NavLink to="/warehouses" data-testid="sidebar-warehouses">창고 관리</NavLink>
          {/* [2a 메뉴 통합 + SP-03 IA] /sales, /purchases 는 SalesQueryPage / PurchaseQueryPage
              (풍성한 컬럼 + 다중 선택 + 50/page). legacy SlipListPage 는 /sales/slips,
              /purchases/slips 로 이전. 메뉴명은 조회 전용 오해를 줄이기 위해 관리형 라벨을 사용. */}
          <NavLink to="/sales" data-testid="sidebar-sales">판매관리</NavLink>
          <NavLink to="/purchases" data-testid="sidebar-purchases">구매관리</NavLink>
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
          <NavLink to="/transfers" data-testid="sidebar-transfers">재고이동 관리</NavLink>
          <SidebarLink
            to="/sales/link-dispatch"
            show={showDeliveryBatch}
            requiredRole="MANAGER / MASTER"
            data-testid="sidebar-link-dispatch"
          >
            링크발송
          </SidebarLink>
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

          {/* [Phase 6 v4 → P2-1] 판매 그룹 — 견적서 SamhanLogis 도메인 (legacy webview 폐기) + 4종 sub. */}
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
            판매
          </div>
          {/* [2a 메뉴 통합 + SP-03 IA] '판매 조회 (상세)' / '구매 조회 (상세)' 중복 진입점 제거 —
              이제 사이드바 최상단 '판매관리' / '구매관리' 가 SalesQueryPage / PurchaseQueryPage
              로 직행한다. /sales/query, /purchases/query 라우트는 기존 bookmark 호환 유지. */}
          <NavLink to="/sales/estimates">견적서 관리</NavLink>
          <NavLink to="/sales/partner-orders">주문서 관리</NavLink>
          <NavLink to="/sales/order-approvals">주문서 승인</NavLink>
          <SidebarLink
            to="/sales/partner-dc-config"
            show={showPartnerDcConfig}
            requiredRole="SALES / MANAGER / MASTER"
            data-testid="sidebar-sales-partner-dc-config"
          >
            거래처 DC 설정
          </SidebarLink>
          {/* [SP-01] 거래처 관리 — 생성 성공 후 복귀 대상인 /admin/partners 를 SALES/MANAGER/MASTER 에 직접 노출. */}
          <SidebarLink
            to="/admin/partners"
            show={showPartnerManagement}
            requiredRole="SALES / MANAGER / MASTER"
            data-testid="sidebar-sales-partners"
          >
            거래처 관리
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
            to="/sales/closing"
            show={showAccounting}
            requiredRole="ACCOUNTANT / MANAGER / MASTER"
            data-testid="sidebar-sales-closing"
          >
            매출 마감
          </SidebarLink>
          <SidebarLink
            to="/sales/next-day-slip"
            show={showNextDaySlip}
            requiredRole="SALES / MANAGER / MASTER"
            data-testid="sidebar-sales-next-day-slip"
          >
            내일자 전표 이미지
          </SidebarLink>
          {/* [PR-F2 Designer mock] vendor 발주서 OCR 업로드 — SALES/MANAGER/MASTER. */}
          <SidebarLink
            to="/sales/vendor-order-upload"
            show={showVendorOrderOcr}
            requiredRole="SALES / MANAGER / MASTER"
            data-testid="sidebar-sales-vendor-order-upload"
          >
            vendor 발주 OCR
          </SidebarLink>
          {/* [Slice 2] 발송금지 거래처 — /admin/blocked-partners — MANAGER/MASTER */}
          <SidebarLink
            to="/admin/blocked-partners"
            show={showBlockedPartners}
            requiredRole="MANAGER / MASTER"
            data-testid="sidebar-sales-blocked-partners"
          >
            발송금지 거래처
          </SidebarLink>

          {showAccounting ? (
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
                회계
              </div>
              <NavLink to="/accounting/accounts" data-testid="sidebar-accounting-accounts">계정과목</NavLink>
              <NavLink to="/accounting/journals" data-testid="sidebar-accounting-journals">분개장</NavLink>
              <NavLink to="/accounting/tax-invoices" data-testid="sidebar-accounting-tax-invoices">세금계산서</NavLink>
              <NavLink to="/accounting/balances" data-testid="sidebar-accounting-balances">시산표</NavLink>
              {/* [P0-1 Slice A+B] 재무 보고서 서브메뉴 — 7개 보고서 진입점. */}
              {/* F1: end prop — 자식 라우트 진입 시 부모 active 강조 회피 */}
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
              {/* [P0-1 Slice B] 세금/거래처 보고서 3종 */}
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
              {/* [P0-1 Slice C] 분석 보고서 4종 */}
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
                to="/sales/closing"
                data-testid="sidebar-accounting-sales-closing"
              >
                매출 마감
              </NavLink>
              <NavLink
                to="/accounting/period-close"
                data-testid="sidebar-accounting-period-close"
              >
                월말 마감
              </NavLink>
              {/* [PR-E2 FE-8] 거래명세서 일괄 — ACCOUNTANT/MASTER (회계 그룹 안). */}
              <NavLink
                to="/accounting/statement-batch"
                data-testid="sidebar-accounting-statement-batch"
              >
                거래명세서 일괄
              </NavLink>
              {/* [PR-E2 FE-7] 거래처 원장 — ACCOUNTANT/MASTER 시점 (회계 그룹 안). */}
              <NavLink
                to="/accounting/partner-ledger"
                data-testid="sidebar-accounting-partner-ledger"
              >
                거래처 원장
              </NavLink>
              {/* [PR-E2 FE-9] 홈택스 일괄 양식 — ACCOUNTANT/MASTER 시점 (회계 그룹 안). */}
              <NavLink
                to="/accounting/hometax-export"
                data-testid="sidebar-accounting-hometax-export"
              >
                홈택스 일괄 양식
              </NavLink>
              {/* [supplier-profile + datagrid] 사업자 양식 — ACCOUNTANT 조회 / MANAGER/MASTER CRUD. */}
              <NavLink
                to="/accounting/supplier-profiles"
                data-testid="sidebar-accounting-supplier-profile"
              >
                사업자 양식
              </NavLink>
            </>
          ) : null}

          {/*
            [PR-E2 FE-7 / FE-9] MANAGER 전용 — MASTER/ACCOUNTANT 가 아닌 MANAGER 가
            회계 그룹 전체를 못 보지만 홈택스 일괄 양식 / 거래처 원장은 BE 또는
            FE 명세가 허용하므로 entry 만 단독 노출.
          */}
          {(showHometaxExport || showPartnerLedger) && !showAccounting ? (
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
                회계
              </div>
              {showPartnerLedger ? (
                <NavLink
                  to="/accounting/partner-ledger"
                  data-testid="sidebar-accounting-partner-ledger"
                >
                  거래처 원장
                </NavLink>
              ) : null}
              {showHometaxExport ? (
                <NavLink
                  to="/accounting/hometax-export"
                  data-testid="sidebar-accounting-hometax-export"
                >
                  홈택스 일괄 양식
                </NavLink>
              ) : null}
            </>
          ) : null}

          {showArologis ? (
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
                arologis
              </div>
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
                show={showArologisPreClassify}
                requiredRole="DISPATCH / MANAGER / MASTER"
                data-testid="sidebar-arologis-preclassify"
              >
                가배차 분류
              </SidebarLink>
              {/* [Phase 10 PR-E1 FE-3] 미배차 리스트 — MASTER/MANAGER/DISPATCH. */}
              <SidebarLink
                to="/arologis/unassigned"
                show={showArologisUnassigned}
                requiredRole="DISPATCH / MANAGER / MASTER"
                data-testid="sidebar-arologis-unassigned"
              >
                미배차 리스트
              </SidebarLink>
              {/* [PR-E1 FE-6] 배차안내 SMS — DISPATCH/MANAGER/MASTER. */}
              <SidebarLink
                to="/arologis/dispatch-sms"
                show={showDispatchSms}
                requiredRole="DISPATCH / MANAGER / MASTER"
                data-testid="sidebar-arologis-dispatch-sms"
              >
                배차안내 SMS
              </SidebarLink>
              {/* [SP-09-2 FE] SMS 발송 이력 — SEND_AUDIT 전용 조회화면. */}
              <SidebarLink
                to="/arologis/dispatch-sms/send-audit"
                show={showDispatchSms}
                requiredRole="DISPATCH / MANAGER / MASTER"
                data-testid="sidebar-arologis-sms-send-audit"
              >
                SMS 발송 이력
              </SidebarLink>
              {/* [SP-04] 운송사 실배차 비교 — hidden route 를 공식 메뉴 entry 로 승격. */}
              <SidebarLink
                to="/arologis/dispatch-reconcile"
                show={showDispatchReconcile}
                requiredRole="DISPATCH / MANAGER / MASTER"
                data-testid="sidebar-arologis-dispatch-reconcile"
              >
                실배차 비교
              </SidebarLink>
              {/* [SP-06] 배차지역 관리 — /admin/regions 단일 entry. DISPATCH 는 조회 전용, MANAGER/MASTER 는 수정 가능. */}
              <SidebarLink
                to="/admin/regions"
                show={showRegionMgmt || showArologisManual}
                requiredRole="DISPATCH / MANAGER / MASTER"
                data-testid="sidebar-arologis-region-mgmt"
              >
                배차지역 관리
              </SidebarLink>
              {/* [P1-5] arologis 배차 admin 3개 신규 메뉴 — MANAGER / MASTER. */}
              <SidebarLink
                to="/arologis/admin/auto-dispatch"
                show={showArologisAdmin}
                requiredRole="MANAGER / MASTER"
                data-testid="sidebar-arologis-auto-dispatch"
              >
                자동 매칭
              </SidebarLink>
              <SidebarLink
                to="/arologis/admin/manual-dispatch"
                show={showArologisAdmin}
                requiredRole="MANAGER / MASTER"
                data-testid="sidebar-arologis-manual-dispatch-admin"
              >
                배차 관리
              </SidebarLink>
              <SidebarLink
                to="/arologis/admin/driver-assignment"
                show={showArologisAdmin}
                requiredRole="MANAGER / MASTER"
                data-testid="sidebar-arologis-driver-assignment"
              >
                기사 배정
              </SidebarLink>
            </>
          ) : null}

          {showWarehouseOps ? (
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
                창고 운영
              </div>
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
              {/* [P1-3] 안전재고 알림 — MASTER/MANAGER/WAREHOUSE. 배지로 건수 표시. */}
              <SidebarLink
                to="/inventory/safety-stock-alerts"
                show={showSafetyStockAlerts}
                requiredRole="MASTER / MANAGER / WAREHOUSE"
                data-testid="sidebar-warehouse-safety-stock-alerts"
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                안전재고 알림
                {showSafetyStockAlerts && safetyStockCount > 0 ? (
                  <span
                    data-testid="sidebar-safety-stock-badge"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: 18,
                      height: 18,
                      borderRadius: 9,
                      background: 'var(--color-danger-500)',
                      color: 'var(--color-neutral-0)',
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '0 5px',
                      lineHeight: 1,
                    }}
                  >
                    {safetyStockCount}
                  </span>
                ) : null}
              </SidebarLink>
            </>
          ) : null}

          {showAdmin ? (
            <>
              {/*
                [PR-HR] MASTER 시점: 관리자 그룹은 인사 카테고리(AdminLayout)로 이전.
                AppLayout 에서는 단축 링크(사용자/권한 조회)만 유지.
                실제 인사 관리는 사이드바 최하단 "인사" 카테고리에서 접근.
              */}
            </>
          ) : null}

          {/*
            [PR-D Phase B FE-D] MANAGER 전용 — 단톡방 매핑 단독 노출.
            MASTER 는 인사 카테고리 (AdminLayout 내) 에서 접근.
          */}
          {showChatRoomAdmin && !showAdmin ? (
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
                알림 매핑
              </div>
              <SidebarLink
                to="/admin/chat-rooms"
                show={showChatRoomAdmin}
                requiredRole="MASTER / MANAGER"
                data-testid="sidebar-admin-chat-rooms"
              >
                단톡방 매핑
              </SidebarLink>
            </>
          ) : null}

          {/* [Slice 2] 메신저 카테고리 — 알리고 주소록 (MANAGER/MASTER). */}
          {showAligoAddressBook ? (
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
                메신저
              </div>
              <SidebarLink
                to="/admin/aligo-address-book"
                show={showAligoAddressBook}
                requiredRole="MANAGER / MASTER"
                data-testid="sidebar-messenger-aligo-address-book"
              >
                알리고 주소록
              </SidebarLink>
            </>
          ) : null}

          {/* [Slice 2] 설정 카테고리 — 시트 동기화 (MANAGER/MASTER). */}
          {showSheetSync ? (
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
                설정
              </div>
              <SidebarLink
                to="/admin/sheet-sync"
                show={showSheetSync}
                requiredRole="MANAGER / MASTER"
                data-testid="sidebar-settings-sheet-sync"
              >
                시트 동기화
              </SidebarLink>
            </>
          ) : null}

          {/*
            [PR-HR] 인사 카테고리 — 대표실 부서 + MASTER 만 접근 가능.
            disabled 시 tooltip: "대표실 부서 권한자만 접근 가능".
            활성 시 AdminLayout (/admin/users) 로 진입.
          */}
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
            인사
          </div>
          <NavLink
            to="/admin/users"
            data-testid="sidebar-hr-users"
            className={showAdmin ? undefined : 'sidebar-disabled'}
            aria-disabled={showAdmin ? undefined : true}
            title={showAdmin ? undefined : '대표실 부서 권한자만 접근 가능'}
            onClick={(e) => {
              if (!showAdmin) e.preventDefault()
            }}
          >
            인사 관리
          </NavLink>
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
            {/* [P1-3] 안전재고 알림 헤더 count chip — 벨 아이콘 + position absolute 원형 오버레이.
               Designer spec: count > 0 시만 노출. data-testid: header-safety-stock-count-chip. */}
            {showSafetyStock && safetyStockCount > 0 ? (
              <button
                type="button"
                data-testid="header-safety-stock-count-chip"
                onClick={() => navigate('/inventory/safety-stock-alerts')}
                style={{
                  position: 'relative',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 36,
                  height: 36,
                  background: 'transparent',
                  border: '1px solid var(--color-neutral-200)',
                  borderRadius: 8,
                  cursor: 'pointer',
                  padding: 0,
                }}
                aria-label={`안전재고 알림 ${safetyStockCount}건`}
                title={`안전재고 알림 ${safetyStockCount}건`}
              >
                {/* 벨 아이콘 (SVG) */}
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--color-neutral-600)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {/* 원형 카운트 오버레이 — position absolute */}
                <span
                  style={{
                    position: 'absolute',
                    top: -6,
                    right: -6,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: 18,
                    height: 18,
                    borderRadius: 9,
                    background: 'var(--color-danger-500)',
                    color: 'var(--color-neutral-0)',
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '0 4px',
                    lineHeight: 1,
                    border: '2px solid var(--color-neutral-0)',
                  }}
                >
                  {safetyStockCount > 99 ? '99+' : safetyStockCount}
                </span>
              </button>
            ) : null}
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
