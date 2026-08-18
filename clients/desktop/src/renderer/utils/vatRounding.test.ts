import { describe, expect, it } from 'vitest'
import {
  calculateVatInclusiveAmounts,
  formatVatAmount,
  splitVatInclusive,
  splitVatInclusiveFromQtyUnitPrice,
} from './vatRounding'

describe('VAT 포함 금액 표시 분리', () => {
  it.each([
    [330_000, true, { supply: 300_000, vat: 30_000, total: 330_000 }],
    [165_000, true, { supply: 150_000, vat: 15_000, total: 165_000 }],
    [11, true, { supply: 10, vat: 1, total: 11 }],
    [10, true, { supply: 9, vat: 1, total: 10 }],
    [110005, true, { supply: 100005, vat: 10000, total: 110005 }],
    [1, true, { supply: 1, vat: 0, total: 1 }],
    [330_000, false, { supply: 330_000, vat: 0, total: 330_000 }],
  ])('총액 %s, 과세 여부 %s 는 공급가·VAT·총액을 보존한다', (amount, taxable, expected) => {
    expect(splitVatInclusive(amount, taxable)).toEqual(expected)
  })

  it('절사와 갈리는 110005원도 레거시 HALF_UP 공급가와 차액 VAT를 사용한다', () => {
    expect(splitVatInclusive(110005, true)).toEqual({ supply: 100005, vat: 10000, total: 110005 })
  })

  it('가격수정 중에도 소수 경계 단가의 총액축 금액을 레거시와 동일하게 낸다', () => {
    expect(calculateVatInclusiveAmounts('616975', 3)).toEqual({
      supply: '1682659',
      vat: '168266',
      total: '1850925',
    })
  })

  it('부분 배분도 VAT를 다시 더하지 않고 세 값의 항등식을 지킨다', () => {
    const result = splitVatInclusive(1_739_100 * 0.35, true)

    expect(result.total).toBe(608_685)
    expect(result.supply).toBe(553_350)
    expect(result.vat).toBe(55_335)
    expect(result.supply + result.vat).toBe(result.total)
  })

  it('부분 배분 preview는 제출 qty×unitPrice인 서버 lineTotal과 일치한다', () => {
    expect(splitVatInclusiveFromQtyUnitPrice('2.08', '434775', true)).toEqual({
      supply: 822_120,
      vat: 82_212,
      total: 904_332,
    })
  })

  it('330,000원 정수 경계는 공급가 300,000원과 VAT 30,000원을 유지한다', () => {
    expect(splitVatInclusiveFromQtyUnitPrice('1', '330000', true)).toEqual({
      supply: 300_000,
      vat: 30_000,
      total: 330_000,
    })
  })

  it('소수 수량의 서버 lineTotal 소수 둘째 자리를 보존한다', () => {
    expect(splitVatInclusiveFromQtyUnitPrice('0.08', '434788', true)).toEqual({
      supply: 31_621,
      vat: 3_162.04,
      total: 34_783.04,
    })
  })

  it('서버가 보존한 원 미만 VAT를 표시에서 잃지 않는다', () => {
    expect(formatVatAmount(3_163.04)).toBe('3,163.04')
    expect(formatVatAmount(30_000)).toBe('30,000')
  })
})
