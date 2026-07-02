// @vitest-environment jsdom
import { createElement, type PropsWithChildren } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isMockMode } from '../api/mock'
import type { RealtimeClient, RealtimeHandler } from './createRealtimeClient'
import { useCollectionRealtime } from './useCollectionRealtime'

vi.mock('../api/mock', () => ({
  isMockMode: vi.fn(),
}))

function renderCollectionRealtimeHook(client: RealtimeClient) {
  const queryClient = new QueryClient()
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

  function Wrapper({ children }: PropsWithChildren) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }

  function TestComponent() {
    useCollectionRealtime(client, 'board', ['dispatchTasks'])
    return null
  }

  const result = render(createElement(TestComponent), { wrapper: Wrapper })
  return { ...result, invalidateSpy }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('useCollectionRealtime', () => {
  it('mock 모드에서는 SSE 구독을 시작하지 않는다', () => {
    vi.mocked(isMockMode).mockReturnValue(true)
    const client: RealtimeClient = {
      subscribe: vi.fn(),
    }

    renderCollectionRealtimeHook(client)

    expect(client.subscribe).not.toHaveBeenCalled()
  })

  it('이벤트 수신 시 지정 queryKey 를 invalidate 하고 언마운트 시 abort 한다', async () => {
    vi.mocked(isMockMode).mockReturnValue(false)
    const ctrl = new AbortController()
    let handler: RealtimeHandler | null = null
    const client: RealtimeClient = {
      subscribe: vi.fn((entityId, onEvent) => {
        handler = onEvent
        return ctrl
      }),
    }

    const { invalidateSpy, unmount } = renderCollectionRealtimeHook(client)

    await waitFor(() => {
      expect(client.subscribe).toHaveBeenCalledWith('board', expect.any(Function))
    })

    handler?.({ event: 'dispatch:board:changed', data: { changeType: 'UPDATED' }, raw: '{}' })

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['dispatchTasks'] })
    })

    unmount()

    expect(ctrl.signal.aborted).toBe(true)
  })
})
