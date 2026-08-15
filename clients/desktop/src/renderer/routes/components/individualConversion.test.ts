import { describe, expect, it, vi } from 'vitest'
import type { PartnerOrderDetail } from '../../api/sales'
import { runIndividualConversions } from './individualConversion'

const detail = (orderNumber: string): PartnerOrderDetail => ({
  orderNumber,
  partnerCode: 'P-1',
  partnerName: '테스트 거래처',
  submittedAt: null,
  status: 'DRAFT',
  slipPublishStatus: 'NOT_REQUIRED',
  totalAmount: 100,
  linkedSlipNo: null,
  bizCode: 'P-1',
  updatedAt: '2026-08-15T00:00:00Z',
  deliveryAddress: null,
  siteAddress: null,
  contactPhone: null,
  dueDate: null,
  memo: null,
  lines: [{
    productId: 'product-1',
    lineId: `line-${orderNumber}`,
    modelCode: 'M-1',
    productName: '상품',
    quantity: 3,
    deliveryPrice: 100,
    subtotal: 100,
    remark: null,
    convertedQuantity: 1,
    bundleMode: null,
    expandedComponents: [],
  }],
})

it('keeps successful conversions when a later order fails and reports each order', async () => {
  const convert = vi.fn()
    .mockResolvedValueOnce({ slipNo: '2026/05/31-1', orderStatus: 'CONVERTED', fullyConverted: true })
    .mockRejectedValueOnce(new Error('재고 부족'))

  const result = await runIndividualConversions(
    [detail('ORDER-1'), detail('ORDER-2')],
    'WH-1',
    convert,
  )

  expect(convert).toHaveBeenCalledTimes(2)
  expect(convert).toHaveBeenNthCalledWith(1, 'ORDER-1', {
    warehouseCode: 'WH-1',
    items: [{ orderLineId: 'line-ORDER-1', quantity: 2 }],
  })
  expect(result).toEqual([
    { orderNumber: 'ORDER-1', status: 'success', slipNo: '2026/05/31-1' },
    { orderNumber: 'ORDER-2', status: 'failed', reason: '재고 부족' },
  ])
})
