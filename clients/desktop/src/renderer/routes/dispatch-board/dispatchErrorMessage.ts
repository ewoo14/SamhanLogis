/**
 * 배차 API 에러의 서버 메시지(BusinessException message) 추출 유틸 — E2 기둥2.
 *
 * <p>복원/편집 실패 시 고정 문구 대신 구체 사유(예: 409 "이미 활성 배차 매핑이 있는 전표입니다")를
 * 사용자에게 노출하기 위해 응답 envelope 의 message 를 안전하게 꺼낸다. axios 에러가 아니거나
 * message 가 없으면 null 을 반환해 호출부가 기본 문구로 폴백한다.
 */
import { isAxiosError } from 'axios'

export function serverErrorMessage(error: unknown): string | null {
  if (!isAxiosError(error)) return null
  const data = error.response?.data as { message?: unknown } | undefined
  const msg = data?.message
  return typeof msg === 'string' && msg.trim() ? msg.trim() : null
}
