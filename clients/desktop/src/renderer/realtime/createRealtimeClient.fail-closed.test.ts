import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRealtimeClient } from './createRealtimeClient'
import { isMockMode } from '../api/mock'

vi.mock('../api/mock', () => ({
  isMockMode: vi.fn(),
}))

vi.mock('../api/client', () => ({
  apiClient: { defaults: { baseURL: 'http://127.0.0.1:1' } },
}))

vi.mock('../auth/authProvider', () => ({
  getAuthProvider: vi.fn(() => ({ getAuthHeaders: vi.fn().mockResolvedValue({}) })),
  isElectronPlatform: false,
}))

describe('mock realtime fail-closed network boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('mock 모드의 co-edit SSE는 gateway가 아닌 mock origin handler로만 연결한다', async () => {
    vi.mocked(isMockMode).mockReturnValue(true)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
      body: null,
      headers: new Headers(),
    } as Response)
    const client = createRealtimeClient({
      name: 'coedit-test',
      endpointPath: (id) => `/items/${id}/collab/stream`,
      allowMockMode: true,
    })

    client.subscribe('item-1', () => undefined)
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledWith(
      '/items/item-1/collab/stream',
      expect.objectContaining({ method: 'GET' }),
    ))
  })
})
