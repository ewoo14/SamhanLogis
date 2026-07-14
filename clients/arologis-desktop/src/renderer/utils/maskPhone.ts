/**
 * 휴대전화 번호 마스킹 유틸리티.
 *
 * <p>admin 내부 API는 원본 전화번호를 wire로 전달하고, 화면 표시는 이 함수로 마스킹한다.
 * UUID 비공개 원칙과 별개로 개인정보 화면 노출을 최소화하기 위한 FE 표시 규칙이다.
 */

/**
 * 휴대전화 번호 문자열을 마스킹 형식으로 변환한다.
 *
 * @param phone 원본 번호. 하이픈 유무를 모두 허용한다.
 * @returns 마스킹된 번호 문자열. 빈 값이면 "번호 없음"을 반환한다.
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '번호 없음'

  const digits = phone.replace(/[^0-9]/g, '')

  if (digits.length < 4) {
    return '***-XXXX-****'
  }

  const last4 = digits.slice(-4)

  if (digits.startsWith('010') && digits.length >= 10) {
    return `010-XXXX-${last4}`
  }

  return `***-XXXX-${last4}`
}
