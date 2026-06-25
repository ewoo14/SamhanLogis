import axios from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const authProvider = {
  getAuthHeaders: vi.fn<() => Promise<Record<string, string>>>(),
  clearSession: vi.fn<() => Promise<void>>(),
}

vi.mock('../../auth/authProvider', () => ({
  getAuthProvider: () => authProvider,
  isElectronPlatform: false,
}))

describe('apiClient authProvider 배선', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    authProvider.getAuthHeaders.mockResolvedValue({ Authorization: 'Bearer T' })
    authProvider.clearSession.mockResolvedValue()
    vi.stubGlobal('window', { location: { hash: '', replace: vi.fn() } })
  })

  it('요청마다 withCredentials=true 와 authProvider 헤더를 병합한다', async () => {
    const { apiClient } = await import('../client')

    await apiClient.get('/auth-test', {
      adapter: async (config) => {
        expect(config.withCredentials).toBe(true)
        expect(config.headers.get('Authorization')).toBe('Bearer T')
        return {
          data: { ok: true },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          request: {},
        }
      },
    })

    expect(authProvider.getAuthHeaders).toHaveBeenCalledTimes(1)
  })

  it('웹 보호 리소스 401 응답은 authProvider 세션을 비우고 /login 으로 이동한다', async () => {
    const { apiClient } = await import('../client')

    await expect(apiClient.get('/api/v1/slips', {
      adapter: async (config) => {
        const response = {
          data: { success: false },
          status: 401,
          statusText: 'Unauthorized',
          headers: {},
          config,
          request: {},
        }
        throw new axios.AxiosError('Unauthorized', undefined, config, {}, response)
      },
    })).rejects.toBeInstanceOf(axios.AxiosError)

    expect(authProvider.clearSession).toHaveBeenCalledTimes(1)
    expect(window.location.replace).toHaveBeenCalledWith('/login')
    expect(window.location.hash).toBe('')
  })

  it('/auth/me 401 응답은 호출자가 처리하도록 세션 클리어와 리다이렉트를 건너뛴다', async () => {
    const { apiClient } = await import('../client')

    await expect(apiClient.get('/auth/me', {
      adapter: async (config) => {
        const response = {
          data: { success: false },
          status: 401,
          statusText: 'Unauthorized',
          headers: {},
          config,
          request: {},
        }
        throw new axios.AxiosError('Unauthorized', undefined, config, {}, response)
      },
    })).rejects.toBeInstanceOf(axios.AxiosError)

    expect(authProvider.clearSession).not.toHaveBeenCalled()
    expect(window.location.replace).not.toHaveBeenCalled()
    expect(window.location.hash).toBe('')
  })
})
