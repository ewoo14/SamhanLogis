import { describe, expect, it } from 'vitest'
import { applyServerPrices } from '../serverPriceAuthority'

describe('주문 전송 행의 서버 가격 권위', () => {
  it.each([
    {
      name: 'AR-CH01 단품',
      items: [{ model: 'AR-CH01', qty: 1, price: 61600 }],
      lines: [{ modelCode: 'AR-CH01', quantity: 1, finalPrice: 36960 }],
      expected: [36960],
    },
    {
      name: 'AJ060MXHNBC1 + AXJ-YA2512 2품목',
      items: [
        { model: 'AJ060MXHNBC1', qty: 1, price: 1986735 },
        { model: 'AXJ-YA2512', qty: 1, price: 995365 },
      ],
      lines: [
        { modelCode: 'AJ060MXHNBC1', quantity: 1, finalPrice: 1324489 },
        { modelCode: 'AXJ-YA2512', quantity: 1, finalPrice: 251547 },
      ],
      expected: [1324489, 251547],
    },
  ])('$name의 확인창/전송 행 가격을 서버 최종 단가로 통일한다', ({ items, lines, expected }) => {
    const authoritative = applyServerPrices(items, {
      lines,
      totalFinalAmount: expected.reduce((sum, price, index) => sum + price * Number(items[index]?.qty ?? 0), 0),
    })

    expect(authoritative.map((item) => item.price)).toEqual(expected)
    expect(authoritative.map((item) => item.qty * item.price)).toEqual(expected)
  })
})
