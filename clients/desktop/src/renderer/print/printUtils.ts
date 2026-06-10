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

const HANGUL_DIGITS = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'] as const
const HANGUL_SMALL_UNITS = ['', '십', '백', '천'] as const
const HANGUL_BIG_UNITS = ['', '만', '억', '조'] as const

/**
 * 금액 → 한국어 표기 (수표/명세서 관행 — "이백삼십만이천삼백사십사").
 *
 * 거래명세서 원본 양식의 "금액: 이백삼십만이천삼백사십사원 정" 행 렌더링에 사용한다.
 * 0 또는 비유한 값은 "영" 을 반환한다. 음수는 부호 제거 후 변환한다.
 *
 * @example krwHangul(2302344) → "이백삼십만이천삼백사십사"
 */
export function krwHangul(amount: number): string {
  const n = Math.floor(Math.abs(Number(amount) || 0))
  if (n === 0) return '영'
  let out = ''
  let rest = n
  let bigIdx = 0
  while (rest > 0) {
    const chunk = rest % 10000
    if (chunk > 0) {
      let part = ''
      let c = chunk
      let smallIdx = 0
      while (c > 0) {
        const d = c % 10
        if (d > 0) {
          // 관행: 십/백/천 앞의 "일" 생략 (일십→십). 만 단위 chunk 선두 1 도 동일 (일만→만 — 수표 표기).
          const digit = d === 1 && smallIdx > 0 ? '' : (HANGUL_DIGITS[d] ?? '')
          part = digit + (HANGUL_SMALL_UNITS[smallIdx] ?? '') + part
        }
        c = Math.floor(c / 10)
        smallIdx += 1
      }
      out = part + HANGUL_BIG_UNITS[bigIdx] + out
    }
    rest = Math.floor(rest / 10000)
    bigIdx += 1
  }
  return out
}
