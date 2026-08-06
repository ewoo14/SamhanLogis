/** 입출고 내역에서 상품 정본을 모델별 복수 칩으로 변환한다. */
export const MODEL_CHIPS = ['실외기', '실내기', '홈멀티', '싱글중대형', '상업멀티', '판넬', '미분류'] as const

export type ModelChip = (typeof MODEL_CHIPS)[number]

export interface ProductClassification {
  name: string | null | undefined
  productCategory: string | null | undefined
}

export interface InOutModelRow {
  modelCode: string
  productName: string
  productCategory?: string | null
  chips?: Set<ModelChip>
}

export interface InOutAnalysisRow extends InOutModelRow {
  inboundQuantity: number
  outboundQuantity: number
  purchaseAmount: number | null
  salesAmount: number
  readonly profitAmount: number | null
  readonly profitRate: number | null
  readonly profitRateDisplay: string
  monthly?: readonly InOutMonthlyPoint[]
}

export interface InOutMonthlyPoint {
  year: number
  month: number
  inboundQuantity: number
  outboundQuantity: number
}

export interface LegacyAnalysisPoint {
  month: number
  previousYearOutbound: number
  currentYearOutbound: number
}

export interface LegacyRankedModel {
  modelCode: string
  productName: string
  outboundQuantity: number
}

export interface LegacyRecommendation {
  text: string
  detail: string
}

export interface LegacyAnalysis {
  trend: LegacyAnalysisPoint[]
  forecast: { month: number; quantity: number }[]
  top3: LegacyRankedModel[]
  bottom3: LegacyRankedModel[]
  recommendations: LegacyRecommendation[]
  previousYear: number | null
  currentYear: number | null
  forecastRate: number
}

export function withProfitFields(row: Omit<InOutAnalysisRow, 'profitAmount' | 'profitRate' | 'profitRateDisplay'>): InOutAnalysisRow {
  const purchaseUnit = row.purchaseAmount === null || row.inboundQuantity === 0
    ? null
    : row.purchaseAmount / row.inboundQuantity
  const salesUnit = row.outboundQuantity === 0 ? null : row.salesAmount / row.outboundQuantity
  const unitProfit = purchaseUnit === null || salesUnit === null ? null : salesUnit - purchaseUnit
  const profitAmount = unitProfit === null ? null : unitProfit * row.outboundQuantity
  const profitRate = purchaseUnit === null || purchaseUnit === 0 || salesUnit === null
    ? null
    : (unitProfit! / purchaseUnit) * 100
  return {
    ...row,
    profitAmount,
    profitRate,
    profitRateDisplay: profitRate === null ? '—' : `${profitRate.toFixed(2)}%`,
  }
}

/**
 * 레거시 GAS Index.html:343-403의 분석 규칙을 월별 실측 행에 적용한다.
 * 현재 연도는 전달된 월 점 중 가장 큰 연도, 전년은 그 직전 연도로 정한다.
 */
