import axios from 'axios'

/**
 * BE 공통 오류 응답 envelope.
 *
 * <p>{@code GlobalExceptionHandler} / {@code ApiResponse} 오류 본문과 같은 구조만 참조한다.
 */
export interface ApiErrorEnvelope {
  code?: string
  message?: string
}

/**
 * axios 오류 응답에서 HTTP status + BE 오류 envelope 를 함께 추출한다.
 *
 * <p>AxiosError 가 아니거나 응답 본문이 객체가 아니면 둘 다 undefined 로 반환한다.
 */
export function getApiErrorInfo(err: unknown): { status?: number; data?: ApiErrorEnvelope } {
  if (!axios.isAxiosError(err)) return {}
  const data = err.response?.data
  return {
    status: err.response?.status,
    data: typeof data === 'object' && data !== null ? data as ApiErrorEnvelope : undefined,
  }
}

/**
 * BE 한국어 message 를 우선 추출하고, 없으면 기존 Error.message 로 폴백한다.
 */
export function extractApiErrorMessage(err: unknown): string {
  const responseMessage = extractApiErrorResponseMessage(err)
  if (responseMessage) return responseMessage
  if (err instanceof Error && err.message.startsWith('Mock handler not found:')) {
    return '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'
  }
  return err instanceof Error ? err.message : String(err)
}

/**
 * BE 응답 message 가 있을 때만 반환한다.
 *
 * <p>기존 API 함수처럼 BE message 가 없을 때 원본 오류를 그대로 throw 해야 하는 경로에서 사용한다.
 */
export function extractApiErrorResponseMessage(err: unknown): string | null {
  const message = getApiErrorInfo(err).data?.message
  return typeof message === 'string' && message.trim() ? message : null
}

/**
 * BE `ErrorCode.PARTNER_IDENTITY_LOOKUP_UNAVAILABLE` — partner-service 장애로 거래처 신원
 * 조회 자체가 실패한 502. (#831 sweep 후속)
 *
 * <p>read 리포트(수금계획/받을어음/입출금내역/거래처잔액 등, 파트너 신원이 곧 행의 의미인 조회)는
 * 이 코드를 fail-closed 502 로 표면화한다 — 사용자 귀책(백엔드 연결 문제)이 아니라 외부 조회
 * 서비스의 일시 장애임을 구분해서 안내하기 위한 판정.
 */
export const PARTNER_IDENTITY_LOOKUP_UNAVAILABLE_CODE = 'PARTNER_IDENTITY_LOOKUP_UNAVAILABLE'

/**
 * 오류가 partner-service 조회 UNAVAILABLE 502 인지 판정한다.
 *
 * <p>status===502 AND code===PARTNER_IDENTITY_LOOKUP_UNAVAILABLE 를 모두 요구한다 — 같은 502 라도
 * 다른 원인(ETAX/KFTC/CODEF 외부 연동 등)과 혼동하지 않기 위해 code 까지 확인한다.
 */
export function isPartnerLookupUnavailableError(err: unknown): boolean {
  const { status, data } = getApiErrorInfo(err)
  return status === 502 && data?.code === PARTNER_IDENTITY_LOOKUP_UNAVAILABLE_CODE
}
