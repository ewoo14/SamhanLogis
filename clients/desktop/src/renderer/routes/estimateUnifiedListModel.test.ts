import { describe, expect, it } from 'vitest'
import { mergeEstimateAndOrderRows, type UnifiedEstimateListRow } from './estimateUnifiedListModel'

describe('통합 견적서 목록 모델', () => {
  it('종합견적서와 주문서를 한 목록으로 합치고 최신 작성일 순으로 정렬한다', () => {
    const result = mergeEstimateAndOrderRows(
      [{
        id: 'estimate-1',
        estimateNo: '2026/08/07-1',
        estimateDate: '2026-08-07',
        status: 'QUOTE_DRAFT',
        partnerName: '종합 거래처',
        totalAmount: '110000',
        requesterId: '00000000-0000-0000-0000-000000000001',
        isDeleted: false,
      }],
      [{
        orderNumber: '2026/08/08-1',
        partnerCode: 'P-1',
        partnerName: '주문 거래처',
        submittedAt: '2026-08-08T09:00:00',
        status: 'DRAFT',
        totalAmount: 220000,
        isDeleted: false,
      }],
    )

    expect(result.map((row) => row.source)).toEqual(['order', 'estimate'])
    expect(result).toEqual([
      expect.objectContaining<Partial<UnifiedEstimateListRow>>({
        source: 'order',
        sourceLabel: '주문서',
        documentNo: '2026/08/08-1',
        partnerCode: 'P-1',
        amount: '220000',
        writer: null,
      }),
      expect.objectContaining<Partial<UnifiedEstimateListRow>>({
        source: 'estimate',
        sourceLabel: '종합견적서',
        documentNo: '2026/08/07-1',
        amount: '110000',
        writer: null,
      }),
    ])
  })

  it('각 계열의 행을 누락시키지 않는다', () => {
    const result = mergeEstimateAndOrderRows(
      Array.from({ length: 43 }, (_, index) => ({
        id: `estimate-${index}`,
        estimateNo: `Q-${index}`,
        estimateDate: '2026-08-01',
        status: 'QUOTE_DRAFT' as const,
        partnerName: '거래처',
        totalAmount: '100',
        requesterId: null,
        isDeleted: false,
      })),
      Array.from({ length: 4 }, (_, index) => ({
        orderNumber: `O-${index}`,
        partnerCode: `P-${index}`,
        partnerName: '거래처',
        submittedAt: '2026-08-01T00:00:00',
        status: 'DRAFT' as const,
        totalAmount: 100,
        isDeleted: false,
      })),
    )

    expect(result).toHaveLength(47)
    expect(result.filter((row) => row.source === 'estimate')).toHaveLength(43)
    expect(result.filter((row) => row.source === 'order')).toHaveLength(4)
  })
})
