/**
 * 날짜 관련 공용 유틸 — 중복 정의 제거 (SP-08-6-5 FE 결함 2).
 *
 * 사용 페이지: DailyClosingPage / GeneralLedgerPage / MonthEndClosingPage.
 * 각 페이지에 흩어져 있던 today() / sevenDaysAgo() 를 여기로 통합.
 */

/** YYYY-MM-DD 오늘 날짜 (클라이언트 local 기준). */
export function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 7일 전 YYYY-MM-DD (클라이언트 local 기준). */
export function sevenDaysAgo(): string {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 당월 1일 YYYY-MM-DD. */
export function firstDayOfMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
