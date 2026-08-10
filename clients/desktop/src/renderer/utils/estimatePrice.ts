/** 견적 자동단가에 product-service가 반환한 유효 분류 정액DC를 적용한다. */
export function resolveEstimateCatalogPrice(
  sellingPrice: number,
  fixedDiscountRate: number | null | undefined,
): { unitPrice: number; appliedRate: number } {
  const listPrice = Number.isFinite(sellingPrice) ? sellingPrice : 0
  const rate = fixedDiscountRate == null ? 0 : Number(fixedDiscountRate)
  if (!Number.isFinite(rate) || rate <= 0) {
    return { unitPrice: Math.max(0, Math.round(listPrice)), appliedRate: 0 }
  }
  return {
    unitPrice: Math.max(0, Math.round(listPrice * (1 - rate / 100))),
    appliedRate: rate,
  }
}
