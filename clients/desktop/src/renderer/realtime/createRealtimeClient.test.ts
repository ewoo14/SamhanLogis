import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRealtimeClient } from './createRealtimeClient'
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

describe('createRealtimeClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('mock 모드에서는 handler 없이 fetch를 시작하지 않고 명시적으로 실패한다', async () => {
    vi.mocked(isMockMode).mockReturnValue(true)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const client = createRealtimeClient({
      name: 'test',
      endpointPath: (id) => `/items/${id}/stream`,
    })

    expect(() => client.subscribe('item-1', () => undefined)).toThrow(
      'Mock handler not found: GET /items/item-1/stream',
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('비mock 모드에서는 기존대로 SSE fetch를 시작한다', async () => {
    vi.mocked(isMockMode).mockReturnValue(false)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 503, body: null } as Response)
    const client = createRealtimeClient({
      name: 'test',
      endpointPath: (id) => `/items/${id}/stream`,
    })

    const controller = client.subscribe('item-1', () => undefined)
    await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1))
    controller.abort()
  })

  it('allowMockMode가 있으면 mock origin의 SSE handler로 fetch를 시작한다', async () => {
    vi.mocked(isMockMode).mockReturnValue(true)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 503, body: null } as Response)
    const client = createRealtimeClient({
      name: 'coedit-test',
      endpointPath: (id) => `/items/${id}/collab/stream`,
      allowMockMode: true,
    })

    client.subscribe('item-1', () => undefined)
    await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(
      '/items/item-1/collab/stream',
      expect.objectContaining({ method: 'GET' }),
    ))
  })
})
