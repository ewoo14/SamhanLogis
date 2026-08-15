// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppLayout } from '../AppLayout'

const mocks = vi.hoisted(() => ({
  logout: vi.fn(async () => undefined),
  removeQueries: vi.fn(),
  menuCatalog: [] as Array<{ app: 'samhan-public' | 'arologis'; category: string; label: string; route: string; pageCode: string; action: 'VIEW'; visible: boolean; order: number }>,
  menuLoading: false,
  menuError: false,
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ removeQueries: mocks.removeQueries }),
}))

vi.mock('../../stores/session', () => ({
  canQuerySales: () => true,
  canQueryPurchases: () => true,
  useSessionStore: (selector: (state: { auth: { fullName: string; role: string }; logout: () => Promise<void> }) => unknown) =>
    selector({
      auth: { fullName: '개발영업', role: 'SALES' },
      logout: mocks.logout,
    }),
}))

vi.mock('../../stores/pageTitle', () => ({
  usePageTitleStore: (selector: (state: { title: string; meta: string | null }) => unknown) =>
    selector({ title: '홈', meta: null }),
}))

vi.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => ({
    canAccess: () => true,
    isLoading: false,
    isError: false,
  }),
}))

vi.mock('../../hooks/useMenuCatalog', () => ({
  useMenuCatalog: () => ({
    menus: mocks.menuCatalog,
    isLoading: mocks.menuLoading,
    isError: mocks.menuError,
    refetch: vi.fn(),
  }),
}))

vi.mock('../NotificationBellDropdown', () => ({
  NotificationBellDropdown: () => <button type="button">알림</button>,
}))

beforeEach(() => {
  mocks.menuCatalog = []
  mocks.menuLoading = false
  mocks.menuError = false
})

afterEach(() => cleanup())

describe('AppLayout server menu catalog contract', () => {
  test('SALES의 빈 catalog는 본체 메뉴를 렌더하지 않고 안내를 보여준다', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<div>홈 화면</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.queryByTestId('sidebar-category-toggle-판매')).toBeNull()
    expect(screen.queryByTestId('sidebar-category-toggle-그룹웨어')).toBeNull()
    expect(screen.queryByRole('link', { name: '판매관리' })).toBeNull()
    expect(screen.queryByText('권한이 있는 메뉴가 없습니다.')).not.toBeNull()
  })

  test('MANAGER의 본체 catalog 메뉴는 모두 렌더한다', () => {
    mocks.menuCatalog = Array.from({ length: 11 }, (_, index) => ({
      app: 'samhan-public' as const,
      category: '배차',
      label: `배차 메뉴 ${index + 1}`,
      route: `/dispatch/${index + 1}`,
      pageCode: `dispatch.${index + 1}`,
      action: 'VIEW' as const,
      visible: true,
      order: index + 1,
    }))

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<div>홈 화면</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByTestId('sidebar-category-toggle-배차'))
    expect(screen.getAllByRole('link', { name: /^배차 메뉴/ })).toHaveLength(11)
  })

  test('catalog 로딩 중에는 권한 메뉴를 렌더하지 않는다', () => {
    mocks.menuLoading = true
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<div>홈 화면</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByTestId('sidebar-menu-catalog-loading')).not.toBeNull()
    expect(screen.queryByTestId('sidebar-category-toggle-판매')).toBeNull()
    expect(screen.queryByTestId('sidebar-category-toggle-배차')).toBeNull()
  })

  test('catalog 실패 시 fail-open 메뉴 대신 실패 안내를 보여준다', () => {
    mocks.menuError = true
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<div>홈 화면</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByTestId('sidebar-menu-catalog-error')).not.toBeNull()
    expect(screen.queryByTestId('sidebar-category-toggle-판매')).toBeNull()
  })
})
