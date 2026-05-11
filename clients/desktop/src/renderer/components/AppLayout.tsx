/**
 * 인증된 사용자용 앱 셸 레이아웃 — 좌측 사이드바 + 우측 본문 (Outlet).
 *
 * 사이드바 메뉴 (slip-output-format 슬라이스 IA 재편 — Q1=A 새 슬라이스):
 * - 대시보드 (`/`)
 * - 창고 (`/warehouses`)
 * - 판매조회 (`/sales`)     — 출고전표, 영업원 메인
 * - 구매조회 (`/purchases`) — 입고전표, 회계원 메인
 * - 재고이동 (`/transfers`) — 창고 간 이동, 창고원/재고원
 * - 링크발송 (`/sales/link-dispatch`) — 배송 묶음 + e-sign URL SMS 발송 (link-dispatch-slice)
 *
 * accounting-slice-A 신규 그룹 "회계" — ACCOUNTANT/MASTER 만 가시:
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
import { useSessionStore } from '../stores/session'
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
// [P1-5] arologis 배차 admin 3개 신규 화면 — DISPATCH / MANAGER / MASTER
import { ARO_ADMIN_DISPATCH_ROLES } from '../api/arologisAdminDispatchApi'

/**
 * [PR-F2 Designer mock] vendor 발주서 OCR 업로드 — SALES / MANAGER / MASTER.
 * legacy GAS #10 (에어디자이너) + #14 (제이시스템) 운송장/발주서 OCR native 이식.
 * BE Tesseract OCR endpoint 합류 시 정식 가드 export 로 교체. 영업 그룹 메뉴.
 */
