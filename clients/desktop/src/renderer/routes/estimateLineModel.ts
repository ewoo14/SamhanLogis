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
