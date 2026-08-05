import { describe, expect, it } from 'vitest'
import { calculateSlipDiscount } from './slipDiscount'

describe('slip discount', () => {
  it('전역DC 거래처의 고정DC 없는 홈멀티는 561600원으로 계산하고 설명을 남긴다', () => {
    expect(calculateSlipDiscount(
      { listPrice: 1080000, fixedDiscountRate: null, category: 'HOMEMULTI' },
      { homeMultiDc: '48%', commercialMultiDc: '49%' },
    )).toEqual({ unitPrice: 561600, rate: 48, source: 'GLOBAL', info: '거래처 전역DC 48% 적용' })
  })

  it('고정DC가 전역DC보다 우선한다', () => {
    expect(calculateSlipDiscount(
      { listPrice: 1617000, fixedDiscountRate: 40, category: 'HOMEMULTI' },
      { homeMultiDc: '48%', commercialMultiDc: '49%' },
    ).unitPrice).toBe(970200)
  })

  it('전역DC 없는 거래처는 정가를 유지한다', () => {
    expect(calculateSlipDiscount(
      { listPrice: 100000, fixedDiscountRate: null, category: 'HOMEMULTI' },
      null,
    ).unitPrice).toBe(100000)
  })
})
