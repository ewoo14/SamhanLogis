import { describe, expect, it } from 'vitest'
import { buildMergedPreview } from './mergePreview'
import type { PartnerOrderDetail } from '../../api/sales'

const order = (orderNumber: string, deliveryAddress: string, lines: PartnerOrderDetail['lines']): PartnerOrderDetail => ({
  orderNumber,
  partnerCode: 'P-1',
  partnerName: '거래처 A',
  status: 'DRAFT',
  isDeleted: false,
  mergeEligible: true,
  bizCode: 'B-1',
  updatedAt: '',
  deliveryAddress,
  siteAddress: null,
  contactPhone: null,
  dueDate: '2026-08-20',
  memo: '첫 주문 메모',
  lines,
  totalAmount: 0,
})

const line = (modelCode: string, deliveryPrice: number, quantity: number, lineId: string) => ({
  productId: `product-${lineId}`,
  lineId,
  modelCode,
  productName: modelCode,
  quantity,
  deliveryPrice,
  subtotal: deliveryPrice * quantity,
  convertedQuantity: 0,
  remark: null,
  bundleMode: null,
  expandedComponents: [],
})

describe('buildMergedPreview', () => {
  it('uses the first header and merges only equal model and price at the later row position', () => {
    const result = buildMergedPreview([
      order('O-1', '첫 배송지', [line('M-1', 100, 2, '1'), line('M-2', 100, 1, '2')]),
      order('O-2', '버려지는 배송지', [line('M-1', 100, 3, '3'), line('M-2', 200, 4, '4')]),
    ])

    expect(result.header?.deliveryAddress).toBe('첫 배송지')
    expect(result.lines.map((item) => [item.modelCode, item.deliveryPrice, item.quantity])).toEqual([
      ['M-1', 100, 5],
      ['M-2', 100, 1],
      ['M-2', 200, 4],
    ])
    expect(result.lines[0]?.sourceOrderNumbers).toEqual(['O-1', 'O-2'])
  })
})
