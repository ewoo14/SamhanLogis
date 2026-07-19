import { describe, expect, it } from 'vitest'
import { resolveAllocationPartner, type AllocationEditorRow } from './SlipLineAllocationEditor'

const baseRow: AllocationEditorRow = {
  sourceSlipId: 'source-slip-1',
  sourceSlipNo: '2026/05/20-1',
  sourceLineId: 'source-line-1',
  sourceLineNo: 1,
  productCode: 'SKU-1',
  productName: '품목 1',
  sourceQty: 1,
  sourceAmount: 100,
  allocatedQty: 1,
  allocatedAmount: 100,
  partnerId: 'partner-1',
  partnerCode: 'P-001',
  partnerName: '거래처 1',
}

describe('배분 원천 거래처 계약', () => {
  it.each(['partnerCode', 'partnerName'] as const)('원천 %s null은 저장 가능한 거래처로 해석하지 않는다', (field) => {
    const row = { ...baseRow, [field]: null } as AllocationEditorRow

    expect(resolveAllocationPartner([row])).toEqual({
      status: 'missing',
      message: '원천 전표의 거래처 정보가 없어 저장할 수 없습니다.',
    })
  })
})
