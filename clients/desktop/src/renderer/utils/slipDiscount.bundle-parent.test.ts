import { describe, expect, it } from 'vitest'
import { calculateBundleParentDiscount } from './slipDiscount'

describe('bundle parent discount during partner repricing', () => {
  it('uses delivery_price and the legacy 360 option DC for an AC bundle', () => {
    expect(calculateBundleParentDiscount({
      listPrice: 1660000,
      modelCode: 'AC060CS6PBH1SY',
      categoryKey: 'singleSets',
      fixedDiscountRate: null,
      classificationOptions: ['THREE_SIXTY'],
      hasVariableDiscount: true,
    }, {
      homeMultiDc: null,
      commercialMultiDc: null,
      threeSixty: '₩70,000',
    })).toMatchObject({
      unitPrice: 1590000,
      source: 'OPTION',
    })
  })

  it('does not apply the option DC when the classification is unassigned', () => {
    expect(calculateBundleParentDiscount({
      listPrice: 1660000,
      modelCode: 'AM360AXVGHC1SY',
      categoryKey: 'singleSets',
      fixedDiscountRate: null,
      hasVariableDiscount: true,
    }, {
      homeMultiDc: null,
      commercialMultiDc: null,
      threeSixty: '₩70,000',
    }).unitPrice).toBe(1660000)
  })

  it('keeps fixed-DC precedence for bundle parents', () => {
    expect(calculateBundleParentDiscount({
      listPrice: 1617000,
      modelCode: 'AC060CS6PBH1SY',
      categoryKey: 'homemulti',
      fixedDiscountRate: 40,
      hasVariableDiscount: false,
    }, {
      homeMultiDc: '48%',
      commercialMultiDc: '49%',
      threeSixty: '₩70,000',
    }).unitPrice).toBe(970200)
  })
})
