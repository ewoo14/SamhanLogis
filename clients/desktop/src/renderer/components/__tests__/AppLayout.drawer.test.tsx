// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { AppLayout } from '../AppLayout'

const mocks = vi.hoisted(() => ({
  logout: vi.fn(async () => undefined),
  removeQueries: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ removeQueries: mocks.removeQueries }),
}))

vi.mock('../../stores/session', () => ({
  canQuerySales: () => true,
  canQueryPurchases: () => true,
  useSessionStore: (selector: (state: { auth: { fullName: string; role: string }; logout: () => Promise<void> }) => unknown) =>
    selector({
      auth: { fullName: '오병승', role: 'MASTER' },
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
  }),
}))

vi.mock('../../hooks/useMenuCatalog', () => ({
  useMenuCatalog: () => ({
    menus: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}))

vi.mock('../NotificationBellDropdown', () => ({
  NotificationBellDropdown: () => <button type="button">알림</button>,
}))

function RouteChangeButton() {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate('/sales')}>
      판매로 이동
    </button>
  )
}

function renderApp(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<RouteChangeButton />} />
          <Route path="sales" element={<div>판매 화면</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

function getDrawer(): HTMLElement {
  const drawer = document.getElementById('app-drawer')
  if (!drawer) throw new Error('app-drawer not found')
  return drawer
}

afterEach(() => {
  cleanup()
  document.body.style.overflow = ''
})

describe('AppLayout mobile drawer', () => {
  test('햄버거 클릭 전후 Drawer 와 백드롭 is-open 상태가 전환된다', () => {
    renderApp()

    const toggle = screen.getByTestId('app-drawer-toggle')
    const backdrop = screen.getByTestId('app-drawer-backdrop')
    const drawer = getDrawer()

    expect(toggle).toBeTruthy()
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(drawer.classList.contains('is-open')).toBe(false)
    expect(backdrop.classList.contains('is-open')).toBe(false)

    fireEvent.click(toggle)

    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(drawer.classList.contains('is-open')).toBe(true)
    expect(backdrop.classList.contains('is-open')).toBe(true)
    expect(document.body.style.overflow).toBe('hidden')
  })

  test('Drawer dialog has an accessible name while open', () => {
    renderApp()

    fireEvent.click(screen.getByTestId('app-drawer-toggle'))

    const drawer = getDrawer()
    const title = document.getElementById('app-drawer-title')

    expect(drawer.getAttribute('aria-labelledby')).toBe('app-drawer-title')
    expect(title?.textContent).toBe('Samhan Public')
  })

  test('라우트 변경 시 Drawer 가 자동으로 닫힌다', async () => {
    renderApp()

    fireEvent.click(screen.getByTestId('app-drawer-toggle'))
    expect(getDrawer().classList.contains('is-open')).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: '판매로 이동' }))

    await waitFor(() => {
      expect(getDrawer().classList.contains('is-open')).toBe(false)
    })
  })

  test('현재 페이지 링크를 클릭해도 Drawer 가 닫힌다', () => {
    renderApp('/')

    fireEvent.click(screen.getByTestId('app-drawer-toggle'))
    expect(getDrawer().classList.contains('is-open')).toBe(true)

    fireEvent.click(screen.getByRole('link', { name: '홈' }))

    expect(getDrawer().classList.contains('is-open')).toBe(false)
  })

  test('Escape 와 백드롭 클릭으로 Drawer 가 닫힌다', () => {
    renderApp()

    const toggle = screen.getByTestId('app-drawer-toggle')
    const backdrop = screen.getByTestId('app-drawer-backdrop')

    fireEvent.click(toggle)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(getDrawer().classList.contains('is-open')).toBe(false)

    fireEvent.click(toggle)
    fireEvent.click(backdrop)
    expect(getDrawer().classList.contains('is-open')).toBe(false)
  })

  test('로그아웃 후 권한 캐시를 제거한다', async () => {
    renderApp()

    fireEvent.click(screen.getByTestId('header-user-name'))
    fireEvent.click(screen.getByRole('menuitem', { name: '로그아웃' }))

    await waitFor(() => {
      expect(mocks.removeQueries).toHaveBeenCalledWith({ queryKey: ['permissions', 'my'] })
    })
  })
})
