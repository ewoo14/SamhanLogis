/**
 * 전표/견적/주문 번호 포맷 util — `YYYY/MM/DD - {전표번호}` 통일 (v2 정정 §정정 8).
 *
 * <p>EstimateMaster + PartnerOrderMaster + Slip 모두 본 util 로 표시 양식 통일.
 * 화면/인쇄/목록 grid 모든 곳에서 사용. backend 가 순번만 (`0001` zero-pad 4자리) 내려주는
 * 구조와 호환.
 *
 * <p>입력:
 * <ul>
 *   <li>{@code dateOrIso} — `Date` 또는 ISO 8601 문자열 (`2026-05-05T...`)</li>
 *   <li>{@code seq} — 순번 (number 또는 zero-pad 문자열). 미지정 시 빈 표시 (`YYYY/MM/DD`).</li>
 * </ul>
 *
 * <p>출력 예: `2026/05/05 - 0001` / `2026/05/05` (seq 미지정).
 *
 * <p>UUID 비공개 가드 — `seq` 는 사용자 노출 식별자 (DB UUID 가 아님) 가정.
 */

/** 안전한 zero-pad — 음수/소수 방어. */
function pad(n: number, width: number): string {
  const s = String(Math.max(0, Math.floor(Math.abs(n))))
  return s.length >= width ? s : '0'.repeat(width - s.length) + s
}

/**
 * `YYYY/MM/DD` 만 추출 — Date 또는 ISO 문자열에서 한국 표시 양식.
 */
export function formatSlipDate(dateOrIso: Date | string | null | undefined): string {
  if (!dateOrIso) return ''
  const d = dateOrIso instanceof Date ? dateOrIso : new Date(dateOrIso)
  if (Number.isNaN(d.getTime())) {
    // 유효하지 않은 날짜 — fallback (이미 `YYYY/MM/DD` 또는 `YYYY-MM-DD` 인 경우)
    if (typeof dateOrIso === 'string') {
      return dateOrIso.slice(0, 10).replace(/-/g, '/')
    }
    return ''
  }
  const y = d.getFullYear()
  const m = pad(d.getMonth() + 1, 2)
  const day = pad(d.getDate(), 2)
  return `${y}/${m}/${day}`
}

/**
 * `YYYY/MM/DD - {전표번호}` 통일 양식 (v2 정정 §8).
 *
 * @param dateOrIso 발행일 (Date 또는 ISO 문자열)
 * @param seq 순번 (number 또는 zero-pad 문자열). number 면 4자리 zero-pad.
 * @return `2026/05/05 - 0001` 형태. seq 가 없거나 빈 값이면 `YYYY/MM/DD` 만.
 */
export function formatSlipNumber(
  dateOrIso: Date | string | null | undefined,
  seq?: number | string | null,
): string {
  const datePart = formatSlipDate(dateOrIso)
  if (!datePart) return ''
  if (seq === null || seq === undefined || seq === '') return datePart
  const seqStr = typeof seq === 'number' ? pad(seq, 4) : String(seq)
  return `${datePart} - ${seqStr}`
}