export function deriveLegacyAnalysis(rows: readonly InOutAnalysisRow[]): LegacyAnalysis {
  const points = rows.flatMap((row) => row.monthly ?? [])
  const years = [...new Set(points.map((point) => point.year))].sort((a, b) => a - b)
  const currentYear = years.at(-1) ?? null
  const previousYear = currentYear === null ? null : currentYear - 1
  const previous = Array(12).fill(0) as number[]
  const current = Array(12).fill(0) as number[]
  for (const point of points) {
    if (point.year === previousYear) previous[point.month - 1] = (previous[point.month - 1] ?? 0) + point.outboundQuantity
    if (point.year === currentYear) current[point.month - 1] = (current[point.month - 1] ?? 0) + point.outboundQuantity
  }

  const trend = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    previousYearOutbound: previous[index] ?? 0,
    currentYearOutbound: current[index] ?? 0,
  }))
  let lastMonth = -1
  let totalPrevious = 0
  let totalCurrent = 0
  for (let index = 0; index < 12; index += 1) {
    if ((current[index] ?? 0) > 0) {
      lastMonth = index
      totalPrevious += previous[index] ?? 0
      totalCurrent += current[index] ?? 0
    }
  }
  const forecastRate = totalPrevious > 0 ? totalCurrent / totalPrevious : 1
  const forecast = Array.from({ length: 12 - (lastMonth + 1) }, (_, offset) => {
    const monthIndex = lastMonth + 1 + offset
    return { month: monthIndex + 1, quantity: Math.round((previous[monthIndex] ?? 0) * forecastRate) }
  })

  const aggregate = new Map<string, LegacyRankedModel & { inboundQuantity: number }>()
  for (const row of rows) {
    const existing = aggregate.get(row.modelCode)
    if (existing) {
      existing.inboundQuantity += row.inboundQuantity
      existing.outboundQuantity += row.outboundQuantity
    } else {
      aggregate.set(row.modelCode, {
        modelCode: row.modelCode,
        productName: row.productName,
        inboundQuantity: row.inboundQuantity,
        outboundQuantity: row.outboundQuantity,
      })
    }
  }
  // 레거시 Index.html:388-393의 Object.keys(outCounts)와 동일하게,
  // 출고량이 집계된 모델만 Top/Bottom 순위 모집단에 포함한다.
  const sorted = [...aggregate.values()]
    .filter((row) => row.outboundQuantity > 0)
    .sort((a, b) => b.outboundQuantity - a.outboundQuantity)
  const top3 = sorted.slice(0, 3).map(({ modelCode, productName, outboundQuantity }) => ({ modelCode, productName, outboundQuantity }))
  const bottom3 = sorted.slice(-3).reverse().map(({ modelCode, productName, outboundQuantity }) => ({ modelCode, productName, outboundQuantity }))
  const recommendations: LegacyRecommendation[] = []
  const first = top3.at(0)
  if (first) {
    const top = aggregate.get(first.modelCode)!
    recommendations.push(top.inboundQuantity - top.outboundQuantity <= 0
      ? { text: `${top.modelCode} 발주 권장`, detail: '출고량 대비 잔여 재고가 부족합니다.' }
      : { text: `${top.modelCode} 주력 상품`, detail: '현재 안정적인 재고를 보유 중입니다.' })
  }
  if (forecastRate > 1.1) {
    recommendations.push({ text: '전반적 수요 상승', detail: '작년 동기 대비 판매량이 증가하고 있습니다.' })
  }
  if (recommendations.length === 0) {
    recommendations.push({ text: '특이사항 없음', detail: '현재 조건에 해당하는 특별한 알림이 없습니다.' })
  }
  return { trend, forecast, top3, bottom3, recommendations, previousYear, currentYear, forecastRate }
}

/** 상품명 문자열과 상품 정본 대분류를 동시에 보존한다. */
export function modelChips(product: ProductClassification): Set<ModelChip> {
  const chips = new Set<ModelChip>()
  const name = product.name ?? ''
  if (name.includes('실외기')) chips.add('실외기')
  if (name.includes('실내기')) chips.add('실내기')
  if (name.includes('판넬') || name.includes('패널')) chips.add('판넬')

  if (product.productCategory === 'HOME_MULTI' || product.productCategory === 'homemulti') chips.add('홈멀티')
  if (product.productCategory === 'SINGLE_SET' || product.productCategory === 'singleSets') chips.add('싱글중대형')
  if (product.productCategory === 'COMMERCIAL_MULTI' || product.productCategory === 'commercialMulti') chips.add('상업멀티')
  return chips
}

/** 선택 칩이 없으면 전체를 유지하고, 선택 시에는 분류 집합의 OR로 거른다. */
export function filterInOutRows<T extends InOutModelRow>(
  rows: T[],
  selectedChips: ReadonlySet<ModelChip>,
): T[] {
  if (selectedChips.size === 0) return rows
  return rows.filter((row) => {
    const chips = row.chips ?? modelChips({ name: row.productName, productCategory: row.productCategory })
    // 분류 근거가 없는 행은 '미분류'에서만 보존한다. 특정 분류 칩에
    // 근거 없이 섞지 않아, 칩 선택이 실제 모집단을 좁히도록 한다.
    if (chips.size === 0) return selectedChips.has('미분류')
    return [...selectedChips].some((chip) => chips.has(chip))
  })
}
