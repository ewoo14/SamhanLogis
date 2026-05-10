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
 *
 * <p>PASSWORD-RESET-DESIGN.md §1.2 spec: 사용자 ID 만 입력받아 인증번호 전송.
 * email 은 BE 가 회원 등록 정보에서 자동 조회하므로 FE 에서 전송 불필요.
 */
export interface PasswordResetRequestDto {
  /** 사용자 로그인 ID. */
  loginId: string
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
 *
 * <p>BE 는 {@code ApiResponse<Void>} 를 반환하므로 별도 body DTO 가 존재하지 않는다.
 * 본 인터페이스는 envelope ({@code ApiEnvelope}) 의 {@code success} / {@code message} 만
 * 사용자에게 보여 주기 위해 추출한 view-model 형태이다 (TM PR #138 통합 fix).
 */
export interface PasswordResetResultResponse {
  /** 처리 성공 여부 (envelope.success). */
  success: boolean
  /** 사용자 노출용 한국어 결과 메시지 (envelope.message). */
  message: string
}

/**
 * 비밀번호 재설정 인증번호 발송 요청.
 *
 * 사용자 존재 여부/이메일 일치 여부와 무관하게 항상 200 OK 반환 (enumeration 방지).
 * 등록된 계정인 경우에만 이메일이 실제 발송된다.
 *
 * <p>BE: {@code POST /api/v1/auth/password-reset/request} → {@code ApiResponse.ok(null, "...")} —
 * data 는 항상 {@code null}, success/message 는 envelope 최상단에 위치.
 *
 * @param body loginId + email
 * @return envelope 의 success/message 만 추출한 결과 객체
 * @throws AxiosError — 429 (rate limit 초과) / 5xx (서버 오류)
 */
export async function requestPasswordReset(
  body: PasswordResetRequestDto,
): Promise<PasswordResetResultResponse> {
  const res = await apiClient.post<ApiEnvelope<unknown>>(
    '/api/v1/auth/password-reset/request',
    body,
  )
  return {
    success: res.data?.success ?? true,
    message: res.data?.message ?? '인증번호 요청이 처리되었습니다.',
  }
}

/**
 * 인증번호 + 새 비밀번호로 재설정 완료.
 *
 * 인증번호는 10분 유효. 정책 위반(8~32자/영문+숫자+특수문자) 시 400,
 * 인증번호 불일치/만료 시 401 응답.
 *
 * <p>BE: {@code POST /api/v1/auth/password-reset/confirm} → {@code ApiResponse.ok(null, "...")} —
 * data 는 항상 {@code null}, 성공 메시지는 envelope.message.
 *
 * @param body loginId + token + newPassword + confirmPassword
 * @return envelope 의 success/message 만 추출한 결과 객체
 * @throws AxiosError — 400 (정책 위반 / 비밀번호 불일치) / 401 (인증번호 불일치 또는 만료)
 */
export async function confirmPasswordReset(
  body: PasswordResetConfirmDto,
): Promise<PasswordResetResultResponse> {
  const res = await apiClient.post<ApiEnvelope<unknown>>(
    '/api/v1/auth/password-reset/confirm',
    body,
  )
  return {
    success: res.data?.success ?? true,
    message: res.data?.message ?? '비밀번호가 재설정되었습니다.',
  }
}
