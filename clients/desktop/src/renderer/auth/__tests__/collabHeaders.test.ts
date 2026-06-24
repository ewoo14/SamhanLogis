import { beforeEach, describe, expect, it, vi } from 'vitest'

const authProvider = {
  getSession: vi.fn(),
}

vi.mock('../authProvider', () => ({
  getAuthProvider: () => authProvider,
}))

describe('collabHeaders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('세션 식별정보로 협업 헤더를 만든다', async () => {
    authProvider.getSession.mockResolvedValue({
      userId: 'u-1',
      role: 'MANAGER',
      fullName: '홍길동',
    })
    const { collabHeaders } = await import('../collabHeaders')

    await expect(collabHeaders()).resolves.toEqual({
      'X-User-Id': 'u-1',
      'X-User-Name': encodeURIComponent('홍길동'),
    })
  })

  it('세션이 없으면 빈 헤더를 반환한다', async () => {
    authProvider.getSession.mockResolvedValue(null)
    const { collabHeaders } = await import('../collabHeaders')

    await expect(collabHeaders()).resolves.toEqual({})
  })
})
