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
  return extractApiErrorResponseMessage(err) ?? (err instanceof Error ? err.message : String(err))
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
