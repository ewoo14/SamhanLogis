import { describe, expect, it } from 'vitest'
import {
  filterQuantitySyncTargetProducts,
  quantitySyncInboundSourcesForModel,
} from './EstimateItemsCatalogPage'

describe('PR #1126 R35 fix — 실행 가능한 D15 RED/GREEN', () => {
  it('RED-A: target 행은 활성 rule의 source와 rule key를 inbound로 받는다', () => {
    const rules = [{
      ruleKey: 'UI_HOME_MULTI_AM052BN6PBH1',
      estimateCategory: 'HOME_MULTI',
      name: '표본',
      enabled: true,
      aggregation: 'SUM',
      when: {},
      inactiveBehavior: 'ZERO',
      conflictPolicy: 'REPLACE',
      priority: 1000,
      legacyRef: 'UI:HOME_MULTI',
      sources: [{ productCode: 'AM052BN6PBH1', productName: '본체', factor: 1 }],
      targets: [
        { productCode: 'PC6NUDK1NW', productName: '판넬', multiplier: 1 },
        { productCode: 'AWR-WE13N', productName: '리모컨', multiplier: 1 },
        { productCode: 'FH-LFHLN', productName: '호스', multiplier: 1 },
      ],
    }] as const

    const inbound = quantitySyncInboundSourcesForModel([...rules], 'PC6NUDK1NW')

    expect(inbound).toHaveLength(1)
    expect(inbound[0]?.source.productCode).toBe('AM052BN6PBH1')
    expect(inbound[0]?.rule.ruleKey).toBe('UI_HOME_MULTI_AM052BN6PBH1')
  })

  it('RED-B: 서버가 인정한 target만 picker 후보가 되고 거부된 품목은 계속 제외된다', () => {
    const rows = [
      {
        modelCode: 'PC6NUDK1NW',
        name: '판넬',
        status: 'ACTIVE',
        quantitySyncTargetEligible: true,
      },
      {
        modelCode: 'INDOOR-MATERIAL',
        name: '실내기',
        status: 'ACTIVE',
        productCategory: 'MATERIAL',
        quantitySyncTargetEligible: false,
      },
      {
        modelCode: 'PANEL-NON-GOODS',
        name: '비상품 판넬',
        status: 'ACTIVE',
        quantitySyncTargetEligible: false,
      },
    ]

    const options = filterQuantitySyncTargetProducts(rows as never)

    expect(options.map((option) => option.modelCode)).toEqual(['PC6NUDK1NW'])
  })
})
