import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { DispatchesLayout } from './DispatchesLayout'
import { usePermissions } from '../../hooks/usePermissions'

vi.mock('../../hooks/usePermissions', () => ({
  usePermissions: vi.fn(),
}))

const mockedUsePermissions = vi.mocked(usePermissions)

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
    })

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

  it('권한 없는 사용자는 라우트와 같은 조건으로 수신 배차 그룹 진입점을 보지 못한다', () => {
    mockedUsePermissions.mockReturnValue({
      canAccess: () => false,
      permissions: [],
      isLoading: false,
      isError: false,
    })

    renderDispatchesLayout()

    expect(screen.queryByRole('link', { name: '수신 배차 그룹' })).toBeNull()
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

function LocationProbe(): JSX.Element {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}</output>
}
