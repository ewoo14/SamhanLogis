export type SlipDiscountCategory = 'HOMEMULTI' | 'COMMERCIAL_MULTI' | 'OTHER'

export interface SlipDiscountInput {
  listPrice: number
  modelCode?: string | null
  fixedDiscountRate?: number | null
  category: SlipDiscountCategory
  hasVariableDiscount?: boolean | null
}

export interface SlipDiscountConfig {
  homeMultiDc: string | null
  commercialMultiDc: string | null
  threeSixty?: string | null
  fourWay?: string | null
  oneWay?: string | null
  stand?: string | null
  deluxe?: string | null
  firstGrade?: string | null
}

export interface SlipDiscountResult {
  unitPrice: number
  rate: number
  source: 'FIXED' | 'GLOBAL' | 'OPTION' | 'NONE'
  info: string
}

export function calculateSlipDiscount(
  input: SlipDiscountInput,
  config: SlipDiscountConfig | null,
): SlipDiscountResult {
  const modelFlags = getModelFlags(input.modelCode)
  const optionDiscount = input.category === 'OTHER'
    ? [
        modelFlags.is360 ? parseAmount(config?.threeSixty) : 0,
        modelFlags.is4way ? parseAmount(config?.fourWay) : 0,
        modelFlags.is1way ? parseAmount(config?.oneWay) : 0,
        modelFlags.isStand ? parseAmount(config?.stand) : 0,
        modelFlags.isDeluxe ? parseAmount(config?.deluxe) : 0,
        modelFlags.isGrade1 ? parseAmount(config?.firstGrade) : 0,
      ].reduce((sum, amount) => sum + amount, 0)
    : 0
  const fixed = input.fixedDiscountRate
  if (fixed != null && Number.isFinite(fixed) && fixed > 0) {
    const unitPrice = Math.max(0, Math.round(input.listPrice * (1 - fixed / 100) - optionDiscount))
    const optionInfo = optionDiscount > 0 ? ` + 거래처 싱글세트 정액DC ${optionDiscount}원 적용` : ''
    return { unitPrice, rate: fixed, source: 'FIXED', info: `품목 고정DC ${fixed}% 적용${optionInfo}` }
  }
  const raw = input.category === 'HOMEMULTI' && input.hasVariableDiscount === true
    ? config?.homeMultiDc
    : input.category === 'COMMERCIAL_MULTI' && input.hasVariableDiscount === true
      ? config?.commercialMultiDc
      : null
  const rate = raw == null ? 0 : Number(String(raw).replace('%', '').trim())
  if (!Number.isFinite(rate) || rate <= 0) {
    if (optionDiscount > 0) {
      return { unitPrice: Math.max(0, Math.round(input.listPrice) - optionDiscount), rate: 0, source: 'OPTION', info: `거래처 싱글세트 정액DC ${optionDiscount}원 적용` }
    }
    return { unitPrice: Math.round(input.listPrice), rate: 0, source: 'NONE', info: 'DC 없음' }
  }
  const unitPrice = Math.round(input.listPrice * (1 - rate / 100))
  return { unitPrice, rate, source: 'GLOBAL', info: `거래처 전역DC ${rate}% 적용` }
}

type ModelFlags = {
  is360: boolean
  is4way: boolean
  is1way: boolean
  isStand: boolean
  isDeluxe: boolean
  isGrade1: boolean
}

/** 레거시 종합견적서 getModelFlags(model)의 분기·순서를 그대로 재현한다. */
function getModelFlags(model: string | null | undefined): ModelFlags {
  const m = String(model || '').toUpperCase()
  let is360 = false
  let is4way = false
  let is1way = false
  let isStand = false
  let isDeluxe = false
  let isGrade1 = false

  if (m.startsWith('AC') && m.length >= 9) {
    if (m[7] === '6' && m[8] === 'P') is360 = true
    if (m[7] === '4' && (m[8] === 'P' || m[8] === 'D')) is4way = true
    if (m[7] === '1' && (m[8] === 'P' || m[8] === 'D')) is1way = true
  }
  if (m.startsWith('AP') && m.length >= 9) {
    if (m.length >= 11 && m[10] === 'C') {
      if (m[8] === 'D') isStand = true
    } else if (m[8] === 'P') {
      isStand = true
    }
    if (m.length >= 11 && m[8] === 'D' && m[10] === 'H') isDeluxe = true
    if (m.startsWith('AP230') || m.startsWith('AP290')) {
      isStand = true
      isDeluxe = false
    }
  }
  if ((m.startsWith('AC') || m.startsWith('AP')) && m.length >= 9 && m[8] === 'F') {
    isGrade1 = true
  }
  return { is360, is4way, is1way, isStand, isDeluxe, isGrade1 }
}

function parseAmount(raw: string | null | undefined): number {
  if (raw == null || String(raw).trim() === '') return 0
  const amount = Number(String(raw).replace(/[^\d.-]/g, ''))
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0
}
