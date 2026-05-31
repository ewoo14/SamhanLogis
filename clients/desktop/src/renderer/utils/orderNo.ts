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
