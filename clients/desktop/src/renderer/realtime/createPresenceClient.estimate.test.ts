import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '../api/client'
import { collabHeaders } from '../auth/collabHeaders'
import { createRealtimeClient } from './createRealtimeClient'
import { EstimatePresenceClient } from './createPresenceClient'

vi.mock('../api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

vi.mock('../auth/collabHeaders', () => ({
  collabHeaders: vi.fn(),
}))

vi.mock('./createRealtimeClient', () => ({
  createRealtimeClient: vi.fn(() => ({
    subscribe: vi.fn(),
  })),
}))

const envelope = <T,>(data: T) => ({
  data: {
    success: true,
    code: 'OK',
    message: 'OK',
    data,
    timestamp: '2026-07-05T00:00:00+09:00',
  },
})

describe('EstimatePresenceClient', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset()
    vi.mocked(apiClient.post).mockReset()
    vi.mocked(collabHeaders).mockReset()
    vi.mocked(collabHeaders).mockResolvedValue({ 'X-User-Id': 'actor-1' })
  })

  it('presence 조회는 gateway 표준 /api/v1/slips/estimates 경로를 사용한다', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(envelope([]))

    await expect(EstimatePresenceClient.list('estimate/1')).resolves.toEqual([])

    expect(apiClient.get).toHaveBeenCalledWith(
      '/api/v1/slips/estimates/estimate-1/collab/presence',
      { headers: { 'X-User-Id': 'actor-1' } },
    )
  })

  it('presence join과 stream은 gateway 표준 /api/v1/slips/estimates 경로를 사용한다', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(envelope({
      sessionId: 'session-1',
      displayName: '담당자',
      color: 'BLUE',
    }))

    await expect(EstimatePresenceClient.join('estimate/1', {
      sessionId: 'session-1',
      displayName: '담당자',
    })).resolves.toMatchObject({ sessionId: 'session-1' })

    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/v1/slips/estimates/estimate-1/collab/presence/join',
      { sessionId: 'session-1', displayName: '담당자' },
      { headers: { 'X-User-Id': 'actor-1' }, signal: undefined },
    )

    const estimatePresenceConfig = vi.mocked(createRealtimeClient).mock.calls.find(
      ([config]) => config.name === 'estimate-presence',
    )?.[0]
    expect(estimatePresenceConfig?.endpointPath('estimate/1')).toBe(
      '/api/v1/slips/estimates/estimate-1/collab/stream',
    )
  })
})
