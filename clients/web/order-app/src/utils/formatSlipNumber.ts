/**
 * 견적/주문 번호 포맷 — 정정 #8 양식 통일.
 *
 * <p>형식: `YYYY/MM/DD - {전표번호 4자리}`
 * <p>예: `2026/05/05 - 0001`
 *
 * <p>적용 범위: 거래처가 보는 모든 주문/견적 번호 (Web order-app, Mobile, Desktop sales).
 *
 * <p>UUID 비공개 가드 (feedback_uuid_no_user_visibility.md):
 * - 본 번호는 비즈니스 식별자 — 거래처에게 노출 가능
 * - 내부 UUID 와 별도로 PartnerOrder.slipNumber 컬럼에 저장
 */

/**
 * Slip number 포맷.
 *
 * @param date Date 객체 또는 ISO 문자열 (YYYY-MM-DD or full ISO)
 * @param seq 일련번호 (1 부터, 4자리 0-padding)
 * @returns `YYYY/MM/DD - 0001`
 */
export function formatSlipNumber(date: Date | string, seq: number): string {
  const d = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(d.getTime())) {
    throw new Error(`formatSlipNumber: invalid date ${String(date)}`)
  }
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const seqStr = String(Math.max(0, Math.floor(seq))).padStart(4, '0')
  return `${yyyy}/${mm}/${dd} - ${seqStr}`
}

/**
 * Slip number 역파싱 (UI 정렬 / 검색 보조).
 *
 * @returns null 이면 양식 불일치
 */
export function parseSlipNumber(slip: string): { date: Date; seq: number } | null {
  const m = slip.match(/^(\d{4})\/(\d{2})\/(\d{2})\s*-\s*(\d{1,6})$/)
  if (!m) return null
  const [, y, mo, d, seq] = m
  const date = new Date(Number(y), Number(mo) - 1, Number(d))
  if (Number.isNaN(date.getTime())) return null
  return { date, seq: Number(seq) }
}
