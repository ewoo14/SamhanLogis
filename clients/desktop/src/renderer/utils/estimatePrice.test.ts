import { describe, expect, it } from 'vitest'
import { resolveEstimateCatalogPrice, resolveEstimateNewLinePrice, shouldApplyPartnerDcToEstimate } from './estimatePrice'

describe('견적 카탈로그 단가', () => {
  it('RED-A: 가격기억이 없는 거래처의 S=15%를 판매가 495000원에 적용한다', () => {
    expect(resolveEstimateCatalogPrice(495000, 15)).toEqual({
      unitPrice: 420750,
      appliedRate: 15,
    })
  })

  it('RED-B: S/M/L과 품목 고정값이 모두 미지정이면 판매가를 그대로 유지한다', () => {
    expect(resolveEstimateCatalogPrice(495000, null)).toEqual({
      unitPrice: 495000,
      appliedRate: 0,
    })
  })

  it('정액DC RED-A: 분류 정본 ONE_WAY를 판매가 316800원에 적용한다', () => {
    expect(resolveEstimateNewLinePrice({
      sellingPrice: 316800,
      modelCode: null,
      classificationOptions: ['ONE_WAY'],
      classificationAssigned: true,
      fixedDiscountRate: null,
      categoryKey: null,
      hasVariableDiscount: false,
    }, {
      homeMultiDc: null,
      commercialMultiDc: null,
      oneWay: '50000',
    })).toEqual({ unitPrice: 266800, appliedRate: 0 })
  })

  it('정액DC RED-B: 전환 대기 품목은 AC023BN1DBC1 레거시 판별을 적용한다', () => {
    expect(resolveEstimateNewLinePrice({
      sellingPrice: 316800,
      modelCode: 'AC023BN1DBC1',
      classificationOptions: [],
      classificationAssigned: false,
      fixedDiscountRate: null,
      categoryKey: null,
      hasVariableDiscount: false,
    }, {
      homeMultiDc: null,
      commercialMultiDc: null,
      oneWay: '50000',
    })).toEqual({ unitPrice: 266800, appliedRate: 0 })
  })

  it('RED-C: new estimate applies the 50,000 KRW 1way discount to AC023BN1DBC1', () => {
    expect(resolveEstimateNewLinePrice({
      sellingPrice: 316800,
      modelCode: 'AC023BN1DBC1',
      classificationOptions: [],
      classificationAssigned: false,
      fixedDiscountRate: null,
      categoryKey: null,
      hasVariableDiscount: false,
    }, {
      homeMultiDc: null,
      commercialMultiDc: null,
      oneWay: '50000',
    })).toEqual({ unitPrice: 266800, appliedRate: 0 })
  })

  it('RED-D: existing estimate hydration does not retroactively apply partner DC', () => {
    expect(shouldApplyPartnerDcToEstimate(false)).toBe(false)
  })

  it('keeps the catalog amount when the partner has no DC config', () => {
    expect(resolveEstimateNewLinePrice({
      sellingPrice: 316800,
      modelCode: 'AC023BN1DBC1',
      fixedDiscountRate: null,
      categoryKey: null,
      hasVariableDiscount: false,
    }, null)).toEqual({ unitPrice: 316800, appliedRate: 0 })
  })
})
