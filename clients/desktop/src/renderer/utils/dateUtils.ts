/**
 * 날짜 관련 공용 유틸 — 중복 정의 제거 (SP-08-6-5 FE 결함 2).
 *
 * 사용 페이지: DailyClosingPage / GeneralLedgerPage / MonthEndClosingPage.
 * 각 페이지에 흩어져 있던 today() / sevenDaysAgo() 를 여기로 통합.
 */

/**
 * 임의의 Date 를 로컬(KST) 기준 "YYYY-MM-DD" 문자열로 반환한다.
 *
 * `new Date().toISOString().slice(0,10)` 는 UTC 기준이라 한국 시각 오전 0~8:59 에
 * 하루 전 날짜를 반환하는 문제가 있다. Electron 렌더러의 로컬 타임존 = KST 이므로
 * getFullYear/getMonth/getDate 를 직접 읽는 이 유틸을 사용한다.
 *
 * @param d 변환 대상 Date (기본값 = 현재 시각)
 */
export function toLocalDateISO(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 한국 업무일 기준 YYYY-MM-DD. 실행 환경의 기본 타임존과 무관하다. */
export function toKstDateISO(d: Date = new Date()): string {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
}

/** YYYY-MM-DD 오늘 날짜 (클라이언트 local 기준). */
export function today(): string {
  return toLocalDateISO()
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
