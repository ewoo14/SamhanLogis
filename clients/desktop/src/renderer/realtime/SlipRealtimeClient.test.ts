import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SlipRealtimeClient } from './SlipRealtimeClient'
import { isMockMode } from '../api/mock'

vi.mock('../api/mock', () => ({
  isMockMode: vi.fn(),
}))

vi.mock('../api/client', () => ({
  apiClient: { defaults: { baseURL: 'http://127.0.0.1:1' } },
}))

vi.mock('../auth/authProvider', () => ({
  getAuthProvider: vi.fn(() => ({ getAuthHeaders: vi.fn() })),
  isElectronPlatform: false,
}))

describe('SlipRealtimeClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('mock 모드에서는 전표 SSE fetch를 시작하지 않는다', async () => {
    vi.mocked(isMockMode).mockReturnValue(true)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const controller = SlipRealtimeClient.subscribe('slip-1', () => undefined)

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(controller).toBeInstanceOf(AbortController)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('비mock 모드에서는 기존대로 전표 SSE fetch를 시작한다', async () => {
    vi.mocked(isMockMode).mockReturnValue(false)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 503, body: null } as Response)

    const controller = SlipRealtimeClient.subscribe('slip-1', () => undefined)
    await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1))
    controller.abort()
  })
})