const VENDOR_ORDER_OCR_SIDEBAR_ROLES = ['SALES', 'MANAGER', 'MASTER'] as const

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

  // accounting-slice-A — 회계 그룹은 ACCOUNTANT/MASTER/MANAGER 가시 (W-4: BE @PreAuthorize 일치)
  const showAccounting = canAccessAccounting(auth?.role)
  // [PR-E2 FE-9] 홈택스 일괄 양식 entry — ACCOUNTANT / MANAGER / MASTER 가시.
  // showAccounting 이 false 인 MANAGER 도 entry 단독 노출 가능 (별도 분기).
  const showHometaxExport = canAccessHometaxExport(auth?.role)
  // [PR-E2 FE-7] 거래처 원장 entry — ACCOUNTANT / MANAGER / MASTER 가시.
  // showAccounting 이 false 인 MANAGER 도 entry 단독 노출 가능 (별도 분기).
  const showPartnerLedger = canAccessPartnerLedger(auth?.role)

  // [Phase 10 P1-5] arologis 수동 배차 — DISPATCH/MASTER 가드 (현재 backlog DISPATCH role 부재로 MASTER/MANAGER 매핑)
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
  // [P1-5] arologis admin 3개 신규 화면 — DISPATCH / MANAGER / MASTER 모두 포함
  const showArologisAdmin = !!auth?.role
    && (ARO_ADMIN_DISPATCH_ROLES as readonly string[]).includes(auth.role)
  // arologis 그룹 가시성 — 수동 배차 / 가배차 분류 / 미배차 리스트 / 배차안내 SMS / P1-5 admin 중 하나라도 보이면 그룹 노출
  const showArologis
    = showArologisManual
    || showArologisPreClassify
    || showArologisUnassigned
    || showDispatchSms
    || showArologisAdmin

  // [Phase 10 P0-5] 관리자 admin 메뉴 — MASTER 만 가시
  const showAdmin = canAccessAdmin(auth?.role)
  // [Phase 10 P2-6] 재고 실사 메뉴 — WAREHOUSE / MASTER 만 가시
  const showAudit = canAccessAudit(auth?.role)
  // [PR-E1 FE-1] DPS 입고 비교 — WAREHOUSE / MASTER / MANAGER / INVENTORY 가시
  const showDpsCompare = canAccessDpsCompare(auth?.role)
  // [PR-H3 FE-1] 전표 수정/삭제 요청 대시보드 — WAREHOUSE / MANAGER / MASTER 가시
  const showSlipEditRequests = !!auth?.role
    && (SLIP_EDIT_REQUEST_REVIEWER_ROLES as readonly string[]).includes(auth.role)
  // [P0-9] 입고 검수 — WAREHOUSE / MANAGER / MASTER (재고 적용 권한과 일치)
  const INBOUND_INSPECTION_ROLES = ['WAREHOUSE', 'MANAGER', 'MASTER'] as const
  const showInboundInspection = !!auth?.role
    && (INBOUND_INSPECTION_ROLES as readonly string[]).includes(auth.role)
  // [P1-3] 안전재고 알림 — MASTER / MANAGER / WAREHOUSE 가시
  const showSafetyStockAlerts = showSafetyStock
  // 창고 운영 그룹 가시성 — 재고 실사 / DPS 입고 비교 / 전표 요청 / 입고 검수 / 안전재고 알림 중 하나라도 보이면 그룹 노출
  const showWarehouseOps = showAudit || showDpsCompare || showSlipEditRequests || showInboundInspection || showSafetyStockAlerts
  // [PR-D Phase B FE-D] 단톡방 매핑 — MASTER / MANAGER (BE @PreAuthorize 일치).
  // showAdmin 이 false 인 MANAGER 도 entry 가 가시되도록 별도 분기.
  // [PR-E1 FE-5] 전표 정리 entry — SALES / MANAGER / MASTER / ACCOUNTANT
  const showSlipCleanup = !!auth?.role
    && (SLIP_CLEANUP_ROLES as readonly string[]).includes(auth.role)
  // [PR-E1 FE-4] 내일자 전표 이미지 entry — SALES / MANAGER / MASTER
  const showNextDaySlip = canAccessNextDaySlip(auth?.role)
  // [PR-F2 Designer mock] vendor 발주서 OCR 업로드 entry — SALES / MANAGER / MASTER (영업 그룹).
  const showVendorOrderOcr = !!auth?.role
    && (VENDOR_ORDER_OCR_SIDEBAR_ROLES as readonly string[]).includes(auth.role)
  const showChatRoomAdmin = canAccessChatRoomAdmin(auth?.role)

  return (
    <div className="app-shell">
      <aside className="app-sidebar no-print">
        <h1>Samhan Public</h1>
        <nav>
          <NavLink to="/" end>
            대시보드
          </NavLink>
          <NavLink to="/warehouses">창고</NavLink>
          <NavLink to="/sales">판매조회</NavLink>
          <NavLink to="/purchases">구매조회</NavLink>
          <NavLink to="/transfers">재고이동</NavLink>
          <NavLink to="/sales/link-dispatch">링크발송</NavLink>

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
          {/* [sales-purchase-query] 판매조회 신규 — 풍성한 컬럼 + 다중 선택 + 50/page */}
          <NavLink
            to="/sales/query"
            data-testid="sidebar-sales-query"
          >
            판매 조회 (상세)
          </NavLink>
          {/* [sales-purchase-query] 구매조회 신규 — 창고 그룹 상단에 노출 */}
          <NavLink
            to="/purchases/query"
            data-testid="sidebar-purchase-query"
          >
            구매 조회 (상세)
          </NavLink>
          <NavLink to="/sales/estimates">견적서</NavLink>
          <NavLink to="/sales/partner-orders">주문서 조회</NavLink>
          <NavLink to="/sales/order-approvals">주문서 승인</NavLink>
          <NavLink to="/sales/partner-dc-config">거래처 DC 설정</NavLink>
          {showSlipCleanup ? (
            <NavLink
              to="/sales/slip-cleanup"
              data-testid="sidebar-sales-slip-cleanup"
            >
              전표 정리
            </NavLink>
          ) : null}
          {showNextDaySlip ? (
            <NavLink
              to="/sales/next-day-slip"
              data-testid="sidebar-sales-next-day-slip"
            >
              내일자 전표 이미지
            </NavLink>
          ) : null}
          {/* [PR-F2 Designer mock] vendor 발주서 OCR 업로드 — SALES/MANAGER/MASTER. */}
          {showVendorOrderOcr ? (
            <NavLink
              to="/sales/vendor-order-upload"
              data-testid="sidebar-sales-vendor-order-upload"
            >
              vendor 발주 OCR
            </NavLink>
          ) : null}

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
              <NavLink to="/accounting/accounts">계정과목</NavLink>
              <NavLink to="/accounting/journals">분개장</NavLink>
              <NavLink to="/accounting/tax-invoices">세금계산서</NavLink>
              <NavLink to="/accounting/balances">시산표</NavLink>
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
              <NavLink to="/warehouse/closing">매출 마감</NavLink>
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
              {showArologisManual ? (
                <NavLink to="/arologis/manual">수동 배차</NavLink>
              ) : null}
              {/* [Phase 10 PR-E1 FE-2] 가배차 분류 — MASTER/MANAGER/DISPATCH 가시. */}
              {showArologisPreClassify ? (
                <NavLink
                  to="/arologis/pre-classify"
                  data-testid="sidebar-arologis-preclassify"
                >
                  가배차 분류
                </NavLink>
              ) : null}
              {/* [Phase 10 PR-E1 FE-3] 미배차 리스트 — MASTER/MANAGER/DISPATCH 가시. */}
              {showArologisUnassigned ? (
                <NavLink
                  to="/arologis/unassigned"
                  data-testid="sidebar-arologis-unassigned"
                >
                  미배차 리스트
                </NavLink>
              ) : null}
              {/* [PR-E1 FE-6] 배차안내 SMS — DISPATCH/MANAGER/MASTER 가시. */}
              {showDispatchSms ? (
                <NavLink
                  to="/arologis/dispatch-sms"
                  data-testid="sidebar-arologis-dispatch-sms"
                >
                  배차안내 SMS
                </NavLink>
              ) : null}
              {/* [PR-D Phase B FE-B] 가배차 지역 분류 — MASTER/MANAGER 가시 (현재 ARO_MANUAL_DISPATCH_ROLES 와 동일 집합). */}
              {showArologisManual ? (
                <NavLink to="/admin/regions" data-testid="sidebar-arologis-regions">
                  지역 분류
                </NavLink>
              ) : null}
              {/* [P1-5] arologis 배차 admin 3개 신규 메뉴 — DISPATCH / MANAGER / MASTER. */}
              {showArologisAdmin ? (
                <>
                  <NavLink
                    to="/arologis/admin/auto-dispatch"
                    data-testid="sidebar-arologis-auto-dispatch"
                  >
                    자동 매칭
                  </NavLink>
                  <NavLink
                    to="/arologis/admin/manual-dispatch"
                    data-testid="sidebar-arologis-manual-dispatch-admin"
                  >
                    배차 관리
                  </NavLink>
                  <NavLink
                    to="/arologis/admin/driver-assignment"
                    data-testid="sidebar-arologis-driver-assignment"
                  >
                    기사 배정
                  </NavLink>
                </>
              ) : null}
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
              {showInboundInspection ? (
                <NavLink
                  to="/warehouse/inbound-inspections"
                  data-testid="sidebar-warehouse-inbound-inspections"
                >
                  입고 검수
                </NavLink>
              ) : null}
              {showAudit ? (
                <NavLink to="/warehouse/audit">재고 실사</NavLink>
              ) : null}
              {showDpsCompare ? (
                <NavLink
                  to="/warehouse/dps-compare"
                  data-testid="sidebar-warehouse-dps-compare"
                >
                  DPS 입고 비교
                </NavLink>
              ) : null}
              {/* [PR-H3 FE-1] 전표 수정/삭제 요청 대시보드 — WAREHOUSE/MANAGER/MASTER 가시. */}
              {showSlipEditRequests ? (
                <NavLink
                  to="/admin/slip-edit-requests"
                  data-testid="sidebar-warehouse-slip-edit-requests"
                >
                  전표 수정 요청
                </NavLink>
              ) : null}
              {/* [P1-3] 안전재고 알림 — MASTER/MANAGER/WAREHOUSE 가시. 배지로 건수 표시. */}
              {showSafetyStockAlerts ? (
                <NavLink
                  to="/inventory/safety-stock-alerts"
                  data-testid="sidebar-warehouse-safety-stock-alerts"
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  안전재고 알림
                  {safetyStockCount > 0 ? (
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
                </NavLink>
              ) : null}
            </>
          ) : null}

          {showAdmin ? (
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
                관리자
              </div>
              <NavLink to="/admin/users" data-testid="sidebar-admin-users">
                사용자
              </NavLink>
              <NavLink to="/admin/roles" data-testid="sidebar-admin-roles">
                권한
              </NavLink>
              <NavLink
                to="/admin/partners"
                data-testid="sidebar-admin-partners"
              >
                거래처
              </NavLink>
              <NavLink
                to="/admin/warehouses"
                data-testid="sidebar-admin-warehouses"
              >
                창고
              </NavLink>
              <NavLink
                to="/admin/departments"
                data-testid="sidebar-admin-departments"
              >
                부서
              </NavLink>
              {/*
                [PR-D Phase B FE-D] MASTER 시점: 관리자 그룹 안에서 단톡방 매핑 노출.
                MANAGER 시점은 아래 별도 분기 (showChatRoomAdmin && !showAdmin).
              */}
              <NavLink
                to="/admin/chat-rooms"
                data-testid="sidebar-admin-chat-rooms"
              >
                단톡방 매핑
              </NavLink>
            </>
          ) : null}

          {/*
            [PR-D Phase B FE-D] MANAGER 전용 — MASTER 가 아닌 MANAGER 가 관리자 그룹
            전체를 못 보지만 단톡방 매핑은 BE 가 허용하므로 entry 만 단독 노출.
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
              <NavLink
                to="/admin/chat-rooms"
                data-testid="sidebar-admin-chat-rooms"
              >
                단톡방 매핑
              </NavLink>
            </>
          ) : null}
        </nav>
        <div style={{ marginTop: 'auto', fontSize: 12, color: 'var(--color-neutral-500)' }}>
          v0.1.0 · 사내 전용
        </div>
      </aside>
      <main className="app-main">
        <header className="app-header no-print">
          <h2>
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
