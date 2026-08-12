import { describe, expect, it } from 'vitest'
import {
  filterUnifiedEstimateRowsBySource,
  mergeEstimateAndOrderRows,
  type UnifiedEstimateListRow,
} from './estimateUnifiedListModel'

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
        requesterName: '홍길동',
        isDeleted: false,
      }],
      [{
        orderNumber: '2026/08/08-1',
        partnerCode: 'P-1',
        partnerName: '주문 거래처',
        submittedAt: '2026-08-08T09:00:00',
        createdAt: '2026-08-01T09:00:00',
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
        storageLabel: '데스크톱',
        documentNo: '2026/08/08-1',
        partnerCode: 'P-1',
        amount: '220000',
        owner: null,
        writtenAt: '2026-08-01T09:00:00',
      }),
      expect.objectContaining<Partial<UnifiedEstimateListRow>>({
        source: 'estimate',
        sourceLabel: '종합견적서',
        storageLabel: '데스크톱',
        documentNo: '2026/08/07-1',
        amount: '110000',
        owner: '홍길동',
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
        createdAt: '2026-08-01T00:00:00',
        status: 'DRAFT' as const,
        totalAmount: 100,
        isDeleted: false,
      })),
    )

    expect(result).toHaveLength(47)
    expect(result.filter((row) => row.source === 'estimate')).toHaveLength(43)
    expect(result.filter((row) => row.source === 'order')).toHaveLength(4)
  })

  it('주문서의 발송일과 작성일을 분리해 통합 목록에는 작성일을 표시한다', () => {
    const result = mergeEstimateAndOrderRows(
      [],
      [{
        orderNumber: 'DRAFT-1',
        partnerCode: 'P-1',
        partnerName: '초안 거래처',
        submittedAt: null,
        createdAt: '2026-08-08T10:00:00',
        status: 'DRAFT',
        totalAmount: 100,
        isDeleted: false,
      } as never],
    )

    expect(result[0].writtenAt).toBe('2026-08-08T10:00:00')
  })

  it('모든 행에 저장 출처를 표시한다', () => {
    const result = mergeEstimateAndOrderRows(
      [{
        id: 'estimate-1', estimateNo: 'Q-1', estimateDate: '2026-08-01', status: 'QUOTE_DRAFT',
        partnerName: '데스크톱 견적', totalAmount: '100', requesterId: null, isDeleted: false,
      }],
      [{
        orderNumber: 'O-1', partnerCode: 'P-1', partnerName: '데스크톱 주문', submittedAt: null,
        createdAt: '2026-08-02T00:00:00', status: 'DRAFT', totalAmount: 200, isDeleted: false,
      }],
      [{ snapshotKey: 'snapshot-1', documentLabel: '웹견적-1', custName: '웹 종합', created: '2026-08-03T00:00:00', totalAmount: '300' }],
      [{ draftKey: 'draft-1', documentLabel: '웹주문-1', partnerCode: 'P-2', createdAt: '2026-08-04T00:00:00', totalAmount: '400' }],
    )

    expect(result).toHaveLength(4)
    expect(result.every((row) => row.sourceLabel.length > 0)).toBe(true)
    expect(result.map((row) => row.source)).toEqual(expect.arrayContaining([
      'estimate', 'order', 'web-quote-snapshot', 'web-partner-order-draft',
    ]))
  })

  it('출처로만 통합 목록 행을 필터링한다', () => {
    const rows = mergeEstimateAndOrderRows(
      [], [],
      [{ snapshotKey: 'snapshot-1', documentLabel: '웹견적-1', custName: null, created: '2026-08-03T00:00:00', totalAmount: '300' }],
      [{ draftKey: 'draft-1', documentLabel: '웹주문-1', partnerCode: 'P-2', createdAt: '2026-08-04T00:00:00', totalAmount: '400' }],
    )

    expect(filterUnifiedEstimateRowsBySource(rows, 'web-quote-snapshot')).toHaveLength(1)
    expect(filterUnifiedEstimateRowsBySource(rows, 'web-quote-snapshot')[0].source).toBe('web-quote-snapshot')
  })

  it('실측 웹 저장분 4건과 11건을 하나도 누락하지 않는다', () => {
    const rows = mergeEstimateAndOrderRows(
      [], [],
      Array.from({ length: 4 }, (_, index) => ({
        snapshotKey: `snapshot-${index}`, documentLabel: `웹견적-${index}`, custName: null,
        created: '2026-08-03T00:00:00', totalAmount: '300',
      })),
      Array.from({ length: 11 }, (_, index) => ({
        draftKey: `draft-${index}`, documentLabel: `웹주문-${index}`, partnerCode: `P-${index}`,
        createdAt: '2026-08-04T00:00:00', totalAmount: '400',
      })),
    )

    expect(rows).toHaveLength(15)
    expect(rows.filter((row) => row.source === 'web-quote-snapshot')).toHaveLength(4)
    expect(rows.filter((row) => row.source === 'web-partner-order-draft')).toHaveLength(11)
  })

  it('기존 estimates와 partner_orders 행을 하나도 잃지 않는다', () => {
    const rows = mergeEstimateAndOrderRows(
      Array.from({ length: 45 }, (_, index) => ({
        id: `estimate-${index}`, estimateNo: `Q-${index}`, estimateDate: '2026-08-01', status: 'QUOTE_DRAFT' as const,
        partnerName: '기존 견적', totalAmount: '100', requesterId: null, isDeleted: false,
      })),
      Array.from({ length: 7 }, (_, index) => ({
        orderNumber: `O-${index}`, partnerCode: `P-${index}`, partnerName: '기존 주문', submittedAt: null,
        createdAt: '2026-08-01T00:00:00', status: 'DRAFT' as const, totalAmount: 100, isDeleted: false,
      })),
      [], [],
    )

    expect(rows).toHaveLength(52)
    expect(rows.filter((row) => row.source === 'estimate')).toHaveLength(45)
    expect(rows.filter((row) => row.source === 'order')).toHaveLength(7)
  })
})
