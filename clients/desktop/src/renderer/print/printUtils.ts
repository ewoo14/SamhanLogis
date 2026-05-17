/**
 * 인쇄 양식 공통 날짜/시각 유틸 — PurchaseSlipPrintPage / SalesTransactionStatementPrintPage /
 * SalesInvoicePrintPage 3 컴포넌트에서 공통 사용.
 *
 * SP-08-6-4 S1: 중복 함수 정의 제거 → 단일 출처화.
 */

/**
 * 현재 시각 → "YYYY-MM-DD HH:mm" 포맷 문자열.
 *
 * 인쇄 미리보기 상단 우측 "출력일시" 렌더링에 사용한다.
 */
export function nowPrintedAt(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * ISO 8601 timestamp → "YYYY-MM-DD HH:mm" 포맷 문자열.
 *
 * 전표 최종수정일시(`updatedAt`) 표시에 사용한다.
 * 입력이 없거나 null/undefined 이면 빈 문자열을 반환한다.
 *
 * @example fmtDatetime('2026-05-18T14:32:18+09:00') → "2026-05-18 14:32"
 */
export function fmtDatetime(iso: string | null | undefined): string {
  if (!iso) return ''
  return iso.slice(0, 10) + ' ' + iso.slice(11, 16)
}
