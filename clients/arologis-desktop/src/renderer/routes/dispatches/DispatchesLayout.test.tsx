import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { DispatchesLayout } from './DispatchesLayout'
import { usePermissions } from '../../hooks/usePermissions'
import { useMenuCatalog } from '../../hooks/useMenuCatalog'

vi.mock('../../hooks/usePermissions', () => ({
  usePermissions: vi.fn(),
}))
vi.mock('../../hooks/useMenuCatalog', () => ({
  useMenuCatalog: vi.fn(),
}))

const mockedUsePermissions = vi.mocked(usePermissions)
const mockedUseMenuCatalog = vi.mocked(useMenuCatalog)

describe('DispatchesLayout', () => {
  afterEach(() => {
    cleanup()
    vi.resetAllMocks()
  })

  it('권한 있는 사용자는 수신 배차 그룹과 기존 네 메뉴를 클릭해 각 경로로 이동한다', async () => {
    mockedUsePermissions.mockReturnValue({
      canAccess: (pageCode, action = 'view') =>
        pageCode === 'arologis.dispatch.ops' && action === 'view',
      permissions: [{ pageCode: 'arologis.dispatch.ops', actions: ['view'] }],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    mockedUseMenuCatalog.mockReturnValue({ menus: catalogMenus(), isLoading: false, isError: false, refetch: vi.fn() })

    const user = userEvent.setup()
    renderDispatchesLayout()

    const expectedLinks = [
      ['수동 배차', '/dispatches/manual'],
      ['가배차 분류', '/dispatches/pre-classify'],
      ['미배차', '/dispatches/unassigned'],
      ['실배차 비교', '/dispatches/reconcile'],
      ['수신 배차 그룹', '/dispatches/received-groups'],
    ] as const

    for (const [label, path] of expectedLinks) {
      const link = screen.getByRole('link', { name: label })
      expect(link.getAttribute('href')).toBe(path)
      await user.click(link)
      expect(screen.getByTestId('location').textContent).toBe(path)
    }
  })

  it('카탈로그에 없는 사용자는 수신 배차 그룹 진입점을 보지 못한다', () => {
    mockedUsePermissions.mockReturnValue({
      canAccess: () => false,
      permissions: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    mockedUseMenuCatalog.mockReturnValue({ menus: [], isLoading: false, isError: false, refetch: vi.fn() })

    renderDispatchesLayout()

    expect(screen.queryByRole('link', { name: '수신 배차 그룹' })).toBeNull()
  })

  it('권한 조회 실패는 수신 배차 그룹을 숨기되 원인 안내와 재시도를 표시한다', async () => {
    const refetch = vi.fn()
    mockedUsePermissions.mockReturnValue({
      canAccess: () => false,
      permissions: undefined,
      isLoading: false,
      isError: true,
      refetch,
    })
    mockedUseMenuCatalog.mockReturnValue({ menus: [], isLoading: false, isError: false, refetch: vi.fn() })

    const user = userEvent.setup()
    renderDispatchesLayout()

    expect(screen.queryByRole('link', { name: '수신 배차 그룹' })).toBeNull()
    expect(screen.getByRole('alert').textContent).toContain('권한을 확인하지 못했습니다')

    await user.click(screen.getByRole('button', { name: '권한 다시 확인' }))
    expect(refetch).toHaveBeenCalledOnce()
  })
})

function renderDispatchesLayout(): void {
  render(
    <MemoryRouter initialEntries={['/dispatches/manual']}>
      <Routes>
        <Route path="/dispatches" element={<DispatchesLayout />}>
          <Route path="*" element={<><Outlet /><LocationProbe /></>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

function catalogMenus() {
  return [
    { app: 'arologis' as const, category: '배차', label: '수동 배차', route: '/dispatches/manual', pageCode: 'arologis.dispatch.admin', action: 'VIEW' as const, visible: true, order: 1 },
    { app: 'arologis' as const, category: '배차', label: '가배차 분류', route: '/dispatches/pre-classify', pageCode: 'arologis.dispatch.ops', action: 'VIEW' as const, visible: true, order: 2 },
    { app: 'arologis' as const, category: '배차', label: '미배차', route: '/dispatches/unassigned', pageCode: 'arologis.dispatch.ops', action: 'VIEW' as const, visible: true, order: 3 },
    { app: 'arologis' as const, category: '배차', label: '실배차 비교', route: '/dispatches/reconcile', pageCode: 'arologis.dispatch.ops', action: 'VIEW' as const, visible: true, order: 4 },
    { app: 'arologis' as const, category: '배차', label: '수신 배차 그룹', route: '/dispatches/received-groups', pageCode: 'arologis.dispatch.ops', action: 'VIEW' as const, visible: true, order: 5 },
  ]
}

function LocationProbe(): JSX.Element {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}</output>
}
