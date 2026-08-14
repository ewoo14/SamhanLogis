import { NavLink, Outlet } from 'react-router-dom'
import { usePermissions } from '../../hooks/usePermissions'
import { useMenuCatalog } from '../../hooks/useMenuCatalog'
import { PermissionQueryError } from '../../components/PermissionQueryError'

export function DispatchesLayout(): JSX.Element {
  const { canAccess, isLoading, isError, refetch } = usePermissions()
  const menuCatalog = useMenuCatalog()
  const links = (menuCatalog.menus ?? [])
    .filter((entry) => entry.category === '배차' && entry.route !== '/dispatches/received-groups')
    .sort((left, right) => left.order - right.order)
  const receivedGroupsMenu = menuCatalog.menus?.find(
    (entry) => entry.route === '/dispatches/received-groups',
  )
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
              key={link.route}
              to={link.route}
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
          {canViewReceivedGroups && receivedGroupsMenu ? (
            <NavLink
              key={receivedGroupsMenu.route}
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
              {receivedGroupsMenu.label}
            </NavLink>
          ) : null}
        </nav>
        {isError || menuCatalog.isError ? (
          <PermissionQueryError onRetry={() => { void refetch(); void menuCatalog.refetch() }} />
        ) : null}
      </header>
      <Outlet />
    </section>
  )
}
