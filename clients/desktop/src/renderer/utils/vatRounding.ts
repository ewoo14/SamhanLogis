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
  const total = Number.isFinite(totalAmount) ? Math.trunc(totalAmount) : 0
  if (!taxable) return { supply: total, vat: 0, total }
  const supply = Number(supplyFromVatInclusive(BigInt(total)))
  return { supply, vat: total - supply, total }
}
