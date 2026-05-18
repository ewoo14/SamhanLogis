/**
 * 휴대번호 마스킹 유틸리티.
 *
 * SP-10-2 FE-3 알림톡 발송 결과 row 수신자 번호 마스킹 처리.
 * Designer spec (docs/design/sp-10-2-insung-quick-vendor/notification-row.md §4) 준수.
 *
 * 형식: 010-XXXX-{마지막 4자리}
 *
 * 예시:
 *   "01012345678"   → "010-XXXX-5678"
 *   "010-1234-5678" → "010-XXXX-5678"
 *   "0311234567"    → "***-XXXX-4567"  (비표준 번호 fallback)
 *
 * UUID 비공개 원칙 연장 (feedback_uuid_no_user_visibility.md):
 *   개인정보 동일 원칙 — 원본 번호는 BE 로그에만 보존. FE 는 마스킹 형식만 표시.
 */

/**
 * 휴대번호 문자열을 마스킹 형식으로 변환한다.
 *
 * @param phone 원본 번호 (하이픈 있음/없음 모두 허용)
 * @returns 마스킹된 번호 문자열. 빈 값이면 "번호 없음" 반환.
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '번호 없음'

  // 하이픈 제거 후 숫자만 추출
  const digits = phone.replace(/[^0-9]/g, '')

  if (digits.length < 4) {
    return '***-XXXX-****'
  }

  const last4 = digits.slice(-4)

  if (digits.startsWith('010') && digits.length >= 10) {
    return `010-XXXX-${last4}`
  }

  // 비표준 번호 fallback
  return `***-XXXX-${last4}`
}
