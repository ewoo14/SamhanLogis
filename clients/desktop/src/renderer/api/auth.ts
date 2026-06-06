/**
 * 인증 도메인 API 클라이언트.
 *
 * 현재 노출 endpoint:
 * - `POST /auth/login` — loginId/password → JWT + 사용자 메타데이터
 *
 * 호출자는 응답 토큰을 `window.samhanAuth.setToken()` 으로 메인 프로세스에
 * 영속 저장해야 한다 (LoginPage 에서 처리).
 */
import { apiClient, type ApiEnvelope } from './client'

/** 로그인 요청 body — BE `LoginRequest` 와 1:1. */
export interface LoginRequest {
  loginId: string
  password: string
}

/**
 * 권한 그룹 항목 — BE `PermissionGroupSummary` 와 1:1.
 * id(UUID) 는 내부 식별 전용이며 사용자 화면에 직접 노출하지 않는다.
 */
export interface LoginGroupItem {
  id: string
  name: string
  builtin: boolean
}

/**
 * 로그인 응답 데이터 — BE `LoginResponse`.
 *
 * `displayName` 은 사용자 표시명 (예: "홍길동 매니저") 이며, 메인 프로세스
 * `AuthSnapshot.fullName` 에 매핑된다.
 *
 * `groups` 는 Phase C5-3 에서 추가된 권한 그룹 목록 (기존 서버 호환을 위해 optional).
 */
export interface LoginResponse {
  token: string
  userId: string
  role: string
  displayName: string
  partnerCode?: string
  groups?: LoginGroupItem[]
}

/**
 * `POST /auth/login` 호출. envelope 에서 data 만 언팩해 반환한다.
 *
 * @param body loginId + password (8자 이상)
 * @return JWT + 사용자 메타데이터
 * @throws AxiosError — 401 (자격 증명 실패) / 422 (검증 실패) / 5xx
 */
export async function login(body: LoginRequest): Promise<LoginResponse> {
  const res = await apiClient.post<ApiEnvelope<LoginResponse>>(
    '/auth/login',
    body,
  )
  return res.data.data
}
