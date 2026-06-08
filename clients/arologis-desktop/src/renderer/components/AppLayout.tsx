/**
 * AppLayout — 상단 네비게이션 + Outlet.
 *
 * Samhan Public desktop 의 AppLayout 패턴을 단순화. 디자인 토큰 적용은
 * Designer (D1~D5) 작업 결과로 후속 PR 에서 확장.
 */
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { canManageHr, useAuthStore } from '../stores/authStore'

const navStyle: React.CSSProperties = {
  display: 'flex',
  gap: 16,
  padding: '12px 24px',
  borderBottom: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  alignItems: 'center',
}

const linkStyle: React.CSSProperties = {
  textDecoration: 'none',
  color: 'var(--color-text-muted)',
  padding: '6px 10px',
  borderRadius: 4,
}

const activeLinkStyle: React.CSSProperties = {
  ...linkStyle,
  color: 'var(--color-primary)',
  fontWeight: 600,
}

export function AppLayout(): JSX.Element {
  const auth = useAuthStore((s) => s.auth)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const canManageHrMenu = canManageHr(auth?.role)

  const handleLogout = async (): Promise<void> => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <nav style={navStyle} aria-label="주 메뉴">
        <strong style={{ fontSize: 'var(--font-size-lg)' }}>아로로지스</strong>
        <NavLink
          to="/dispatches"
          style={({ isActive }) => (isActive ? activeLinkStyle : linkStyle)}
        >
          배차
        </NavLink>
        <NavLink
          to="/drivers"
          style={({ isActive }) => (isActive ? activeLinkStyle : linkStyle)}
        >
          기사 관리
        </NavLink>
        {canManageHrMenu ? (
          <>
            <NavLink
              to="/admin/employees"
              style={({ isActive }) => (isActive ? activeLinkStyle : linkStyle)}
            >
              인사
            </NavLink>
            <NavLink
              to="/admin/departments"
              style={({ isActive }) => (isActive ? activeLinkStyle : linkStyle)}
            >
              부서
            </NavLink>
            <NavLink
              to="/admin/cashbook"
              style={({ isActive }) => (isActive ? activeLinkStyle : linkStyle)}
            >
              회계
            </NavLink>
          </>
        ) : null}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
          {auth && (
            <span style={{ color: 'var(--color-text-muted)' }}>
              {auth.fullName} ({auth.loginId})
            </span>
          )}
          <button
            type="button"
            onClick={handleLogout}
            style={{
              padding: '6px 12px',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              borderRadius: 4,
            }}
          >
            로그아웃
          </button>
        </div>
      </nav>
      <main style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        <Outlet />
      </main>
    </div>
  )
}
