import { describe, expect, it } from 'vitest'
import { resolveEstimateCatalogPrice } from './estimatePrice'

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
})
