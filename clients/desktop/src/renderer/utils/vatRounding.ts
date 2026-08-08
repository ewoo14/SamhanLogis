/**
 * 부가가치세 원 단위 계산의 화면 공통 규칙.
 *
 * <p>공급가액의 10%를 0 방향으로 절사한다. 전표·견적·세금계산서 화면이
 * 서로 다른 Math.round/Math.trunc 구현을 갖지 않도록 이 모듈을 참조한다.
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

/** VAT 포함 정수 합계에서 공급가액을 분리한다 — 원 미만은 0 방향 절사. */
export function supplyFromVatInclusive(lineTotal: bigint): bigint {
  return (lineTotal * 100n) / 110n
}

/** VAT 포함 총액을 화면에 표시할 공급가액·부가세액·총액으로 분리한다. */
export function splitVatInclusive(
  totalAmount: number,
  taxable: boolean,
): { supply: number; vat: number; total: number } {
  const totalCents = toCents(totalAmount)
  const total = Number(totalCents) / 100
  if (!taxable) return { supply: total, vat: 0, total }
  const supply = Number(totalCents / 110n)
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
