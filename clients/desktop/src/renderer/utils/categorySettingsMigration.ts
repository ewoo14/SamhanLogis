/**
 * 카테고리별 설정 이전의 공통 계약.
 *
 * 구성품·납품가는 기초품목(bundle_component)의 정본으로 남고,
 * 이 모델은 카테고리별 수량동기화·옵션·품목구분의 초기 투영만 표현한다.
 */
export interface CategorySettingSource {
  bundleProductCode: string
  componentProductCode: string
  estimateCategory: string
  defaultQty: number
  qtyMode: string
  componentKind: string
  componentVariant: string | null
  componentShape: string | null
  isDefault: boolean
}

/** 초기 이전은 값을 정규화하거나 축약하지 않고 부모 세트 축을 보존한다. */
export function projectCategorySettings<T extends CategorySettingSource>(
  source: readonly T[],
): T[] {
  return source.map((row) => ({ ...row }))
}

/** 설정 전용 행은 카탈로그 membership가 아니라 편집용 설정 문맥이다. */
export function isWebVisibleExposure(exposure: {
  usageScope: string
  configurationOnly?: boolean
}): boolean {
  return exposure.configurationOnly !== true && exposure.usageScope !== 'NONE'
}
