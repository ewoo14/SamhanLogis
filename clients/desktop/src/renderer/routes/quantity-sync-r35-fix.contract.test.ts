import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

const pageSource = () => read('./EstimateItemsCatalogPage.tsx')

describe('PR #1126 R35 fix — D15 양방향 가시성 및 target picker', () => {
  it('RED-A: 실 규칙 fixture의 target 행에 나를 부르는 본체와 rule key를 읽기 전용으로 표시한다', () => {
    const source = pageSource()
    const fixture = {
      ruleKey: 'UI_HOME_MULTI_AM052BN6PBH1',
      source: 'AM052BN6PBH1',
      target: 'PC6NUDK1NW',
      otherTargets: ['AWR-WE13N', 'FH-LFHLN'],
    }

    expect(fixture.ruleKey).toBe('UI_HOME_MULTI_AM052BN6PBH1')
    expect(fixture.source).toBe('AM052BN6PBH1')
    expect(fixture.target).toBe('PC6NUDK1NW')
    expect(fixture.otherTargets).toEqual(['AWR-WE13N', 'FH-LFHLN'])
    expect(source).toContain('quantitySyncInboundSourcesForModel')
    expect(source).toContain('quantity-sync-inbound')
    expect(source).toContain('rule.ruleKey')
    expect(source).toContain('readOnly')
  })

  it('RED-A: 본체 행의 기존 세 target 칩과 저장 진입점을 유지한다', () => {
    const source = pageSource()

    expect(source).toContain('target.multiplier')
    expect(source).toContain('selectedQuantityTargets.map')
    expect(source).toContain('수량 동기화 저장')
  })

  it('RED-B: picker는 서버가 계산한 target eligibility만 사용한다', () => {
    const source = pageSource()
    const pickerStart = source.indexOf('const searchQuantitySyncProducts')
    const pickerEnd = source.indexOf('const handleDragEnd', pickerStart)
    const picker = source.slice(pickerStart, pickerEnd)

    expect(source).toContain('quantitySyncTargetEligible')
    expect(picker).toContain('filterQuantitySyncTargetProducts')
    expect(picker).toContain('listProducts')
    expect(picker).not.toContain("productCategory === 'MATERIAL'")
  })

  it('RED-B: 서버 target 역할 계약을 단일 응답 필드로 전달한다', () => {
    const response = read('../../../../../services/product-service/src/main/java/com/samhanair/logis/product/web/dto/ProductCatalogResponse.java')

    expect(response).toContain('quantitySyncTargetEligible')
    expect(response).toContain('QuantitySyncRuleValidator.isValidTargetRole')
  })
})
