/** 견적 자동단가에 product-service가 반환한 유효 분류 정액DC를 적용한다. */
import { calculateSlipDiscount, type SlipDiscountConfig } from './slipDiscount'

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

export interface EstimateNewLinePriceInput {
  sellingPrice: number
  modelCode?: string | null
  fixedDiscountRate?: number | null
  categoryKey?: string | null
  hasVariableDiscount?: boolean | null
}

/** 신규 견적 라인에만 주문 화면과 동일한 거래처 DC 규칙을 적용한다. */
export function resolveEstimateNewLinePrice(
  input: EstimateNewLinePriceInput,
  config: SlipDiscountConfig | null,
): { unitPrice: number; appliedRate: number } {
  const category = input.categoryKey === 'homemulti'
    ? 'HOMEMULTI'
    : input.categoryKey === 'commercialMulti'
      ? 'COMMERCIAL_MULTI'
      : 'OTHER'
  const result = calculateSlipDiscount({
    listPrice: Number.isFinite(input.sellingPrice) ? input.sellingPrice : 0,
    modelCode: input.modelCode,
    fixedDiscountRate: input.fixedDiscountRate,
    category,
    hasVariableDiscount: input.hasVariableDiscount,
  }, config)
  return { unitPrice: Math.max(0, result.unitPrice), appliedRate: result.rate }
}

/** 기존 견적 hydrate에는 신규 작성용 거래처 DC 계산을 소급하지 않는다. */
export function shouldApplyPartnerDcToEstimate(isNewEstimate: boolean): boolean {
  return isNewEstimate
}
