import { supplyFromVatInclusive, vatFromIntegerSupply } from './vatRounding'

/**
 * 품목행 공급가액·부가세·VAT 포함 합계 계산.
 *
 * <p>라인별 권위 열을 기억하며, 반올림은 공급가액 또는 부가세 중 하나에만 적용한다.
 * 나머지 값은 정수 덧셈·뺄셈으로 닫아 {@code 공급가액+부가세=합계}를 정의상 보장한다.
 */

export type LineVatAuthority = 'PRICE' | 'SUPPLY' | 'VAT' | 'TOTAL'

export interface LineVatLine {
  quantity: string | number
  unitPrice: string | number
  supplyAmount: string
  vatAmount: string
  lineTotal: string
  authority?: LineVatAuthority
  vatWarning?: boolean
}

interface DecimalParts {
  coefficient: bigint
  scale: number
}

function decimalParts(raw: string | number): DecimalParts | null {
  const text = String(raw).trim() || '0'
  const matched = text.match(/^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/)
  if (!matched || (!matched[2] && !matched[3])) return null
  const sign = matched[1] === '-' ? -1n : 1n
  const integer = matched[2] || '0'
  const fraction = matched[3] || ''
  const exponent = Number(matched[4] || '0')
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

function integerAmount(value: string | number): bigint {
  const decimal = decimalParts(value)
  if (!decimal) return 0n
  return divideHalfUp(decimal.coefficient, 10n ** BigInt(decimal.scale))
}

/** 수량×단가 등 두 십진 값의 곱을 정수(scale 0)로 HALF_UP 반올림한다 — BigInt 정밀 연산. */
export function roundProduct(left: string | number, right: string | number): bigint {
  const a = decimalParts(left)
  const b = decimalParts(right)
  if (!a || !b) return 0n
  return divideHalfUp(
    a.coefficient * b.coefficient,
    10n ** BigInt(a.scale + b.scale),
  )
}

function formatScaled(value: bigint, scale: number): string {
  if (scale === 0) return String(value)
  const sign = value < 0n ? '-' : ''
  const absolute = value < 0n ? -value : value
  const padded = absolute.toString().padStart(scale + 1, '0')
  const integer = padded.slice(0, -scale)
  const fraction = padded.slice(-scale).replace(/0+$/, '')
  return fraction ? `${sign}${integer}.${fraction}` : `${sign}${integer}`
}

function divideToScale(value: bigint, divisor: bigint, scale: number): string {
  return formatScaled(divideHalfUp(value * 10n ** BigInt(scale), divisor), scale)
}

function warningFor(supplyAmount: bigint, vatAmount: bigint): boolean {
  return vatAmount !== vatFromIntegerSupply(supplyAmount)
}

/** 공급가액 기준 공통 10% 절사값과 입력 부가세가 다른지 판정한다. */
export function hasVatWarning(supplyAmount: string | number, vatAmount: string | number): boolean {
  return warningFor(integerAmount(supplyAmount), integerAmount(vatAmount))
}

function fromAmounts<T extends LineVatLine>(
  line: T,
  authority: LineVatAuthority,
  supplyAmount: bigint,
  vatAmount: bigint,
  lineTotal: bigint,
): T {
  const quantity = Math.max(1, Math.trunc(Number(line.quantity) || 1))
  return {
    ...line,
    quantity: line.quantity,
    unitPrice: divideToScale(lineTotal, BigInt(quantity), 2),
    supplyAmount: String(supplyAmount),
    vatAmount: String(vatAmount),
    lineTotal: String(lineTotal),
    authority,
    // PRICE/TOTAL은 VAT 포함 T를 권위로 삼아 V=T-S로 닫으므로 10% 단일값과
    // 소수점 경계가 달라도 경고하지 않는다. VAT 직접 입력만 약정 기준을 검증한다.
    vatWarning: authority === 'VAT' ? warningFor(supplyAmount, vatAmount) : false,
  } as T
}

/** 단가(P) 편집 경로 — 기존 VAT 포함 단가 계산을 유지한다. */
export function recalculateLineVat<T extends LineVatLine>(line: T, authority: LineVatAuthority = 'PRICE'): T {
  const quantity = Math.max(1, Math.trunc(Number(line.quantity) || 1))
  if (authority === 'PRICE') {
    const total = roundProduct(quantity, line.unitPrice)
    // BLOCKING-2 (#824 R1): BE VatAmountCalculator/splitVatInclusive 는 0 방향 절사(DOWN)다.
    // 이 분기만 HALF_UP(divideHalfUp)을 써 TOTAL/SUPPLY 분기·하단 합계 바와 어긋났었다 —
    // 단일 진실원(vatRounding.ts)의 DOWN 계산으로 통일한다.
    const supply = supplyFromVatInclusive(total)
    return fromAmounts(line, authority, supply, total - supply, total)
  }
  if (authority === 'SUPPLY') {
    const supply = integerAmount(line.supplyAmount)
    const vat = vatFromIntegerSupply(supply)
    return fromAmounts(line, authority, supply, vat, supply + vat)
  }
  if (authority === 'VAT') {
    const supply = integerAmount(line.supplyAmount)
    const vat = integerAmount(line.vatAmount)
    return fromAmounts(line, authority, supply, vat, supply + vat)
  }
  const total = integerAmount(line.lineTotal)
  const supply = supplyFromVatInclusive(total)
  return fromAmounts(line, authority, supply, total - supply, total)
}

/** 공급가액·부가세·합계 중 사용자가 편집한 값을 권위로 반영한다. */
export function editLineVat<T extends LineVatLine>(
  line: T,
  authority: Exclude<LineVatAuthority, 'PRICE'>,
  value: string | number,
): T {
  const next = { ...line }
  if (authority === 'SUPPLY') next.supplyAmount = String(integerAmount(value))
  if (authority === 'VAT') next.vatAmount = String(integerAmount(value))
  if (authority === 'TOTAL') next.lineTotal = String(integerAmount(value))
  return recalculateLineVat(next, authority)
}

/** 수량 변경 — 비단가 권위 라인은 파생 단가를 승격해 PRICE 경로로 복귀한다. */
export function changeLineQuantity<T extends LineVatLine>(line: T, quantity: string): T {
  const next = { ...line, quantity }
  if (line.authority && line.authority !== 'PRICE') {
    return recalculateLineVat(next, 'PRICE')
  }
  return recalculateLineVat(next, 'PRICE')
}
