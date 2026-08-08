import { describe, expect, it } from 'vitest'
import { splitVatInclusive } from './vatRounding'

describe('VAT 포함 금액 표시 분리', () => {
  it.each([
    [330_000, true, { supply: 300_000, vat: 30_000, total: 330_000 }],
    [165_000, true, { supply: 150_000, vat: 15_000, total: 165_000 }],
    [11, true, { supply: 10, vat: 1, total: 11 }],
    [10, true, { supply: 9, vat: 1, total: 10 }],
    [1, true, { supply: 0, vat: 1, total: 1 }],
    [330_000, false, { supply: 330_000, vat: 0, total: 330_000 }],
  ])('총액 %s, 과세 여부 %s 는 공급가·VAT·총액을 보존한다', (amount, taxable, expected) => {
    expect(splitVatInclusive(amount, taxable)).toEqual(expected)
  })

  it('부분 배분도 VAT를 다시 더하지 않고 세 값의 항등식을 지킨다', () => {
    const result = splitVatInclusive(1_739_100 * 0.35, true)

    expect(result.total).toBe(608_685)
    expect(result.supply).toBe(553_350)
    expect(result.vat).toBe(55_335)
    expect(result.supply + result.vat).toBe(result.total)
  })
})
