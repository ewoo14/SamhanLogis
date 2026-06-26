import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiClient = {
  post: vi.fn(),
  delete: vi.fn(),
}

vi.mock('./client', () => ({
  apiClient,
}))

function envelope<T>(data: T) {
  return {
    data: {
      success: true,
      code: 'OK',
      message: 'OK',
      data,
      timestamp: '2026-06-27T00:00:00Z',
    },
  }
}

describe('pushTokens API client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registerPushToken 은 N3a 인증 API에 토큰/플랫폼/클라이언트를 POST 한다', async () => {
    const response = {
      platform: 'IOS',
      appClient: 'DESKTOP_NATIVE',
      lastSeenAt: '2026-06-27T00:00:00Z',
    }
    apiClient.post.mockResolvedValueOnce(envelope(response))
    const { registerPushToken } = await import('./pushTokens')

    await expect(registerPushToken({
      token: 'fcm-token-1',
      platform: 'IOS',
      appClient: 'DESKTOP_NATIVE',
    })).resolves.toEqual(response)

    expect(apiClient.post).toHaveBeenCalledWith('/api/v1/push-tokens', {
      token: 'fcm-token-1',
      platform: 'IOS',
      appClient: 'DESKTOP_NATIVE',
    })
  })

  it('deletePushToken 은 토큰을 URL 인코딩해 인증 DELETE를 호출한다', async () => {
    apiClient.delete.mockResolvedValueOnce(undefined)
    const { deletePushToken } = await import('./pushTokens')

    await deletePushToken('token/with space')

    expect(apiClient.delete).toHaveBeenCalledWith('/api/v1/push-tokens/token%2Fwith%20space')
  })
})
