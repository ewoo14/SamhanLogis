import { describe, expect, it } from 'vitest'
import { buildDailyClosingAccountingSlipRequest } from './dailyClosingAccountingSlip'

describe('일마감 회계전표 요청 변환', () => {
  it('출고 원본행을 매출 회계전표 요청으로 변환한다', () => {
    const request = buildDailyClosingAccountingSlipRequest({
      sourceKind: 'SALES_SLIP',
      slipDate: '2026-08-14',
      slipId: 'slip-1',
      slipNo: '2026/08/14-1',
      lineId: 'line-1',
      sourceLineNo: 1,
      partnerId: 'partner-1',
      partnerCode: 'P-1',
      partnerName: '거래처',
      productCode: 'MODEL-1',
      productName: '품목',
      quantity: 2,
      unitPriceWithVat: 1100,
      total: 2200,
      taxType: 'TAXABLE',
    })

    expect(request.kind).toBe('SALES')
    expect(request.body.lines[0]?.allocations[0]).toMatchObject({
      sourceSlipId: 'slip-1',
      sourceSlipNo: '2026/08/14-1',
      sourceLineId: 'line-1',
      sourceLineNo: 1,
      allocatedQty: '2',
      allocatedAmount: '2200',
    })
  })

  it.each([
    ['매출', 'SALES_SLIP'],
    ['매입', 'PURCHASE_SLIP'],
  ] as const)('%s 원천행의 일마감·line·allocation 금액을 원천 total로 통일한다', (_, sourceKind) => {
    const request = buildDailyClosingAccountingSlipRequest({
      sourceKind,
      slipDate: '2026-08-14',
      slipId: 'slip-amount',
      slipNo: '2026/08/14-2',
      lineId: 'line-amount',
      sourceLineNo: 1,
      partnerId: 'partner-1',
      partnerCode: 'P-1',
      partnerName: '거래처',
      productCode: 'MODEL-1',
      productName: '품목',
      quantity: 1,
      unitPriceWithVat: 10000,
      total: 11000,
      taxType: 'TAXABLE',
    })

    const line = request.body.lines[0]!
    expect(line.unitPrice).toBe('11000')
    expect(line.allocations[0]!.allocatedAmount).toBe('11000')
  })

  it('이미 회계반영된 원본행은 생성 요청으로 변환하지 않는다', () => {
    expect(() => buildDailyClosingAccountingSlipRequest({
      sourceKind: 'PURCHASE_SLIP',
      slipDate: '2026-08-14',
      slipId: 'slip-1',
      slipNo: '2026/08/14-1',
      lineId: 'line-1',
      sourceLineNo: 1,
      partnerId: 'partner-1',
      partnerCode: 'P-1',
      partnerName: '거래처',
      productCode: 'MODEL-1',
      productName: '품목',
      quantity: 2,
      unitPriceWithVat: 1100,
      taxType: 'TAXABLE',
      accountingPostedAt: '2026-08-14T10:00:00',
    })).toThrow('이미 회계전표가 반영된 전표입니다')
  })
})
