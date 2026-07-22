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
})
