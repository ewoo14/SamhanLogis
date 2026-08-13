import { describe, expect, it, vi } from 'vitest'
import { createRealtimeClient } from './createRealtimeClient'
import './EstimateCollabRealtimeClient'

vi.mock('./createRealtimeClient', () => ({
  createRealtimeClient: vi.fn(() => ({
    subscribe: vi.fn(),
  })),
}))

describe('EstimateCollabRealtimeClient', () => {
  it('SSE stream은 gateway 표준 /api/v1/slips/estimates 경로를 사용한다', () => {
    const config = vi.mocked(createRealtimeClient).mock.calls[0]?.[0]

    expect(config).toMatchObject({ name: 'estimate-collab' })
    expect(config?.endpointPath('estimate/1')).toBe(
      '/api/v1/slips/estimates/estimate-1/collab/stream',
    )
  })
})
