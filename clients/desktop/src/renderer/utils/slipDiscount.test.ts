import { describe, expect, it } from 'vitest'
import { calculateSlipDiscount } from './slipDiscount'

describe('slip discount', () => {
  it('전역DC 거래처의 고정DC 없는 홈멀티는 561600원으로 계산하고 설명을 남긴다', () => {
    expect(calculateSlipDiscount(
      { listPrice: 1080000, fixedDiscountRate: null, category: 'HOMEMULTI', hasVariableDiscount: true },
      { homeMultiDc: '48%', commercialMultiDc: '49%' },
    )).toEqual({ unitPrice: 561600, rate: 48, source: 'GLOBAL', info: '거래처 전역DC 48% 적용' })
  })

  it('고정DC가 전역DC보다 우선한다', () => {
    expect(calculateSlipDiscount(
      { listPrice: 1617000, fixedDiscountRate: 40, category: 'HOMEMULTI', hasVariableDiscount: false },
      { homeMultiDc: '48%', commercialMultiDc: '49%' },
    ).unitPrice).toBe(970200)
  })

  it('전역DC 없는 거래처는 정가를 유지한다', () => {
    expect(calculateSlipDiscount(
      { listPrice: 100000, fixedDiscountRate: null, category: 'HOMEMULTI', hasVariableDiscount: true },
      null,
    ).unitPrice).toBe(100000)
  })

  it('변동DC 비대상 품목은 물리 카테고리 키가 있어도 전역DC를 적용하지 않는다', () => {
    expect(calculateSlipDiscount(
      {
        listPrice: 204000,
        fixedDiscountRate: null,
        category: 'HOMEMULTI',
        hasVariableDiscount: false,
      },
      { homeMultiDc: '48%', commercialMultiDc: '49%' },
    )).toEqual({ unitPrice: 204000, rate: 0, source: 'NONE', info: 'DC 없음' })
  })
  it('global discount is authoritative even when a remembered price exists', () => {
    const result = calculateSlipDiscount(
      { listPrice: 1080000, fixedDiscountRate: null, category: 'HOMEMULTI', hasVariableDiscount: true },
      { homeMultiDc: '48%', commercialMultiDc: '49%' },
    )

    expect(result).toMatchObject({ unitPrice: 561600, source: 'GLOBAL', rate: 48 })
  })

  it('treats a zero fixed-DC value as unset so the global DC still applies', () => {
    expect(calculateSlipDiscount(
      { listPrice: 1080000, fixedDiscountRate: 0, category: 'HOMEMULTI', hasVariableDiscount: true },
      { homeMultiDc: '48%', commercialMultiDc: '49%' },
    )).toMatchObject({ unitPrice: 561600, source: 'GLOBAL', rate: 48 })
  })

  it.each([
    ['AC123456P', '360', 'THREE_SIXTY', 30000],
    ['AC123454P', '4way-P', 'FOUR_WAY', 40000],
    ['AC123454D', '4way-D', 'FOUR_WAY', 40000],
    ['AC123451P', '1way-P', 'ONE_WAY', 50000],
    ['AC123451D', '1way-D', 'ONE_WAY', 50000],
    ['AP123456D1C', 'stand-D+C', 'STAND', 60000],
    ['AP123456P', 'stand-P', 'STAND', 60000],
    ['AP123456D1H', 'deluxe-D+H', 'DELUXE', 70000],
    ['AP230123P', 'AP230 stand exception', 'STAND', 60000],
    ['AP290123P', 'AP290 stand exception', 'STAND', 60000],
    ['AC123456F', 'AC grade1', 'FIRST_GRADE', 80000],
    ['AP123456F', 'AP grade1', 'FIRST_GRADE', 80000],
  ])('분류 정본 %s (%s) 옵션만큼 싱글 정액을 차감한다', (modelCode, _branch, discountOption, amount) => {
    expect(calculateSlipDiscount(
      {
        listPrice: 1000000,
          modelCode,
          classificationOptions: [discountOption as any],
        fixedDiscountRate: null,
        category: 'OTHER',
        hasVariableDiscount: false,
      },
      {
        homeMultiDc: null,
        commercialMultiDc: null,
        threeSixty: '30,000',
        fourWay: '40,000',
        oneWay: '50,000',
        stand: '60,000',
        deluxe: '70,000',
        firstGrade: '80,000',
      },
    ).unitPrice).toBe(1000000 - amount)
  })

  it.each(['AC123456P', 'AP123456D1H'])('홈멀티/상업멀티 율 기반 품목에는 싱글 정액을 이중 적용하지 않는다: %s', (modelCode) => {
    expect(calculateSlipDiscount(
      {
        listPrice: 1000000,
        modelCode,
        fixedDiscountRate: null,
        category: 'HOMEMULTI',
        hasVariableDiscount: true,
      },
      {
        homeMultiDc: '48%',
        commercialMultiDc: '49%',
        threeSixty: '30000',
        stand: '60000',
        deluxe: '70000',
      },
    ).unitPrice).toBe(520000)
  })

  it.each(['AC12345', 'ZZ123456P', '', null])('짧거나 AC/AP가 아닌 모델코드는 정액을 적용하지 않는다: %s', (modelCode) => {
    expect(calculateSlipDiscount(
      {
        listPrice: 1000000,
        modelCode,
        fixedDiscountRate: null,
        category: 'OTHER',
        hasVariableDiscount: false,
      },
      { homeMultiDc: null, commercialMultiDc: null, stand: '60000' },
    )).toMatchObject({ unitPrice: 1000000, source: 'NONE', rate: 0 })
  })

  it('싱글 정액이 없는 거래처는 종전 정가를 유지한다', () => {
    expect(calculateSlipDiscount(
      {
        listPrice: 1000000,
        modelCode: 'AC123456P',
        fixedDiscountRate: null,
        category: 'OTHER',
        hasVariableDiscount: false,
      },
      { homeMultiDc: null, commercialMultiDc: null, threeSixty: null, fourWay: null, oneWay: null, stand: null, deluxe: null, firstGrade: null },
    )).toMatchObject({ unitPrice: 1000000, source: 'NONE', rate: 0 })
  })
})
