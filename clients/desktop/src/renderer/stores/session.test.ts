import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LoginResponse } from '../api/auth'

const authProvider = {
  bootstrap: vi.fn(),
  establishSession: vi.fn(),
  clearSession: vi.fn(),
}

vi.mock('../auth/authProvider', () => ({
  getAuthProvider: () => authProvider,
  isElectronPlatform: false,
}))

vi.mock('../api/mock', () => ({
  isMockMode: () => false,
  MOCK_AUTH: {
    token: 'mock-token',
    userId: 'mock-user',
    role: 'MASTER',
    fullName: 'Mock',
  },
}))

describe('session store authProvider 배선', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { useSessionStore } = await import('./session')
    useSessionStore.setState({ auth: null, bootstrapped: false })
  })

  it('bootstrap 은 provider 세션을 AuthSnapshot 으로 미러링하되 웹 token 은 비운다', async () => {
    authProvider.bootstrap.mockResolvedValue({
      userId: 'u-1',
      role: 'MANAGER',
      fullName: '홍길동',
      partnerCode: 'P100',
      groups: [{ id: 'g1', name: '관리자', builtin: true }],
    })
    const { useSessionStore } = await import('./session')

    await useSessionStore.getState().bootstrap()

    expect(useSessionStore.getState().bootstrapped).toBe(true)
    expect(useSessionStore.getState().auth).toMatchObject({
      token: '',
      userId: 'u-1',
      fullName: '홍길동',
      partnerCode: 'P100',
    })
  })

  it('setAuth 와 logout 은 provider 를 경유하고 렌더러 캐시를 갱신한다', async () => {
    authProvider.establishSession.mockResolvedValue(undefined)
    authProvider.clearSession.mockResolvedValue(undefined)
    const login: LoginResponse = {
      token: 'jwt',
      userId: 'u-2',
      role: 'MASTER',
      displayName: '개발책임자',
      groups: [],
    }
    const { useSessionStore } = await import('./session')

    await useSessionStore.getState().setAuth(login)
    expect(authProvider.establishSession).toHaveBeenCalledWith(login)
    expect(useSessionStore.getState().auth?.token).toBe('')
    expect(useSessionStore.getState().auth?.fullName).toBe('개발책임자')

    await useSessionStore.getState().logout()
    expect(authProvider.clearSession).toHaveBeenCalledTimes(1)
    expect(useSessionStore.getState().auth).toBeNull()
  })
})
