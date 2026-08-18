/**
 * 부가가치세 원 단위 계산의 화면 공통 규칙.
 *
 * <p>VAT 포함 합계의 공급가액은 레거시 종합견적서처럼 1.1로 나눈 뒤 원 단위
 * HALF_UP하고, VAT는 총액과 공급가액의 차액으로 구한다.
 */

/** 공급가액(원 단위)의 부가세 10% — 원 미만은 0 방향 절사. */
export function vatFromSupply(supplyAmount: number): number {
  if (!Number.isFinite(supplyAmount)) return 0
  return Math.trunc(supplyAmount * 0.1)
}

/** 정수 공급가액의 부가세 10% — BigInt 경로. */
export function vatFromIntegerSupply(supplyAmount: bigint): bigint {
  return supplyAmount / 10n
}

interface DecimalParts {
  coefficient: bigint
  scale: number
}

function decimalParts(raw: string | number): DecimalParts | null {
  const match = String(raw).trim().match(/^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/)
  if (!match || (!match[2] && !match[3])) return null
  const sign = match[1] === '-' ? -1n : 1n
  const integer = match[2] || '0'
  const fraction = match[3] || ''
  const exponent = Number(match[4] || '0')
  if (!Number.isSafeInteger(exponent)) return null
  let coefficient = sign * BigInt(`${integer}${fraction}`)
  let scale = fraction.length - exponent
  if (scale < 0) {
    coefficient *= 10n ** BigInt(-scale)
    scale = 0
  }
  return { coefficient, scale }
}

function divideHalfUp(numerator: bigint, denominator: bigint): bigint {
  const sign = numerator < 0n ? -1n : 1n
  const absolute = numerator < 0n ? -numerator : numerator
  const quotient = absolute / denominator
  const remainder = absolute % denominator
  return sign * (remainder * 2n >= denominator ? quotient + 1n : quotient)
}

/** VAT 포함 단가 편집/저장 공통 정본. 레거시처럼 총액을 먼저 만든 뒤 VAT를 분리한다. */
export function calculateVatInclusiveAmounts(
  unitPriceWithVat: string | number,
  quantity: number,
): { supply: string; vat: string; total: string } {
  const parsed = decimalParts(unitPriceWithVat)
  if (!parsed || !Number.isInteger(quantity) || quantity <= 0) {
    throw new Error('VAT 포함 단가와 수량이 올바르지 않습니다')
  }
  const unitAtScale2 = parsed.scale <= 2
    ? parsed.coefficient * 10n ** BigInt(2 - parsed.scale)
    : divideHalfUp(parsed.coefficient, 10n ** BigInt(parsed.scale - 2))
  const total = divideHalfUp(unitAtScale2 * BigInt(quantity), 100n)
  const supply = divideHalfUp(total * 100n, 110n)
  return { supply: String(supply), vat: String(total - supply), total: String(total) }
}

/** VAT 포함 정수 합계에서 공급가액을 분리한다 — 레거시 원 단위 HALF_UP. */
export function supplyFromVatInclusive(lineTotal: bigint): bigint {
  const numerator = lineTotal * 100n
  const denominator = 110n
  const quotient = numerator / denominator
  const remainder = numerator % denominator
  return quotient + (remainder * 2n >= denominator ? 1n : 0n)
}

/** VAT 포함 총액을 화면에 표시할 공급가액·부가세액·총액으로 분리한다. */
export function splitVatInclusive(
  totalAmount: number,
  taxable: boolean,
): { supply: number; vat: number; total: number } {
  const totalCents = toCents(totalAmount)
  const total = Number(totalCents) / 100
  if (!taxable) return { supply: total, vat: 0, total }
  const supplyQuotient = totalCents / 110n
  const supplyRemainder = totalCents % 110n
  const supply = Number(supplyQuotient + (supplyRemainder * 2n >= 110n ? 1n : 0n))
  const vat = Number(totalCents - BigInt(supply) * 100n) / 100
  return { supply, vat, total }
}

/** 서버 VatCalculator의 qty × unitPrice 입력을 같은 scale 2로 preview한다. */
export function splitVatInclusiveFromQtyUnitPrice(
  qty: string,
  unitPrice: string,
  taxable: boolean,
): { supply: number; vat: number; total: number } {
  const quantity = Number(qty)
  const price = Number(unitPrice)
  if (!Number.isFinite(quantity) || !Number.isFinite(price)) return splitVatInclusive(0, taxable)
  return splitVatInclusive(Number((quantity * price).toFixed(2)), taxable)
}

/** 서버 BigDecimal 금액의 소수 둘째 자리까지 보존하는 회계전표 표시 포맷. */
export function formatVatAmount(amount: number): string {
  return amount.toLocaleString('ko-KR', { maximumFractionDigits: 2, minimumFractionDigits: 0 })
}

function toCents(amount: number): bigint {
  if (!Number.isFinite(amount)) return 0n
  return BigInt(Math.round(amount * 100))
}
