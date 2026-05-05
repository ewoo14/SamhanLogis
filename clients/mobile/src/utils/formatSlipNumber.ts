/**
 * formatSlipNumber.ts — 견적/주문 번호 양식 통일.
 *
 * DECISIONS Phase 6 정정 #8 — 견적 + 주문 번호 양식: `YYYY/MM/DD - {전표번호}` 통일.
 * 출처: migration/decisions/DECISIONS.md "frontend sub-team 정정 라운드" §8.
 *
 * Web v2 의 `formatSlipNumber.ts` 와 동일 알고리즘 (mobile 1:1).
 *
 * UUID 미노출 — 본 함수는 표시용 문자열만 생성, id 는 인자에 등장하지 않음.
 */

/**
 * 전표번호 + 일자 → `YYYY/MM/DD - 0001` 양식.
 *
 * @param slipDate ISO date 문자열 (`2026-05-05`) 또는 Date
 * @param slipNo 4자리 zero-pad 전표번호 (number 또는 string. number 면 padStart(4))
 * @returns `2026/05/05 - 0001` 형식 string
 *
 * @example
 *   formatSlipNumber('2026-05-05', 1)        // '2026/05/05 - 0001'
 *   formatSlipNumber(new Date(), '0042')     // 'YYYY/MM/DD - 0042'
 *   formatSlipNumber('2026-05-05', '23')     // '2026/05/05 - 0023'
 */
export function formatSlipNumber(slipDate: string | Date, slipNo: number | string): string {
  const d = typeof slipDate === 'string' ? new Date(slipDate) : slipDate;
  if (Number.isNaN(d.getTime())) {
    return String(slipNo);
  }
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');

  const noStr = typeof slipNo === 'number' ? String(slipNo).padStart(4, '0') : String(slipNo).padStart(4, '0');

  return `${yyyy}/${mm}/${dd} - ${noStr}`;
}

/**
 * legacy `PO-YYYYMMDD-NNNN` 양식의 orderNumber 를 정정 #8 의 `YYYY/MM/DD - NNNN` 양식으로 변환.
 *
 * @example
 *   reformatLegacyOrderNumber('PO-20260505-0001')  // '2026/05/05 - 0001'
 *   reformatLegacyOrderNumber('PO-20260505-23')    // '2026/05/05 - 0023'
 *   reformatLegacyOrderNumber('UNKNOWN-FORMAT')    // 'UNKNOWN-FORMAT' (passthrough)
 */
export function reformatLegacyOrderNumber(orderNumber: string): string {
  const m = orderNumber.match(/^[A-Z]{1,4}-(\d{4})(\d{2})(\d{2})-(\d+)$/);
  if (!m) return orderNumber;
  const [, yyyy, mm, dd, no] = m;
  return `${yyyy}/${mm}/${dd} - ${no.padStart(4, '0')}`;
}
