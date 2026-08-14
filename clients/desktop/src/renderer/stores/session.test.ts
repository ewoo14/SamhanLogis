import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LoginResponse } from '../api/auth'
import { flushZeroDelayTasks } from '../test-utils/flush'

const authProvider = {
  bootstrap: vi.fn(),
  establishSession: vi.fn(),
  clearSession: vi.fn(),
}

const pushRegistration = {
  registerPush: vi.fn(),
  unregisterPush: vi.fn(),
}

vi.mock('../auth/authProvider', () => ({
  getAuthProvider: () => authProvider,
  isElectronPlatform: false,
  isCapacitorPlatform: true,
}))

vi.mock('../push/pushRegistration', () => pushRegistration)

vi.mock('../api/mock', () => ({
  isMockMode: () => false,
  MOCK_AUTH: {
    token: 'mock-token',
    userId: 'mock-user',
    role: 'MASTER',
    fullName: 'Mock',
  },
}))

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

describe('session store authProvider 배선', () => {
  beforeEach(async () => {
    // singleFork keeps every test file in one worker. Reset implementations as
    // well as call history so a prior file's hoisted mock cannot alter this
    // store's provider contract.
    vi.resetAllMocks()
    vi.resetModules()
    // Re-register the file-local factories after resetting the shared worker's
    // module graph. Vitest keeps the mock registry in the single fork, so a
    // previous file can otherwise win the same module specifier.
    vi.doMock('../auth/authProvider', () => ({
      getAuthProvider: () => authProvider,
      isElectronPlatform: false,
      isCapacitorPlatform: true,
    }))
    vi.doMock('../push/pushRegistration', () => pushRegistration)
    vi.doMock('../api/mock', () => ({
      isMockMode: () => false,
      MOCK_AUTH: {
        token: 'mock-token',
        userId: 'mock-user',
        role: 'MASTER',
        fullName: 'Mock',
      },
    }))
    const { useSessionStore } = await import('./session')
    useSessionStore.setState({ auth: null, bootstrapped: false })
  })

  it('전표 조회 권한은 서버의 유형별 guard 집합을 role·빌트인 그룹 양쪽에서 따른다', async () => {
    const { canQueryPurchases, canQuerySales } = await import('./session')
    const authFor = (role: string, groups: { id: string; name: string; builtin?: boolean }[] = []) => ({
      token: '',
      userId: 'u-read',
      role,
      fullName: '조회 사용자',
      groups,
    })

    expect(canQuerySales(authFor('SALES'))).toBe(true)
    expect(canQuerySales(authFor('WAREHOUSE'))).toBe(false)
    expect(canQueryPurchases(authFor('WAREHOUSE'))).toBe(true)
    expect(canQueryPurchases(authFor('ACCOUNTANT'))).toBe(false)
    expect(canQuerySales(authFor('CUSTOM', [{
      id: '00000000-0000-0000-0000-000000000102',
      name: '영업',
      builtin: true,
    }]))).toBe(true)
    expect(canQueryPurchases(authFor('CUSTOM', [{
      id: '00000000-0000-0000-0000-000000000103',
      name: '창고',
      builtin: true,
    }]))).toBe(true)
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

  it('bootstrap 은 저장 세션 복원 후 네이티브 push 등록을 시작한다', async () => {
    authProvider.bootstrap.mockResolvedValue({
      userId: 'u-restored',
      role: 'MASTER',
      fullName: '복원 사용자',
      groups: [],
    })
    pushRegistration.registerPush.mockResolvedValue(undefined)
    const { useSessionStore } = await import('./session')

    await useSessionStore.getState().bootstrap()
    await flushZeroDelayTasks()

    expect(useSessionStore.getState().bootstrapped).toBe(true)
    expect(pushRegistration.registerPush).toHaveBeenCalledTimes(1)
  })

  it('setAuth 와 logout 은 provider 를 경유하고 렌더러 캐시를 갱신한다', async () => {
    authProvider.establishSession.mockResolvedValue(undefined)
    authProvider.clearSession.mockResolvedValue(undefined)
    pushRegistration.registerPush.mockResolvedValue(undefined)
    pushRegistration.unregisterPush.mockResolvedValue(undefined)
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
    await flushZeroDelayTasks()
    expect(pushRegistration.registerPush).toHaveBeenCalledTimes(1)

    await useSessionStore.getState().logout()
    expect(pushRegistration.unregisterPush).toHaveBeenCalledTimes(1)
    expect(authProvider.clearSession).toHaveBeenCalledTimes(1)
    expect(useSessionStore.getState().auth).toBeNull()
  })

  it('logout waits for native push unregister before clearing the auth provider session', async () => {
    const unregister = createDeferred<void>()
    pushRegistration.unregisterPush.mockReturnValueOnce(unregister.promise)
    authProvider.clearSession.mockResolvedValue(undefined)
    const { useSessionStore } = await import('./session')

    const logout = useSessionStore.getState().logout().then(() => 'logged-out')
    const beforeUnregisterDone = await Promise.race([
      logout,
      flushZeroDelayTasks().then(() => 'pending'),
    ])

    expect(beforeUnregisterDone).toBe('pending')
    expect(pushRegistration.unregisterPush).toHaveBeenCalledTimes(1)
    expect(authProvider.clearSession).not.toHaveBeenCalled()

    unregister.resolve()
    await expect(logout).resolves.toBe('logged-out')

    expect(authProvider.clearSession).toHaveBeenCalledTimes(1)
    expect(authProvider.clearSession.mock.invocationCallOrder[0]).toBeGreaterThan(
      pushRegistration.unregisterPush.mock.invocationCallOrder[0] ?? 0,
    )
  })

  it('clearAuthState 는 provider 저장 세션과 렌더러 캐시를 함께 비운다', async () => {
    authProvider.clearSession.mockResolvedValue(undefined)
    const { useSessionStore } = await import('./session')
    useSessionStore.setState({
      auth: {
        token: 'jwt',
        userId: 'u-clear',
        role: 'MASTER',
        fullName: '만료 사용자',
        groups: [],
      },
    })

    await useSessionStore.getState().clearAuthState()

    expect(authProvider.clearSession).toHaveBeenCalledTimes(1)
    expect(useSessionStore.getState().auth).toBeNull()
  })

  it('clearAuthState 는 provider 세션 정리에 실패해도 렌더러 캐시를 비운다', async () => {
    authProvider.clearSession.mockRejectedValueOnce(new Error('native clear failed'))
    const { useSessionStore } = await import('./session')
    useSessionStore.setState({
      auth: {
        token: 'jwt',
        userId: 'u-stale',
        role: 'MASTER',
        fullName: 'Stale User',
        groups: [],
      },
    })

    await expect(useSessionStore.getState().clearAuthState()).rejects.toThrow('native clear failed')

    expect(authProvider.clearSession).toHaveBeenCalledTimes(1)
    expect(useSessionStore.getState().auth).toBeNull()
  })

  it('setAuth resolves before native push registration settles', async () => {
    authProvider.establishSession.mockResolvedValue(undefined)
    pushRegistration.registerPush.mockReturnValue(new Promise(() => undefined))
    const login: LoginResponse = {
      token: 'jwt',
      userId: 'u-3',
      role: 'MASTER',
      displayName: 'Push User',
      groups: [],
    }
    const { useSessionStore } = await import('./session')

    const result = await Promise.race([
      useSessionStore.getState().setAuth(login).then(() => 'resolved'),
      new Promise((resolve) => setTimeout(() => resolve('blocked'), 10)),
    ])

    expect(result).toBe('resolved')
    expect(useSessionStore.getState().auth?.fullName).toBe('Push User')
    await flushZeroDelayTasks()
    expect(pushRegistration.registerPush).toHaveBeenCalledTimes(1)
  })
})
