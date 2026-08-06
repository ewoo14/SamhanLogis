import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppLayout } from './AppLayout'
import { usePermissions } from '../hooks/usePermissions'
import { useAuthStore } from '../stores/authStore'

vi.mock('../hooks/usePermissions', () => ({
  usePermissions: vi.fn(),
}))

const mockedUsePermissions = vi.mocked(usePermissions)

describe('AppLayout', () => {
  afterEach(() => {
    cleanup()
    vi.resetAllMocks()
    useAuthStore.setState({ auth: null, bootstrapped: true })
  })

  it('canAccess 없는 admin 메뉴는 네비게이션에서 숨긴다', () => {
    useAuthStore.setState({
      auth: authSnapshot('AROLOGIS_MASTER'),
      bootstrapped: true,
    })
    mockedUsePermissions.mockReturnValue({
      canAccess: (pageCode) => pageCode === 'arologis.accounting.cashbook',
      permissions: [{ pageCode: 'arologis.accounting.cashbook', actions: ['view'] }],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })

    renderLayout()

    expect(screen.queryByRole('link', { name: '회계' })).not.toBeNull()
    expect(screen.queryByRole('link', { name: '인사' })).toBeNull()
    expect(screen.queryByRole('link', { name: '부서' })).toBeNull()
    expect(screen.queryByRole('link', { name: '계정과목' })).toBeNull()
    expect(screen.queryByRole('link', { name: '권한' })).toBeNull()
  })

  it('권한 메뉴는 page-code 권한과 MASTER role 을 모두 만족할 때만 보인다', () => {
    useAuthStore.setState({
      auth: authSnapshot('AROLOGIS_MANAGER'),
      bootstrapped: true,
    })
    mockedUsePermissions.mockReturnValue({
      canAccess: (pageCode) => pageCode === 'arologis.admin.permissions',
      permissions: [{ pageCode: 'arologis.admin.permissions', actions: ['view'] }],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })

    renderLayout()

    expect(screen.queryByRole('link', { name: '권한' })).toBeNull()

    cleanup()
    useAuthStore.setState({
      auth: authSnapshot('AROLOGIS_MASTER'),
      bootstrapped: true,
    })

    renderLayout()

    expect(screen.queryByRole('link', { name: '권한' })).not.toBeNull()
  })
})

function renderLayout(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AppLayout />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function authSnapshot(role: string) {
  return {
    accessToken: 'access',
    refreshToken: 'refresh',
    userId: 'user-1',
    role,
    loginId: 'tester',
    fullName: '테스터',
    expiresAt: '2026-06-23T00:00:00Z',
  }
}
