import { describe, expect, it } from 'vitest'
import {
  isWebVisibleExposure,
  projectCategorySettings,
  type CategorySettingSource,
} from './categorySettingsMigration'

describe('카테고리별 설정 이전 계약', () => {
  it('초기 투영은 343세트의 수량·세 설정을 한 행도 바꾸지 않는다', () => {
    const source: CategorySettingSource[] = Array.from({ length: 343 }, (_, index) => ({
      bundleProductCode: `SET-${index}`,
      componentProductCode: `PART-${index}`,
      estimateCategory: 'SINGLE_SET',
      defaultQty: 2,
      qtyMode: 'FOLLOW_SET',
      componentKind: 'ACCESSORY',
      componentVariant: '기본',
      componentShape: null,
      isDefault: true,
    }))

    expect(projectCategorySettings(source)).toEqual(source)
    expect(projectCategorySettings(source).filter((row) => row.defaultQty !== 2)).toHaveLength(0)
  })

  it('설정 전용 exposure는 웹 노출 목록에 포함되지 않는다', () => {
    expect(isWebVisibleExposure({ usageScope: 'ESTIMATE', configurationOnly: true })).toBe(false)
    expect(isWebVisibleExposure({ usageScope: 'ESTIMATE', configurationOnly: false })).toBe(true)
  })
})
