export type SlipDiscountCategory = 'HOMEMULTI' | 'COMMERCIAL_MULTI' | 'OTHER'
export type ClassificationDiscountOption = 'THREE_SIXTY' | 'FOUR_WAY' | 'ONE_WAY' | 'STAND' | 'DELUXE' | 'FIRST_GRADE'

export interface SlipDiscountInput {
  listPrice: number
  modelCode?: string | null
  /** 분류 정본이 보유한 정액DC 옵션. 모델코드/저장 플래그로 추론하지 않는다. */
  classificationOptions?: ClassificationDiscountOption[] | null
  /** 분류 L/M/S가 아직 없는 전환 대기 품목인지 여부. 한시적 레거시 호환용. */
  classificationAssigned?: boolean
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

export interface BundleParentDiscountInput {
  listPrice: number
  modelCode?: string | null
  categoryKey?: string | null
  fixedDiscountRate?: number | null
  classificationOptions?: ClassificationDiscountOption[] | null
  classificationAssigned?: boolean
  hasVariableDiscount?: boolean | null
}

/** 세트 부모의 상품 메타데이터를 전표 할인 계산 입력으로 정규화한다. */
export function calculateBundleParentDiscount(
  input: BundleParentDiscountInput,
  config: SlipDiscountConfig | null,
): SlipDiscountResult {
  const category: SlipDiscountCategory = input.categoryKey === 'homemulti'
    ? 'HOMEMULTI'
    : input.categoryKey === 'commercialMulti'
      ? 'COMMERCIAL_MULTI'
      : 'OTHER'
  return calculateSlipDiscount({
    listPrice: input.listPrice,
    modelCode: input.modelCode,
    fixedDiscountRate: input.fixedDiscountRate,
    classificationOptions: input.classificationOptions,
    classificationAssigned: input.classificationAssigned,
    category,
    hasVariableDiscount: input.hasVariableDiscount,
  }, config)
}

export function calculateSlipDiscount(
  input: SlipDiscountInput,
  config: SlipDiscountConfig | null,
): SlipDiscountResult {
  const optionDiscount = input.category === 'OTHER'
    ? [
        hasOption(input, 'THREE_SIXTY') ? parseAmount(config?.threeSixty) : 0,
        hasOption(input, 'FOUR_WAY') ? parseAmount(config?.fourWay) : 0,
        hasOption(input, 'ONE_WAY') ? parseAmount(config?.oneWay) : 0,
        hasOption(input, 'STAND') ? parseAmount(config?.stand) : 0,
        hasOption(input, 'DELUXE') ? parseAmount(config?.deluxe) : 0,
        hasOption(input, 'FIRST_GRADE') ? parseAmount(config?.firstGrade) : 0,
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

/**
 * #1090 전환 전 데이터 호환 규칙.
 * 분류 정본이 아직 없는 품목에 한해 기존 모델코드 판별을 유지한다.
 * 품목에 분류가 저장되면 classificationAssigned=true가 되어 이 경로는 자동으로 걷힌다.
 */
function hasOption(input: SlipDiscountInput, option: ClassificationDiscountOption): boolean {
  if (input.classificationAssigned === false) return legacyModelFlags(input.modelCode).includes(option)
  return input.classificationOptions?.includes(option) === true
}

function legacyModelFlags(modelCode: string | null | undefined): ClassificationDiscountOption[] {
  const m = String(modelCode || '').toUpperCase()
  const flags: ClassificationDiscountOption[] = []
  if (m.startsWith('AC') && m.length >= 9) {
    if (m[7] === '6' && m[8] === 'P') flags.push('THREE_SIXTY')
    if (m[7] === '4' && (m[8] === 'P' || m[8] === 'D')) flags.push('FOUR_WAY')
    if (m[7] === '1' && (m[8] === 'P' || m[8] === 'D')) flags.push('ONE_WAY')
  }
  if (m.startsWith('AP') && m.length >= 9) {
    if (m.startsWith('AP230') || m.startsWith('AP290')) flags.push('STAND')
    else if (m.length >= 11 && m[10] === 'C' && m[8] === 'D') flags.push('STAND')
    else if (m[8] === 'P') flags.push('STAND')
    if (m.length >= 11 && m[8] === 'D' && m[10] === 'H'
      && !m.startsWith('AP230') && !m.startsWith('AP290')) flags.push('DELUXE')
  }
  if ((m.startsWith('AC') || m.startsWith('AP')) && m.length >= 9 && m[8] === 'F') {
    flags.push('FIRST_GRADE')
  }
  return flags
}

function parseAmount(raw: string | null | undefined): number {
  if (raw == null || String(raw).trim() === '') return 0
  const amount = Number(String(raw).replace(/[^\d.-]/g, ''))
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0
}
