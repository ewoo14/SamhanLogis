import { beforeEach, describe, expect, it, vi } from 'vitest'

const authProvider = {
  getAuthHeaders: vi.fn<() => Promise<Record<string, string>>>(),
}

vi.mock('../../auth/authProvider', () => ({
  getAuthProvider: () => authProvider,
  isElectronPlatform: false,
  isCapacitorPlatform: false,
}))

describe('mock fail-closed network boundary', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubEnv('VITE_MOCK_MODE', '1')
    authProvider.getAuthHeaders.mockResolvedValue({})
  })

  it('mock handler가 없는 Axios 요청은 실제 adapter로 진행하지 않고 명시적으로 실패한다', async () => {
    const { apiClient } = await import('../client')
    const adapter = vi.fn()

    await expect(apiClient.get('/mock-unhandled-axios', { adapter })).rejects.toThrow(
      'Mock handler not found: GET /mock-unhandled-axios',
    )
    expect(adapter).not.toHaveBeenCalled()
  })
})
