// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePermissions } from './usePermissions'

const mocks = vi.hoisted(() => ({
  fetchMyPermissions: vi.fn(),
}))

vi.mock('../api/permissions', () => ({
  fetchMyPermissions: mocks.fetchMyPermissions,
}))

afterEach(() => {
  cleanup()
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  vi.restoreAllMocks()
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('usePermissions window-focus freshness', () => {
  it('창 포커스 복귀 시 권한 쿼리는 재조회한다', async () => {
    mocks.fetchMyPermissions.mockResolvedValue([
      { pageCode: 'arologis.dispatch.ops', actions: ['view'] },
    ])
    const queryClient = new QueryClient({
      defaultOptions: { queries: { refetchOnWindowFocus: false, retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    renderHook(() => usePermissions(), { wrapper })
    await waitFor(() => expect(mocks.fetchMyPermissions).toHaveBeenCalledTimes(1))
    await queryClient.invalidateQueries({ queryKey: ['permissions', 'my'] })

    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    await waitFor(() => expect(mocks.fetchMyPermissions).toHaveBeenCalledTimes(2))
  })

  it('창 포커스 복귀 시 권한 외 쿼리는 재조회하지 않는다', async () => {
    mocks.fetchMyPermissions.mockResolvedValue([])
    const otherQuery = vi.fn().mockResolvedValue({ unassignedCount: 2, totalOutbound: 5 })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { refetchOnWindowFocus: false, retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    renderHook(() => {
      usePermissions()
      useQuery({ queryKey: ['arologis-unassigned', '2026-08-07'], queryFn: otherQuery })
    }, { wrapper })
    await waitFor(() => {
      expect(mocks.fetchMyPermissions).toHaveBeenCalledTimes(1)
      expect(otherQuery).toHaveBeenCalledTimes(1)
    })
    await queryClient.invalidateQueries({ queryKey: ['permissions', 'my'] })

    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    await waitFor(() => expect(mocks.fetchMyPermissions).toHaveBeenCalledTimes(2))
    expect(otherQuery).toHaveBeenCalledTimes(1)
  })
})
