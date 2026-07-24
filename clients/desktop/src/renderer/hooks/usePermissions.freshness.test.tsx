// @vitest-environment jsdom
import React, { type ReactNode } from 'react'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePermissions } from './usePermissions'

const mocks = vi.hoisted(() => ({
  fetchMyPermissions: vi.fn(),
  setPermissionsCache: vi.fn(),
}))

vi.mock('../api/permissionsApi', () => ({
  fetchMyPermissions: mocks.fetchMyPermissions,
  normalizePermissionAction: (action: string) => action === 'edit' ? 'update' : action,
  setPermissionsCache: mocks.setPermissionsCache,
}))

afterEach(() => {
  cleanup()
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  })
  vi.restoreAllMocks()
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('usePermissions freshness', () => {
  it('30초 후 일반 창 포커스 복귀 시 권한을 다시 조회한다', async () => {
    const originalNow = Date.now()
    const now = vi.spyOn(Date, 'now').mockReturnValue(originalNow)
    mocks.fetchMyPermissions.mockResolvedValue([
      { pageCode: 'sales.slip.create', actions: ['create'] },
    ])
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    queryClient.setQueryData(['warehouses'], [{ code: 'WH-1' }])
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    renderHook(() => usePermissions(), { wrapper })
    await waitFor(() => expect(mocks.fetchMyPermissions).toHaveBeenCalledTimes(1))

    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(mocks.fetchMyPermissions).toHaveBeenCalledTimes(1)

    now.mockReturnValue(originalNow + 30_001)
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    await waitFor(() => expect(mocks.fetchMyPermissions).toHaveBeenCalledTimes(2))
    expect(queryClient.getQueryData(['warehouses'])).toEqual([{ code: 'WH-1' }])
  })

  it('30초 후 visibility 복귀 시 권한을 다시 조회한다', async () => {
    const originalNow = Date.now()
    const now = vi.spyOn(Date, 'now').mockReturnValue(originalNow)
    mocks.fetchMyPermissions.mockResolvedValue([
      { pageCode: 'sales.slip.create', actions: ['create'] },
    ])
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    renderHook(() => usePermissions(), { wrapper })
    await waitFor(() => expect(mocks.fetchMyPermissions).toHaveBeenCalledTimes(1))

    now.mockReturnValue(originalNow + 30_001)
    act(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'hidden',
      })
      window.dispatchEvent(new Event('visibilitychange'))
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'visible',
      })
      window.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => expect(mocks.fetchMyPermissions).toHaveBeenCalledTimes(2))
  })

  it('여러 usePermissions 마운트에서도 한 번의 포커스 복귀는 권한을 한 번만 조회한다', async () => {
    const originalNow = Date.now()
    const now = vi.spyOn(Date, 'now').mockReturnValue(originalNow)
    mocks.fetchMyPermissions.mockResolvedValue([
      { pageCode: 'sales.slip.create', actions: ['create'] },
    ])
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const mountedHooks = Array.from({ length: 12 }, () =>
      renderHook(() => usePermissions(), { wrapper }),
    )
    await waitFor(() => expect(mocks.fetchMyPermissions).toHaveBeenCalledTimes(1))

    now.mockReturnValue(originalNow + 30_001)
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    await waitFor(() => expect(mocks.fetchMyPermissions).toHaveBeenCalledTimes(2))
    expect(mocks.fetchMyPermissions).toHaveBeenCalledTimes(2)

    mountedHooks.forEach(({ unmount }) => unmount())
  })
})
