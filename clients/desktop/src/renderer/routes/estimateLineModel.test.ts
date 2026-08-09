import { describe, expect, it } from 'vitest'
import {
  quantityAfterDeliveryPriceInput,
  resolvePriceInputQuantitySync,
} from './estimateLineModel'

describe('quantityAfterDeliveryPriceInput', () => {
  it('RED-A 원문: 비상품 라인에 납품가를 입력하면 수량이 1이 된다', () => {
    expect(quantityAfterDeliveryPriceInput('NON_GOODS', '3', '50000')).toBe('1')
  })

  it('RED-B 원문: 상품 라인의 기존 수량 동작은 하나도 바뀌지 않는다', () => {
    expect(quantityAfterDeliveryPriceInput('GOODS', '3', '50000')).toBe('3')
  })

  it('RED-C: 비상품 수량 자동 1은 공동편집 provider에도 동기화해야 한다', () => {
    expect(resolvePriceInputQuantitySync('NON_GOODS', '7', '12345')).toEqual({
      quantity: '1',
      shouldSyncQuantity: true,
    })
  })
})
