import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createElectronAuthProvider } from '../electronAuthProvider'
import { createWebAuthProvider } from '../webAuthProvider'
import type { LoginResponse } from '../../api/auth'

/** 공용 로그인 응답 픽스처. */
const login: LoginResponse = {
  token: 'JWT123',
  userId: 'u-1',
  role: 'MANAGER',
  displayName: '홍길동 매니저',
  partnerCode: 'P100',
  groups: [{ id: 'g1', name: '매니저', builtin: true }],
}

describe('electronAuthProvider — 기존 IPC Bearer 무회귀', () => {
  let store: unknown
  beforeEach(() => {
    store = null
    // node 환경엔 window 가 없으므로 IPC 브리지를 stub 한다.
    vi.stubGlobal('window', {
      samhanAuth: {
        getToken: vi.fn(async () => store),
        setToken: vi.fn(async (p: unknown) => {
          store = p
        }),
        clearToken: vi.fn(async () => {
          store = null
        }),
      },
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('establishSession 은 displayName 을 fullName 으로 저장하고 토큰을 보존한다', async () => {
    const p = createElectronAuthProvider()
    await p.establishSession(login)
    expect((store as { fullName: string }).fullName).toBe('홍길동 매니저')
    expect((store as { token: string }).token).toBe('JWT123')
    expect((store as { partnerCode: string }).partnerCode).toBe('P100')
  })

  it('getAuthHeaders 는 Bearer 를 주입하고 getSession 은 token 을 제외한 식별정보만 반환한다', async () => {
    const p = createElectronAuthProvider()
    await p.establishSession(login)
    expect(await p.getAuthHeaders()).toEqual({ Authorization: 'Bearer JWT123' })
    const s = await p.getSession()
    expect(s).toMatchObject({
      userId: 'u-1',
      role: 'MANAGER',
      fullName: '홍길동 매니저',
      partnerCode: 'P100',
    })
    expect((s as Record<string, unknown>).token).toBeUndefined()
    expect(s?.groups?.[0]?.name).toBe('매니저')
  })

  it('토큰 미저장 시 getAuthHeaders 는 빈 객체, getSession 은 null', async () => {
    const p = createElectronAuthProvider()
    expect(await p.getAuthHeaders()).toEqual({})
    expect(await p.getSession()).toBeNull()
  })

  it('clearSession 은 저장 토큰을 비운다', async () => {
    const p = createElectronAuthProvider()
    await p.establishSession(login)
    await p.clearSession()
    expect(await p.getSession()).toBeNull()
  })
})

describe('webAuthProvider — httpOnly 쿠키(명시 헤더 없음)', () => {
  it('getAuthHeaders 는 빈 객체(쿠키 자동), establishSession 후 getSession 은 캐시를 반환한다', async () => {
    const p = createWebAuthProvider()
    expect(await p.getAuthHeaders()).toEqual({})
    await p.establishSession(login)
    const s = await p.getSession()
    expect(s).toMatchObject({
      userId: 'u-1',
      fullName: '홍길동 매니저',
      partnerCode: 'P100',
    })
    expect(s?.groups?.[0]?.name).toBe('매니저')
  })
})
