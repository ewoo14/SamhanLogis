import { describe, expect, it } from 'vitest'
import {
  mergeEstimateRows,
  mergeOrderRows,
  filterSeparatedRows,
  paginateSeparatedRows,
  type WebPartnerOrderDraftListSource,
  type WebQuoteSnapshotListSource,
} from './estimateSourceSeparatedListModel'

const estimate = {
  id: 'estimate-1',
  estimateNo: '2026/08/13-1',
  estimateDate: '2026-08-13',
  status: 'QUOTE_DRAFT' as const,
  partnerName: '견적 거래처',
  totalAmount: '100000',
  requesterId: null,
  isDeleted: false,
}

const order = {
  orderNumber: 'O-2026-001',
  partnerCode: 'P-1',
  partnerName: '주문 거래처',
  submittedAt: null,
  createdAt: '2026-08-13T10:00:00',
  status: 'DRAFT' as const,
  totalAmount: 200000,
  isDeleted: false,
}

const webQuote: WebQuoteSnapshotListSource = {
  snapshotKey: 'quote-snapshot-1',
  documentLabel: '웹견적-001',
  custName: '웹 견적 거래처',
  created: '2026-08-13T11:00:00',
  totalAmount: '300000',
}

const webOrder: WebPartnerOrderDraftListSource = {
  draftKey: 'order-draft-1',
  documentLabel: '웹주문-001',
  partnerCode: 'P-2',
  partnerName: '웹 주문 거래처',
  createdAt: '2026-08-13T12:00:00',
  totalAmount: '400000',
}

describe('메뉴별 출처 분리 목록 모델', () => {
  it('작성자 표시는 정상 이름을 보존하고 UUID는 숨긴다', () => {
    const rows = mergeEstimateRows([
      { ...estimate, id: 'named-estimate', estimateNo: '2026/08/13-2', requesterName: '홍길동' },
      {
        ...estimate,
        id: 'uuid-estimate',
        estimateNo: '2026/08/13-3',
        requesterName: '00000000-0000-0000-0000-000000000001',
      },
    ])

    expect(rows.find((row) => row.id === 'estimate:named-estimate')?.owner).toBe('홍길동')
    expect(rows.find((row) => row.id === 'estimate:uuid-estimate')?.owner).toBeNull()
  })

  it('주문서 행은 견적서 목록에 0건이고 웹 종합견적서 저장분은 견적서 목록에 나온다', () => {
    const rows = mergeEstimateRows([estimate], [webQuote])

    expect(rows.map((row) => row.source)).toEqual(['web-quote-snapshot', 'estimate'])
    expect(rows.some((row) => row.documentNo === order.orderNumber)).toBe(false)
    expect(rows.every((row) => row.source === 'estimate' || row.source === 'web-quote-snapshot')).toBe(true)
  })

  it('웹 주문서 저장분은 주문서 목록에 나오고 견적서 저장분은 주문서 목록에 0건이다', () => {
    const rows = mergeOrderRows([order], [webOrder])

    expect(rows.map((row) => row.source)).toEqual(['web-partner-order-draft', 'order'])
    expect(rows.some((row) => row.documentNo === estimate.estimateNo)).toBe(false)
    expect(rows.every((row) => row.source === 'order' || row.source === 'web-partner-order-draft')).toBe(true)
  })

  it('웹 저장분 행은 출처 배지와 UUID 없는 상세 경로를 가진다', () => {
    const estimateRow = mergeEstimateRows([], [webQuote])[0]
    const orderRow = mergeOrderRows([], [webOrder])[0]

    expect(estimateRow.storageLabel).toBe('웹')
    expect(estimateRow.sourceLabel).toBe('종합견적서')
    expect(estimateRow.navigationPath).toBe('/sales/estimates/web-snapshots/quote-snapshot-1')
    expect(orderRow.storageLabel).toBe('웹')
    expect(orderRow.sourceLabel).toBe('주문서')
    expect(orderRow.navigationPath).toBe('/sales/partner-orders/web-drafts/order-draft-1')
  })

  it('검색은 각 탭의 데스크톱·웹 행 모두에 적용되고 페이지네이션은 검색 결과를 자른다', () => {
    const rows = mergeEstimateRows([estimate], [webQuote])
    const filtered = filterSeparatedRows(rows, '웹 견적')

    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.source).toBe('web-quote-snapshot')
    expect(paginateSeparatedRows(filtered, 0, 1)).toMatchObject({
      totalElements: 1,
      totalPages: 1,
      content: filtered,
    })
  })
})
