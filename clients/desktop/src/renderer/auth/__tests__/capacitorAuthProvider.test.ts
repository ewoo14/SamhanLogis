import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LoginResponse } from '../../api/auth'

const store = new Map<string, string>()

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
      store.set(key, value)
    }),
    get: vi.fn(async ({ key }: { key: string }) => ({ value: store.get(key) ?? null })),
    remove: vi.fn(async ({ key }: { key: string }) => {
      store.delete(key)
    }),
  },
}))

import { createCapacitorAuthProvider } from '../capacitorAuthProvider'

const login: LoginResponse = {
  token: 'CAPJWT',
  userId: 'u-cap',
  role: 'MANAGER',
  displayName: '캡 매니저',
  partnerCode: 'P300',
  groups: [{ id: 'g-cap', name: '캡그룹', builtin: false }],
}

describe('capacitorAuthProvider - Bearer + Preferences 저장', () => {
  beforeEach(() => store.clear())

  it('establishSession 저장 후 getAuthHeaders 는 Bearer, getSession 은 토큰 제외 식별정보', async () => {
    const provider = createCapacitorAuthProvider()

    await provider.establishSession(login)

    expect(await provider.getAuthHeaders()).toEqual({ Authorization: 'Bearer CAPJWT' })
    const session = await provider.getSession()
    expect(session).toMatchObject({
      userId: 'u-cap',
      role: 'MANAGER',
      fullName: '캡 매니저',
      partnerCode: 'P300',
    })
    expect(session?.groups?.[0]?.name).toBe('캡그룹')
    expect((session as Record<string, unknown>).token).toBeUndefined()
  })

  it('미저장 시 getAuthHeaders 빈 객체, getSession null', async () => {
    const provider = createCapacitorAuthProvider()

    expect(await provider.getAuthHeaders()).toEqual({})
    expect(await provider.getSession()).toBeNull()
  })

  it('bootstrap 은 저장 세션이 없으면 null 을 반환한다', async () => {
    const provider = createCapacitorAuthProvider()

    await expect(provider.bootstrap()).resolves.toBeNull()
  })

  it('손상 JSON 저장값은 세션 없이 안전하게 무시한다', async () => {
    const provider = createCapacitorAuthProvider()
    store.set('samhan.auth.snapshot', 'not-json')

    await expect(provider.bootstrap()).resolves.toBeNull()
    expect(await provider.getSession()).toBeNull()
    expect(await provider.getAuthHeaders()).toEqual({})
  })

  it('bootstrap 은 저장 세션을 복원한다', async () => {
    const provider = createCapacitorAuthProvider()

    await provider.establishSession(login)

    await expect(provider.bootstrap()).resolves.toMatchObject({ userId: 'u-cap' })
  })

  it('clearSession 은 저장 토큰/세션을 비운다', async () => {
    const provider = createCapacitorAuthProvider()

    await provider.establishSession(login)
    await provider.clearSession()

    expect(await provider.getSession()).toBeNull()
    expect(await provider.getAuthHeaders()).toEqual({})
  })
})
