import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import { listSlipAllocationSources } from './slipAllocationSourceApi'

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}))

describe('slipAllocationSourceApi 실 모드 경로', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_MOCK_MODE', '0')
    vi.mocked(apiClient.get).mockReset()
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: {
        success: true,
        code: 'OK',
        message: '',
        data: [],
        timestamp: '2026-08-03T00:00:00Z',
      },
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('mock OFF에서는 게이트웨이에 노출된 사용자-facing 경로로 원천을 조회한다', async () => {
    await expect(listSlipAllocationSources({
      type: 'OUTBOUND',
      from: '2026-08-03',
      to: '2026-08-03',
    })).resolves.toEqual([])

    expect(apiClient.get).toHaveBeenCalledWith(
      '/slips/by-period?type=OUTBOUND&from=2026-08-03&to=2026-08-03',
    )
  })
})
