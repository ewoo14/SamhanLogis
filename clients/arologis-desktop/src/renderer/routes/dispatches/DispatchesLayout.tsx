import { NavLink, Outlet } from 'react-router-dom'
import { usePermissions } from '../../hooks/usePermissions'
import { PermissionQueryError } from '../../components/PermissionQueryError'

const links = [
  { to: '/dispatches/manual', label: '수동 배차' },
  { to: '/dispatches/pre-classify', label: '가배차 분류' },
  { to: '/dispatches/unassigned', label: '미배차' },
  { to: '/dispatches/reconcile', label: '실배차 비교' },
]

export function DispatchesLayout(): JSX.Element {
  const { canAccess, isLoading, isError, refetch } = usePermissions()
  const canViewReceivedGroups =
    !isLoading && !isError && canAccess('arologis.dispatch.ops', 'view')

  return (
    <section>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 'var(--font-size-xl)', margin: 0 }}>배차</h1>
        <nav
          style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}
          aria-label="배차 메뉴"
        >
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              style={({ isActive }) => ({
                padding: '6px 10px',
                borderRadius: 4,
                textDecoration: 'none',
                border: '1px solid var(--color-border)',
                color: isActive
                  ? 'var(--color-primary)'
                  : 'var(--color-text-muted)',
                background: isActive ? 'var(--color-surface)' : 'transparent',
                fontWeight: isActive ? 600 : 400,
              })}
            >
              {link.label}
            </NavLink>
          ))}
          {canViewReceivedGroups ? (
            <NavLink
              to="/dispatches/received-groups"
              style={({ isActive }) => ({
                padding: '6px 10px',
                borderRadius: 4,
                textDecoration: 'none',
                border: '1px solid var(--color-border)',
                color: isActive
                  ? 'var(--color-primary)'
                  : 'var(--color-text-muted)',
                background: isActive ? 'var(--color-surface)' : 'transparent',
                fontWeight: isActive ? 600 : 400,
              })}
            >
              수신 배차 그룹
            </NavLink>
          ) : null}
        </nav>
        {isError ? <PermissionQueryError onRetry={() => { void refetch() }} /> : null}
      </header>
      <Outlet />
    </section>
  )
}
