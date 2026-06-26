import { apiClient, type ApiEnvelope } from './client'

export type PushDevicePlatform = 'ANDROID' | 'IOS' | 'WEB'
export type PushAppClient = 'DESKTOP_NATIVE'

export interface PushTokenRegisterPayload {
  token: string
  platform: PushDevicePlatform
  appClient: PushAppClient
}

export interface PushTokenResponse {
  platform: PushDevicePlatform
  appClient: string
  lastSeenAt: string
}

/**
 * 현재 로그인 사용자의 네이티브 FCM registration token 을 N3a API에 upsert 한다.
 */
export async function registerPushToken(
  payload: PushTokenRegisterPayload,
): Promise<PushTokenResponse> {
  const res = await apiClient.post<ApiEnvelope<PushTokenResponse>>(
    '/api/v1/push-tokens',
    payload,
  )
  return res.data.data
}

/**
 * 로그아웃/기기 변경 시 서버에 저장된 FCM registration token 을 soft delete 한다.
 */
export async function deletePushToken(token: string): Promise<void> {
  await apiClient.delete(
    `/api/v1/push-tokens/${encodeURIComponent(token)}`,
  )
}
