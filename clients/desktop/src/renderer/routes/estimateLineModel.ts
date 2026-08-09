/** 견적 라인 상품 유형별 납품가 입력 규칙. */
export type EstimateGoodsType = 'GOODS' | 'NON_GOODS'

/**
 * 비상품은 납품가가 입력되는 순간 견적 단위를 1로 시작한다.
 * 상품 라인은 기존 수량을 그대로 보존한다.
 */
export function quantityAfterDeliveryPriceInput(
  goodsType: EstimateGoodsType | null | undefined,
  currentQuantity: string,
  deliveryPrice: string,
): string {
  if (goodsType === 'NON_GOODS' && deliveryPrice.trim() !== '') return '1'
  return currentQuantity
}

/** 가격 입력 결과를 로컬 라인과 공동편집 provider 양쪽에 적용할지 판단한다. */
export function resolvePriceInputQuantitySync(
  goodsType: EstimateGoodsType | null | undefined,
  currentQuantity: string,
  deliveryPrice: string,
): { quantity: string; shouldSyncQuantity: boolean } {
  const quantity = quantityAfterDeliveryPriceInput(goodsType, currentQuantity, deliveryPrice)
  return { quantity, shouldSyncQuantity: quantity !== currentQuantity }
}
