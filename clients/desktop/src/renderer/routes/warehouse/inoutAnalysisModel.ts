/** 입출고 내역에서 상품 정본을 모델별 복수 칩으로 변환한다. */
export const MODEL_CHIPS = ['실외기', '실내기', '홈멀티', '싱글중대형', '상업멀티', '판넬'] as const

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
}

export function withProfitFields(row: Omit<InOutAnalysisRow, 'profitAmount' | 'profitRate' | 'profitRateDisplay'>): InOutAnalysisRow {
  const profitAmount = row.purchaseAmount === null ? null : row.salesAmount - row.purchaseAmount
  const profitRate = row.purchaseAmount === null || row.purchaseAmount === 0
    ? null
    : (profitAmount! / row.purchaseAmount) * 100
  return {
    ...row,
    profitAmount,
    profitRate,
    profitRateDisplay: profitRate === null ? '—' : `${profitRate.toFixed(2)}%`,
  }
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
    return [...selectedChips].some((chip) => chips.has(chip))
  })
}
