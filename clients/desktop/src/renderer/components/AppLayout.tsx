/**
 * 인증된 사용자용 앱 셸 레이아웃 — 좌측 사이드바 + 우측 본문 (Outlet).
 *
 * 사이드바 메뉴 (slip-output-format 슬라이스 IA 재편 — Q1=A 새 슬라이스):
 * - 대시보드 (`/`)
 * - 창고 (`/warehouses`)
 * - 판매조회 (`/sales`)     — 출고전표, 영업원 메인
 * - 구매조회 (`/purchases`) — 입고전표, 회계원 메인
 * - 재고이동 (`/transfers`) — 창고 간 이동, 창고원/재고원
 * - 링크발송 (`/sales/link-dispatch`) — 배송 묶음 + e-sign URL SMS 발송 (notification-slice-B)
 *
 * accounting-slice-A 신규 그룹 "회계" — ACCOUNTANT/MASTER 만 가시:
 * - 계정과목 (`/accounting/accounts`)
 * - 분개장   (`/accounting/journals`)
 * - 시산표   (`/accounting/balances`)
 *
 * 기존 PR #18 의 `/slips` IA 는 폐기. 영업/회계/창고 흐름 분리.
 *
 * 우상단에는 현재 사용자명 + 역할 + 로그아웃 버튼을 표시한다.
 * 인쇄 화면 (`/print/...`) 에서는 @media print CSS 가 사이드바/헤더를 숨긴다.
 *
 * Slice A (sales-polish-2-slice) 갱신 — Designer `wireframes.md` § 1 + `components.md` § 2:
 * - 헤더 `<h2>업무 화면</h2>` 고정 → `usePageTitleStore` 의 동적 화면명 + meta bracket
 * - 사용자 피드백 #2 ("상단 '업무 화면' 표시" 모호) 해결
 * - 빈 title 시 "업무 화면" fallback 표시 (라우트 전환 race condition 호환)
 */
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Button } from '@samhan/design-system'
import { useSessionStore } from '../stores/session'
import { usePageTitleStore } from '../stores/pageTitle'
import { canAccessAccounting } from '../api/accounting'

export function AppLayout() {
  const auth = useSessionStore((s) => s.auth)
  const logout = useSessionStore((s) => s.logout)
  const title = usePageTitleStore((s) => s.title)
  const meta = usePageTitleStore((s) => s.meta)
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  // race condition 호환 — 빈 title 시 "업무 화면" fallback (Designer § 2.7)
  const displayTitle = title || '업무 화면'

  // accounting-slice-A — 회계 그룹은 ACCOUNTANT/MASTER 만 가시
  const showAccounting = canAccessAccounting(auth?.role)

  return (
    <div className="app-shell">
      <aside className="app-sidebar no-print">
        <h1>삼한로지스</h1>
        <nav>
          <NavLink to="/" end>
            대시보드
          </NavLink>
          <NavLink to="/warehouses">창고</NavLink>
          <NavLink to="/sales">판매조회</NavLink>
          <NavLink to="/purchases">구매조회</NavLink>
          <NavLink to="/transfers">재고이동</NavLink>
          <NavLink to="/sales/link-dispatch">링크발송</NavLink>

          {/* [Phase 6 v2] [판매] 그룹 4 sub-route — 영업/판매 영역. */}
          <div
            className="app-sidebar-group"
            aria-hidden="true"
            style={{
              marginTop: 16,
              padding: '4px 8px',
              fontSize: 11,
              fontWeight: 600,
              color: '#9CA3AF',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            판매
          </div>
          <NavLink to="/sales/estimates">견적서</NavLink>
          <NavLink to="/sales/partner-orders">주문서 조회</NavLink>
          <NavLink to="/sales/order-approvals">주문서 승인</NavLink>
          <NavLink to="/sales/partner-dc-config">거래처 DC 설정</NavLink>

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
                  color: '#9CA3AF',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                회계
              </div>
              <NavLink to="/accounting/accounts">계정과목</NavLink>
              <NavLink to="/accounting/journals">분개장</NavLink>
              <NavLink to="/accounting/balances">시산표</NavLink>
            </>
          ) : null}
        </nav>
        <div style={{ marginTop: 'auto', fontSize: 12, color: '#6B7280' }}>
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
            <span className="app-user-chip">
              {auth?.fullName ?? '사용자'} · {auth?.role ?? '-'}
            </span>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              로그아웃
            </Button>
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  )
}
