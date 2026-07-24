import axios from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const authProvider = {
  getAuthHeaders: vi.fn<() => Promise<Record<string, string>>>(),
  clearSession: vi.fn<() => Promise<void>>(),
}

const platform = vi.hoisted(() => ({
  isElectron: false,
  isCapacitor: false,
}))

vi.mock('../../auth/authProvider', () => ({
  getAuthProvider: () => authProvider,
  get isElectronPlatform() {
    return platform.isElectron
  },
  get isCapacitorPlatform() {
    return platform.isCapacitor
  },
}))

describe('apiClient authProvider 배선', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    platform.isElectron = false
    platform.isCapacitor = false
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

  it('Capacitor 요청은 쿠키 없이 Bearer 헤더를 보내고 401 시 HashRouter 로그인으로 이동한다', async () => {
    platform.isCapacitor = true
    const { apiClient } = await import('../client')
    const { useSessionStore } = await import('../../stores/session')

    await apiClient.get('/auth-test', {
      adapter: async (config) => {
        expect(config.withCredentials).toBe(false)
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

    useSessionStore.setState({
      auth: {
        token: 'T',
        userId: 'user-1',
        role: 'MASTER',
        fullName: '개발책임자',
        groups: [],
      },
    })

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

    expect(authProvider.getAuthHeaders).toHaveBeenCalledTimes(2)
    expect(authProvider.clearSession).toHaveBeenCalledTimes(1)
    expect(useSessionStore.getState().auth).toBeNull()
    expect(window.location.hash).toBe('#/login')
    expect(window.location.replace).not.toHaveBeenCalled()
  })

  it('Electron 요청은 access_token 쿠키를 전송하지 않도록 withCredentials=false 로 보낸다', async () => {
    platform.isElectron = true
    const { apiClient } = await import('../client')

    await apiClient.get('/auth-test', {
      adapter: async (config) => {
        expect(config.withCredentials).toBe(false)
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

  it('/auth/password-reset/confirm 401 응답은 호출자가 처리하도록 세션 클리어와 리다이렉트를 건너뛴다', async () => {
    const { apiClient } = await import('../client')

    await expect(apiClient.post('/api/v1/auth/password-reset/confirm', {
      token: 'expired',
      password: 'new-password',
    }, {
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

  it('보호 리소스 401 응답은 authProvider 세션과 렌더러 auth 상태를 함께 비운다', async () => {
    const { apiClient } = await import('../client')
    const { useSessionStore } = await import('../../stores/session')

    useSessionStore.setState({
      auth: {
        token: 'T',
        userId: 'user-1',
        role: 'MASTER',
        fullName: '개발책임자',
        groups: [],
      },
    })

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
    expect(useSessionStore.getState().auth).toBeNull()
    expect(window.location.replace).toHaveBeenCalledWith('/login')
  })

  it('Electron 보호 리소스 401 후 권한 Query Cache를 비운다', async () => {
    platform.isElectron = true
    const { QueryClient } = await import('@tanstack/react-query')
    const { registerQueryClient } = await import('../../queryClientRegistry')
    const { apiClient } = await import('../client')
    const { canAccess, setPermissionsCache } = await import('../permissionsApi')
    const queryClient = new QueryClient()
    registerQueryClient(queryClient)
    queryClient.setQueryData(['permissions', 'my'], [{ pageCode: 'sales.slip.create', actions: ['create'] }])
    queryClient.setQueryData(['me', 'executive-office'], { isExecutiveOffice: true })
    setPermissionsCache([{ pageCode: 'sales.slip.create', actions: ['create'] }])

    expect(queryClient.getQueryData(['permissions', 'my'])).toBeDefined()

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

    expect(queryClient.getQueryData(['permissions', 'my'])).toBeUndefined()
    expect(queryClient.getQueryData(['me', 'executive-office'])).toBeUndefined()
    expect(canAccess('sales.slip.create', 'create')).toBe(false)
  })
})
