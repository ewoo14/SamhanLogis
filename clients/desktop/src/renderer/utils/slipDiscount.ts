export type SlipDiscountCategory = 'HOMEMULTI' | 'COMMERCIAL_MULTI' | 'OTHER'

export interface SlipDiscountInput {
  listPrice: number
  fixedDiscountRate?: number | null
  category: SlipDiscountCategory
}

export interface SlipDiscountConfig {
  homeMultiDc: string | null
  commercialMultiDc: string | null
}

export interface SlipDiscountResult {
  unitPrice: number
  rate: number
  source: 'FIXED' | 'GLOBAL' | 'NONE'
  info: string
}

export function calculateSlipDiscount(
  input: SlipDiscountInput,
  config: SlipDiscountConfig | null,
): SlipDiscountResult {
  const fixed = input.fixedDiscountRate
  if (fixed != null && Number.isFinite(fixed) && fixed > 0) {
    const unitPrice = Math.round(input.listPrice * (1 - fixed / 100))
    return { unitPrice, rate: fixed, source: 'FIXED', info: `품목 고정DC ${fixed}% 적용` }
  }
  const raw = input.category === 'HOMEMULTI'
    ? config?.homeMultiDc
    : input.category === 'COMMERCIAL_MULTI'
      ? config?.commercialMultiDc
      : null
  const rate = raw == null ? 0 : Number(String(raw).replace('%', '').trim())
  if (!Number.isFinite(rate) || rate <= 0) {
    return { unitPrice: Math.round(input.listPrice), rate: 0, source: 'NONE', info: 'DC 없음' }
  }
  const unitPrice = Math.round(input.listPrice * (1 - rate / 100))
  return { unitPrice, rate, source: 'GLOBAL', info: `거래처 전역DC ${rate}% 적용` }
}
