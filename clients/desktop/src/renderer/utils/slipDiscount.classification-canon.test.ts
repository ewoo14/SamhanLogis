import { describe, expect, it } from 'vitest'
import { calculateSlipDiscount } from './slipDiscount'

const config = {
  homeMultiDc: null,
  commercialMultiDc: null,
  threeSixty: '30000',
  fourWay: '40000',
  oneWay: '10000',
  stand: '10000',
  deluxe: '20000',
  firstGrade: '5000',
}

describe('#1090 분류 단독 정본 RED', () => {
  it('분류가 미분류면 모델코드 레거시 판별을 사용하지 않는다', () => {
    const result = calculateSlipDiscount({
      listPrice: 100000,
      modelCode: 'AC060CS6PBH1SY',
      category: 'OTHER',
      classificationOptions: [],
    } as any, config)

    expect(result.unitPrice).toBe(100000)
  })

  it('분류의 360 옵션만으로 정액을 적용한다', () => {
    const result = calculateSlipDiscount({
      listPrice: 100000,
      modelCode: 'UNCLASSIFIED-MODEL',
      category: 'OTHER',
      classificationOptions: ['THREE_SIXTY'],
    } as any, config)

    expect(result.unitPrice).toBe(70000)
  })

  it('교집합 0을 보존하기 위해 저장된 구형 플래그와 모델코드를 무시한다', () => {
    const result = calculateSlipDiscount({
      listPrice: 100000,
      modelCode: 'AP123456P',
      category: 'OTHER',
      classificationOptions: [],
      legacyDiscountFlag: true,
      discountFlags: '000100',
    } as any, config)

    expect(result.unitPrice).toBe(100000)
  })

  it('대표 품목의 정본 전환 전후 견적·주문 금액이 보존된다', () => {
    const beforeUnitPrice = 100000 - 10000
    const after = calculateSlipDiscount({
      listPrice: 100000,
      modelCode: 'AP123456P',
      category: 'OTHER',
      classificationOptions: ['STAND'],
    } as any, config)

    expect(after.unitPrice).toBe(beforeUnitPrice)
    expect(after.unitPrice).toBe(90000)
  })
})
