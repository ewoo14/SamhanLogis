/**
 * arologis-mobile auth API — passwordless 휴대번호 로그인.
 *
 * Endpoint (spec §6.2 — D-AX-09):
 * - POST /auth/driver/login   { phoneNumber }            → AuthLoginResponse (401 미등록)
 * - POST /auth/refresh        { refreshToken }            → AuthLoginResponse
 * - POST /auth/logout         { refreshToken }            → 204
 */
import { apiFetch } from './client';

export interface AuthLoginResponse {
  accessToken: string;
  refreshToken: string;
  role: string;
  /** 사용자 노출 식별자 — driverCode (예: "D-001"). UUID 비공개. */
  driverCode: string;
  phoneNumber: string;
  expiresAt: string;
}

/**
 * 본인 휴대번호로 로그인. 사전 등록되지 않은 번호는 401 응답.
 *
 * @param phoneNumber 사용자가 입력한 휴대번호 (예: "010-1234-5678")
 * @throws ApiError 401 — 미등록 번호 (관리자 문의 안내)
 */
export async function driverLogin(phoneNumber: string): Promise<AuthLoginResponse> {
  return apiFetch<AuthLoginResponse>('/auth/driver/login', {
    method: 'POST',
    body: JSON.stringify({ phoneNumber }),
  }, { retryOnUnauthorized: false });
}

export async function logout(refreshToken: string): Promise<void> {
  await apiFetch<void>('/auth/logout', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  }, { retryOnUnauthorized: false });
}
