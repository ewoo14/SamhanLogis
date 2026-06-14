/**
 * 거래처 주문번호 URL 경로 변환 유틸.
 *
 * 전표/주문번호의 표준 포맷은 `YYYY/MM/DD-{번호}` (슬래시) 로 전 영역 통일되어 있다
 * (BE 채번 `yyyy/MM/dd`, 화면·저장·API 본문 모두 슬래시). 다만 게이트웨이/Spring 이
 * URL 경로의 인코딩된 슬래시(`%2F`) 를 StrictHttpFirewall 로 차단하므로, **URL 경로
 * 세그먼트에 한해서만** 슬래시를 하이픈으로 치환한다. BE `PartnerOrderIdResolver` 가
 * 하이픈/슬래시를 모두 처리(하이픈 → toSlashOrderNo 역변환)하므로 안전하며, 사용자에게
 * 노출되는 번호는 항상 슬래시 표준이 유지된다.
 *
 * @param orderNumber 슬래시 표준 주문번호 (예: `2026/05/31-2`)
 * @returns URL-safe 하이픈 경로 식별자 (예: `2026-05-31-2`). 하이픈 입력은 no-op.
 */
export const toOrderPathId = (orderNumber: string): string =>
  orderNumber.replace(/\//g, '-')

/**
 * 인쇄 미리보기 표시용 전표번호에서 마지막 번호부의 앞자리 0만 제거한다.
 *
 * <p>전표번호 표준(`YYYY/MM/DD-NNN`)의 날짜 영역 0은 유지하고, 마지막 `-` 뒤 숫자만
 * `001` → `1`, `010` → `10` 처럼 표시한다. 저장값과 경로 식별자는 변경하지 않는다.
 *
 * @param slipNo 저장된 원본 전표번호
 * @returns 인쇄 표시용 전표번호. null/undefined 는 빈 문자열, 형식이 맞지 않으면 원본 문자열.
 */
export const stripSlipNoZeros = (slipNo: string | null | undefined): string => {
  if (!slipNo) return slipNo ?? ''

  const dashIndex = slipNo.lastIndexOf('-')
  if (dashIndex < 0) return slipNo

  const head = slipNo.slice(0, dashIndex)
  const tail = slipNo.slice(dashIndex + 1)
  if (!/^\d+$/.test(tail)) return slipNo

  const strippedTail = tail.replace(/^0+/, '') || '0'
  return `${head}-${strippedTail}`
}
