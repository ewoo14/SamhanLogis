/**
 * 비밀번호 셀프 재설정 API 클라이언트 — P0-2 신규 endpoint (page 방식).
 *
 * BE: {@code services/auth-service} P0-2 신규 endpoint.
 *
 * <p>제공 endpoint (2종):
 * <ul>
 *   <li>{@code POST /api/v1/auth/password-reset/request} — loginId + email → 인증번호 메일 발송</li>
 *   <li>{@code POST /api/v1/auth/password-reset/confirm} — loginId + token + newPassword + confirmPassword → 비밀번호 재설정</li>
 * </ul>
 *
 * <p>기존 {@code passwordApi.ts} 의 legacy endpoint ({@code /auth/password/reset/*}) 와
 * 병존. 신규 라우트 ({@code /auth/password-reset/*}) 에서만 본 모듈을 사용한다.
 *
 * <p>비밀번호 정책: 8~32자, 영문+숫자+특수문자 조합 필수.
 * 클라이언트에서도 동일 정규식으로 검증 후 서버에 전송한다.
 *
 * @see PasswordResetRequestPage
 * @see PasswordResetConfirmPage
 */
import { apiClient, type ApiEnvelope } from './client'

/**
 * {@code POST /api/v1/auth/password-reset/request} 요청 body.
 * BE {@code PasswordResetRequestDto} 와 1:1 일치.
 */
export interface PasswordResetRequestDto {
  /** 사용자 로그인 ID. */
  loginId: string
  /** 가입 시 등록한 이메일 주소. */
  email: string
}

/**
 * {@code POST /api/v1/auth/password-reset/confirm} 요청 body.
 * BE {@code PasswordResetConfirmDto} 와 1:1 일치.
 */
export interface PasswordResetConfirmDto {
  /** 사용자 로그인 ID. */
  loginId: string
  /** 이메일로 전송된 6자리 인증번호. */
  token: string
  /** 새 비밀번호 (8~32자, 영문+숫자+특수문자). */
  newPassword: string
  /** 새 비밀번호 확인 — BE 서버 측에서도 일치 검증. */
  confirmPassword: string
}

/**
 * 비밀번호 재설정 공통 응답 — 성공/실패 메시지 포함.
 * BE {@code PasswordResetResultResponse} 와 1:1 일치.
 */
export interface PasswordResetResultResponse {
  /** 처리 성공 여부. */
  success: boolean
  /** 사용자 노출용 한국어 결과 메시지. */
  message: string
}

/**
 * 비밀번호 재설정 인증번호 발송 요청.
 *
 * 사용자 존재 여부/이메일 일치 여부와 무관하게 항상 200 OK 반환 (enumeration 방지).
 * 등록된 계정인 경우에만 이메일이 실제 발송된다.
 *
 * @param body loginId + email
 * @return 처리 결과 메시지 (사용자에게 노출)
 * @throws AxiosError — 429 (rate limit 초과) / 5xx (서버 오류)
 */
export async function requestPasswordReset(
  body: PasswordResetRequestDto,
): Promise<PasswordResetResultResponse> {
  const res = await apiClient.post<ApiEnvelope<PasswordResetResultResponse>>(
    '/api/v1/auth/password-reset/request',
    body,
  )
  return res.data.data
}

/**
 * 인증번호 + 새 비밀번호로 재설정 완료.
 *
 * 인증번호는 10분 유효. 정책 위반(8~32자/영문+숫자+특수문자) 시 400,
 * 인증번호 불일치/만료 시 401 응답.
 *
 * @param body loginId + token + newPassword + confirmPassword
 * @return 처리 결과 메시지
 * @throws AxiosError — 400 (정책 위반 / 비밀번호 불일치) / 401 (인증번호 불일치 또는 만료)
 */
export async function confirmPasswordReset(
  body: PasswordResetConfirmDto,
): Promise<PasswordResetResultResponse> {
  const res = await apiClient.post<ApiEnvelope<PasswordResetResultResponse>>(
    '/api/v1/auth/password-reset/confirm',
    body,
  )
  return res.data.data
}
