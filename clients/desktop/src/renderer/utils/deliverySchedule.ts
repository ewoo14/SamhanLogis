/**
 * 출고전표 배송일정 규칙 — BE `DeliverySchedule.java` 1:1 미러.
 *
 * 상차(M) = 출고일(슬립일), 하차(N) = computeUnloadDate 반환값.
 * 지방(REGION)/야적(STACK) 전표만 적용. KST 날짜 문자열("YYYY-MM-DD") 기준.
 *
 * 테스트: src/renderer/utils/deliverySchedule.test.ts
 */

/** 배송일정이 적용되는 배송태그 코드 */
const SCHEDULED_TAGS = new Set(['REGION', 'STACK'])

/**
 * 배송일정 적용 대상 태그인지 확인한다.
 * 지방(REGION)/야적(STACK)만 true.
 */
export function isScheduledTag(tag: string | null | undefined): boolean {
  return !!tag && SCHEDULED_TAGS.has(tag)
}

/**
 * 하차일(N) 기본 계산.
 *
 * 규칙 (BE `DeliverySchedule.computeUnloadDate` 1:1):
 * - 비적용 태그(null 포함) → null
 * - N = M + 1일
 * - N이 일요일(0)이면 월요일로 +1, 단 (야적 && M=토요일) → 일요일 그대로
 *
 * @param slipDateISO 출고일 "YYYY-MM-DD"
 * @param tag         배송태그 코드 (null 이면 null 반환)
 * @returns 하차일 "YYYY-MM-DD" 또는 null
 */
export function computeUnloadDate(
  slipDateISO: string | null | undefined,
  tag: string | null | undefined,
): string | null {
  if (!slipDateISO || !isScheduledTag(tag)) return null

  // 날짜 파싱 — 로컬 Date (KST 기준, ISO 문자열을 직접 파싱)
  const parts = slipDateISO.split('-')
  const year = Number(parts[0])
  const month = Number(parts[1])
  const day = Number(parts[2])
  const slipDate = new Date(year, month - 1, day)
  const slipDow = slipDate.getDay() // 0=일 … 6=토

  // N = M + 1
  const n = new Date(year, month - 1, day + 1)
  const nDow = n.getDay()

  // N이 일요일이면 → 월요일. 단 (야적 && M=토) → 일요일 유지
  if (nDow === 0) {
    if (!(tag === 'STACK' && slipDow === 6)) {
      n.setDate(n.getDate() + 1)
    }
  }

  // "YYYY-MM-DD" 포맷 반환
  const ny = n.getFullYear()
  const nm = String(n.getMonth() + 1).padStart(2, '0')
  const nd = String(n.getDate()).padStart(2, '0')
  return `${ny}-${nm}-${nd}`
}

/**
 * 배송일정 특이사항 파생 라벨 생성.
 *
 * 규칙 (BE `DeliverySchedule.scheduleLabel` 1:1):
 * - 비적용 태그 또는 unloadDate가 null → null
 * - 지방(REGION) && N == M → "당착"
 * - 그 외 적용 태그 → "{M일}상{N일}하" (예: "25상26하", 선행 0 없음)
 *
 * @param slipDateISO   출고일 "YYYY-MM-DD"
 * @param unloadDateISO 하차일 "YYYY-MM-DD" 또는 null
 * @param tag           배송태그 코드
 * @returns 라벨 문자열 또는 null
 */
export function scheduleLabel(
  slipDateISO: string | null | undefined,
  unloadDateISO: string | null | undefined,
  tag: string | null | undefined,
): string | null {
  if (!slipDateISO || !unloadDateISO || !isScheduledTag(tag)) return null

  if (tag === 'REGION' && unloadDateISO === slipDateISO) return '당착'

  const mDay = Number(slipDateISO.slice(8, 10))
  const nDay = Number(unloadDateISO.slice(8, 10))
  return `${mDay}상${nDay}하`
}
