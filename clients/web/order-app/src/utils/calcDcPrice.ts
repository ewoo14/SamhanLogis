/**
 * DC율 + 옵션 가산 가격 계산 — legacy `applyConfigFromServer` + 단가 산출 1:1.
 *
 * <p>출처:
 * <ul>
 *   <li>`migration/source/scripts/partner-order/index.html` line 1322 `applyConfigFromServer(cfg)`</li>
 *   <li>line 2399 홈멀티 단가 적용 (`DISCOUNT_RATE_HOME` × (1 - useRate))</li>
 *   <li>line 2513 상업멀티 단가 적용 (`DISCOUNT_RATE_COMM`)</li>
 *   <li>line 1338 `roundByConfig` (단위처리 — UNIT_ROUND_TO/MODE)</li>
 * </ul>
 *
 * <p>알고리즘:
 * 1. dcRate 결정 — HOME_MULTI 면 `homeMultiDc`, COMMERCIAL_MULTI 면 `commercialMultiDc`,
 *    SINGLE_SET / LEGACY 면 0 (legacy 동작 — DC 미적용 카테고리)
 * 2. dcAppliedPrice = round(releasePrice × (1 - dcRate))
 * 3. optionAdd = sum(option amount for each LineOption) — null 옵션은 0
 * 4. unitRounded = `roundByConfig(dcAppliedPrice + optionAdd)`
 *
 * <p>거래처 표시 (LinePriceDisplay):
 * - 출고가 (releasePrice) — 작은 회색 글씨 + 취소선 (정정 #12 — DC 보임)
 * - "DC -46%" 표기
 * - 옵션 가산 (있으면 "+₩70,000" 표기)
 * - 최종가 (finalPrice) — 굵은 검정 글씨
 */
import type { EstimateCategory, LineOption, PartnerDcConfig } from '../types'

export interface PriceBreakdown {
  /** 출고가 (마스터). */
  releasePrice: number
  /** 적용된 DC율 (0~1, 0 이면 미적용). */
  dcRate: number
  /** DC 적용 후 단가 (옵션 가산 전). */
  dcAppliedPrice: number
  /** 옵션 가산 합계 (음수 가능). */
  optionAdd: number
  /** 최종가 (단위처리까지 적용). */
  finalPrice: number
}

export interface CalcInput {
  releasePrice: number
  category: EstimateCategory
  options?: LineOption[] | undefined
  config?: PartnerDcConfig | null | undefined
}

/**
 * 라인 단위 가격 계산.
 *
 * @param input.releasePrice 출고가 (마스터, DC 전)
 * @param input.category EstimateCategory — HOME_MULTI / COMMERCIAL_MULTI / SINGLE_SET / LEGACY
 * @param input.options 선택된 옵션 (4way 등)
 * @param input.config 거래처 DC 설정 — 없으면 DC 미적용 (releasePrice 그대로)
 * @returns {@link PriceBreakdown}
 */
export function calcLineFinalPrice(input: CalcInput): PriceBreakdown {
  const { releasePrice, category, options = [], config } = input

  const dcRate = resolveDcRate(category, config ?? null)
  const dcAppliedPrice = Math.round(releasePrice * (1 - dcRate))
  const optionAdd = (options ?? []).reduce(
    (sum, opt) => sum + resolveOptionAmount(opt, config ?? null),
    0,
  )
  const finalPrice = roundByUnit(dcAppliedPrice + optionAdd, config?.unitProcessing ?? null)

  return {
    releasePrice,
    dcRate,
    dcAppliedPrice,
    optionAdd,
    finalPrice,
  }
}

/**
 * 카테고리별 DC율 결정 (legacy `DISCOUNT_RATE_HOME` / `DISCOUNT_RATE_COMM`).
 *
 * <p>SINGLE_SET / LEGACY 는 DC 미적용 (legacy partner-order 동작).
 */
export function resolveDcRate(
  category: EstimateCategory,
  config: PartnerDcConfig | null,
): number {
  if (!config) return 0
  if (category === 'HOME_MULTI') return clampRate(config.homeMultiDc)
  if (category === 'COMMERCIAL_MULTI') return clampRate(config.commercialMultiDc)
  return 0
}

/** 옵션별 가산 금액 결정 — null 이면 0. */
function resolveOptionAmount(opt: LineOption, config: PartnerDcConfig | null): number {
  if (!config) return 0
  switch (opt) {
    case '360':
      return num(config.option360)
    case '4way':
      return num(config.option4way)
    case '1way':
      return num(config.option1way)
    case 'stand':
      return num(config.optionStand)
    case 'deluxe':
      return num(config.optionDeluxe)
    case 'grade1':
      return num(config.option1Grade)
    default:
      return 0
  }
}

/**
 * 단위처리 라운드 (legacy `roundByConfig` 1:1).
 *
 * <p>`unitRoundTo` 단위로 ROUND. null 이면 원본 그대로.
 */
function roundByUnit(value: number, unitRoundTo: number | null): number {
  if (!unitRoundTo || unitRoundTo <= 0) return Math.round(value)
  return Math.round(value / unitRoundTo) * unitRoundTo
}

function clampRate(v: number | null): number {
  if (v === null || v === undefined || Number.isNaN(v)) return 0
  if (v < 0) return 0
  if (v > 0.99) return 0.99
  return v
}

function num(v: number | null): number {
  if (v === null || v === undefined || Number.isNaN(v)) return 0
  return v
}

/**
 * DC율을 % 표기 문자열로 (예: 0.46 → "-46%").
 */
export function formatDcRate(dcRate: number): string {
  if (!dcRate) return ''
  return `-${Math.round(dcRate * 100)}%`
}
