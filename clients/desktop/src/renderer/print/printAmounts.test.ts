import { describe, expect, it } from 'vitest'
import { storedLineAmounts } from './printAmounts'

describe('저장 권위 금액 인쇄 계약', () => {
  it('저장된 비표준 S/V/T를 재계산하지 않고 그대로 반환한다', () => {
    expect(storedLineAmounts({
      supplyAmount: '100005',
      vatAmount: '9999',
      lineTotal: '110004',
    })).toEqual({ supply: 100005, vat: 9999, total: 110004 })
  })

  it('저장된 비표준 공급가액과 세액의 합계를 인쇄 합계로 사용한다', () => {
    expect(storedLineAmounts({
      supplyAmount: 100000,
      vatAmount: 9999,
      lineTotal: 100000,
    }).total).toBe(109999)
  })

  it('표준 10% 전표도 공급가액과 세액을 더한 합계를 사용한다', () => {
    expect(storedLineAmounts({
      supplyAmount: 100000,
      vatAmount: 10000,
      lineTotal: 100000,
    }).total).toBe(110000)
  })
})
