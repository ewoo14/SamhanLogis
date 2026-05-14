/**
 * 아로로지스 자체 auth API 호출.
 *
 * Endpoint (spec §6.2 — D-AX-07):
 * - POST /auth/admin/login    { loginId, password }              → AuthLoginResponse
 * - POST /auth/refresh        { refreshToken }                    → AuthLoginResponse (token rotation)
 * - POST /auth/logout         { refreshToken }                    → 204
 * - GET  /auth/me             (Authorization: Bearer)             → AuthMeResponse
 *
 * 응답은 envelope 없이 raw 객체 반환 (BE D-AX-07 결정).
 */
import { apiClient } from './client'

export interface AuthLoginResponse {
  accessToken: string
  refreshToken: string
  role: string
  expiresAt: string
}

export interface AuthMeResponse {
  userId: string
  loginId: string
  fullName: string
  role: string
}

/**
 * admin 로그인 — loginId + password 자격증명.
 *
 * @throws AxiosError — 401 (자격 증명 실패) / 422 (검증 실패)
 */
export async function adminLogin(
  loginId: string,
  password: string,
): Promise<AuthLoginResponse> {
  const res = await apiClient.post<AuthLoginResponse>('/auth/admin/login', {
    loginId,
    password,
  })
  return res.data
}

/**
 * driver passwordless 로그인 — phoneNumber 만으로 사전 등록 여부 확인 (mobile 에서 사용).
 * 본 desktop 에는 호출 흐름이 없지만, 동일 BE endpoint 를 공유 docs 차원에서 export.
 *
 * @throws AxiosError — 401 (미등록 번호)
 */
export async function driverLogin(
  phoneNumber: string,
): Promise<AuthLoginResponse> {
  const res = await apiClient.post<AuthLoginResponse>('/auth/driver/login', {
    phoneNumber,
  })
  return res.data
}

/** refresh token rotation — client.ts 의 응답 인터셉터가 자동 호출. */
export async function refreshToken(
  refreshToken: string,
): Promise<AuthLoginResponse> {
  const res = await apiClient.post<AuthLoginResponse>('/auth/refresh', {
    refreshToken,
  })
  return res.data
}

/** 로그아웃 — refreshToken revoke. 응답 무시 가능 (best-effort). */
export async function logout(refreshToken: string): Promise<void> {
  await apiClient.post('/auth/logout', { refreshToken })
}

/** 현재 로그인 사용자 정보 — JWT Bearer 로 검증. */
export async function fetchMe(): Promise<AuthMeResponse> {
  const res = await apiClient.get<AuthMeResponse>('/auth/me')
  return res.data
}
