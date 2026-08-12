// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EstimateListPage } from './EstimateListPage'
import {
  listEstimates,
  restoreEstimate,
  type EstimateSummary,
} from '../api/estimateApi'
import { listPartnerOrders, type PartnerOrderSummary } from '../api/sales'
import { listWebPartnerOrderDraftSummaries, listWebQuoteSnapshotSummaries } from '../api/estimateSourceApi'
import { useCollectionRealtime } from '../realtime/useCollectionRealtime'

const navigateMock = vi.fn()
const canAccessMock = vi.fn(() => true)

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigateMock,
  }
})
/*
  it('웹 저장분의 출처를 표시하고 출처 필터로 분리한다', async () => {
    listEstimatesMock.mockResolvedValue(pageOf([estimateRow({ id: 'desktop-estimate' })]))
    listPartnerOrdersMock.mockResolvedValue(orderPageOf([orderRow({ orderNumber: 'desktop-order' })]))
    listWebQuoteSnapshotSummariesMock.mockResolvedValue([
      { snapshotKey: 'snapshot-1', documentLabel: '웹견적-1', custName: '웹 거래처', created: '2026-08-03T00:00:00', totalAmount: '300' },
    ])
    listWebPartnerOrderDraftSummariesMock.mockResolvedValue([
      { draftKey: 'draft-1', documentLabel: '웹주문-1', partnerCode: 'P-WEB', createdAt: '2026-08-04T00:00:00', totalAmount: '400' },
    ])

    renderPage()
    fireEvent.click(await screen.findByTestId('estimate-list-unified-toggle'))

    const table = await screen.findByTestId('estimate-unified-list-table')
    await waitFor(() => {
      expect(within(table).getByText('웹 종합견적서')).toBeTruthy()
      expect(within(table).getByText('웹 주문서')).toBeTruthy()
      expect(within(table).getByText('데스크톱 견적서')).toBeTruthy()
      expect(within(table).getByText('데스크톱 주문서')).toBeTruthy()
    })

    fireEvent.change(screen.getByTestId('estimate-list-source-filter'), { target: { value: 'web-quote-snapshot' } })
    await waitFor(() => {
      expect(within(table).getByText('웹 종합견적서')).toBeTruthy()
      expect(within(table).queryByText('웹 주문서')).toBeNull()
      expect(within(table).queryByText('데스크톱 견적서')).toBeNull()
    })
  })
})

*/
vi.mock('../hooks/usePermissions', () => ({
  usePermissions: () => ({ canAccess: canAccessMock }),
}))

vi.mock('../realtime/useCollectionRealtime', () => ({
  useCollectionRealtime: vi.fn(),
}))

vi.mock('../api/estimateApi', async () => {
  const actual = await vi.importActual<typeof import('../api/estimateApi')>('../api/estimateApi')
  return {
    ...actual,
    listEstimates: vi.fn(),
    restoreEstimate: vi.fn(),
  }
})

vi.mock('../api/sales', async () => {
  const actual = await vi.importActual<typeof import('../api/sales')>('../api/sales')
  return { ...actual, listPartnerOrders: vi.fn() }
})

vi.mock('../api/estimateSourceApi', async () => {
  const actual = await vi.importActual<typeof import('../api/estimateSourceApi')>('../api/estimateSourceApi')
  return {
    ...actual,
    listWebPartnerOrderDraftSummaries: vi.fn(),
    listWebQuoteSnapshotSummaries: vi.fn(),
  }
})

const listEstimatesMock = vi.mocked(listEstimates)
const restoreEstimateMock = vi.mocked(restoreEstimate)
const listPartnerOrdersMock = vi.mocked(listPartnerOrders)
const listWebQuoteSnapshotSummariesMock = vi.mocked(listWebQuoteSnapshotSummaries)
const listWebPartnerOrderDraftSummariesMock = vi.mocked(listWebPartnerOrderDraftSummaries)
const useCollectionRealtimeMock = vi.mocked(useCollectionRealtime)

afterEach(cleanup)

function estimateRow(overrides: Partial<EstimateSummary> = {}): EstimateSummary {
  return {
    id: 'estimate-1',
    estimateNo: '2026/07/07-1',
    estimateDate: '2026-07-07',
    seqNo: 1,
    status: 'QUOTE_DRAFT',
    partnerId: 'partner-1',
    partnerName: '삼한공조',
    partnerBusinessNo: '123-45-67890',
    validUntil: '2026-08-07',
    totalSupply: '100000',
    totalVat: '10000',
    totalAmount: '110000',
    convertedSlipId: null,
    sentAt: null,
    acceptedAt: null,
    convertedAt: null,
    requesterId: null,
    version: 0,
    isDeleted: false,
    deletedAt: null,
    deletedByName: null,
    restoreAvailable: true,
    ...overrides,
  }
}

function pageOf(content: EstimateSummary[]) {
  return {
    content,
    totalElements: content.length,
    totalPages: 1,
    number: 0,
    size: 50,
    first: true,
    last: true,
  }
}

function orderRow(overrides: Partial<PartnerOrderSummary> = {}): PartnerOrderSummary {
  return {
    orderNumber: '2026-08-08-1',
    partnerCode: 'P-1',
    partnerName: '주문 거래처',
    submittedAt: '2026-08-08T09:00:00',
    status: 'DRAFT',
    slipPublishStatus: 'NOT_REQUIRED',
    totalAmount: 220000,
    linkedSlipNo: null,
    isDeleted: false,
    ...overrides,
  }
}

function orderPageOf(content: PartnerOrderSummary[]) {
  return {
    content,
    totalElements: content.length,
    totalPages: 1,
    number: 0,
    size: 10000,
    first: true,
    last: true,
  }
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <EstimateListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('EstimateListPage E2 list realtime and restore', () => {
  beforeEach(() => {
    navigateMock.mockReset()
    canAccessMock.mockReset()
    canAccessMock.mockReturnValue(true)
    useCollectionRealtimeMock.mockReset()
    listEstimatesMock.mockReset()
    restoreEstimateMock.mockReset()
    listPartnerOrdersMock.mockReset()
    listWebQuoteSnapshotSummariesMock.mockReset()
    listWebPartnerOrderDraftSummariesMock.mockReset()
    restoreEstimateMock.mockResolvedValue(undefined)
    listEstimatesMock.mockResolvedValue(pageOf([estimateRow()]))
    listPartnerOrdersMock.mockResolvedValue(orderPageOf([]))
    listWebQuoteSnapshotSummariesMock.mockResolvedValue([])
    listWebPartnerOrderDraftSummariesMock.mockResolvedValue([])
  })

  it('견적 목록 coarse SSE 키로 realtime invalidate를 구독한다', async () => {
    renderPage()

    await screen.findByTestId('estimate-list-table')

    expect(useCollectionRealtimeMock).toHaveBeenCalledWith(
      expect.anything(),
      'list',
      [['estimates', 'list']],
    )
  })

  it('기본 목록은 삭제행을 제외하고 토글을 켰을 때만 삭제행을 조회한다', async () => {
    listEstimatesMock.mockResolvedValue(pageOf([estimateRow()]))
    renderPage()

    await screen.findByTestId('estimate-list-include-deleted')
    expect(listEstimatesMock).toHaveBeenLastCalledWith(expect.not.objectContaining({ includeDeleted: true }))

    fireEvent.click(screen.getByTestId('estimate-list-include-deleted'))
    await waitFor(() => expect(listEstimatesMock).toHaveBeenLastCalledWith(expect.objectContaining({ includeDeleted: true })))
  })

  it('슬래시 문서번호 견적 행 클릭은 404가 아닌 단일 상세 경로로 이동한다', async () => {
    listEstimatesMock.mockResolvedValue(pageOf([estimateRow({
      id: '2026/08/10-9',
      estimateNo: '2026/08/10-9',
    })]))

    renderPage()

    const row = await screen.findByTestId('estimate-list-row-2026/08/10-9')
    fireEvent.click(row)

    expect(navigateMock).toHaveBeenCalledWith(
      '/sales/estimates/2026%2F08%2F10-9',
      expect.objectContaining({ state: expect.objectContaining({ returnEntryKey: expect.any(String) }) }),
    )
  })

  it('견적번호는 UUID가 아닌 문서번호 상세로 가는 하이퍼링크다', async () => {
    renderPage()

    const link = await screen.findByRole('link', { name: /2026\/07\/07-1/ })
    expect(link.getAttribute('href')).toBe('/sales/estimates/estimate-1')
  })

  it('삭제 포함 목록은 다음 페이지로 이동하고 토글을 끄면 첫 활성 페이지로 돌아온다', async () => {
    listEstimatesMock.mockImplementation(async (options) => ({
      ...pageOf([estimateRow({ id: options.includeDeleted ? `deleted-${options.page}` : `active-${options.page}` })]),
      totalElements: options.includeDeleted ? 101 : 1,
      totalPages: options.includeDeleted ? 3 : 1,
      number: options.page ?? 0,
      size: options.size ?? 50,
      first: (options.page ?? 0) === 0,
      last: (options.page ?? 0) === (options.includeDeleted ? 2 : 0),
    }))

    renderPage()
    const toggle = await screen.findByTestId('estimate-list-include-deleted')
    fireEvent.click(toggle)
    fireEvent.click((await screen.findAllByTestId('estimate-list-next-page')).at(-1)!)

    await waitFor(() => expect(listEstimatesMock).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, includeDeleted: true })))
    fireEvent.click((await screen.findAllByTestId('estimate-list-next-page')).at(-1)!)
    await waitFor(() => expect(listEstimatesMock).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, includeDeleted: true })))
    fireEvent.click(toggle)
    await waitFor(() => expect(listEstimatesMock).toHaveBeenLastCalledWith(expect.objectContaining({ page: 0 })))
    expect(listEstimatesMock).toHaveBeenLastCalledWith(expect.not.objectContaining({ includeDeleted: true }))
  })

  it('삭제행은 모든 데이터 열에 취소선 처리하고 삭제 배지는 견적번호 취소선 span 바깥 형제로 렌더하며 행 클릭을 막는다', async () => {
    listEstimatesMock.mockResolvedValue(pageOf([
      estimateRow({
        id: 'estimate-deleted',
        estimateNo: '2026/07/07-2',
        partnerName: '삭제거래처',
        isDeleted: true,
        deletedByName: '이운영',
        deletedAt: '2026-07-07T08:10:00',
      }),
    ]))

    renderPage()

    const row = await screen.findByTestId('estimate-list-row-estimate-deleted')
    const estimateNo = within(row).getByTestId('estimate-list-row-estimate-deleted-number')
    const badge = within(row).getByTestId('estimate-list-row-estimate-deleted-deleted-badge')

    expect(estimateNo.getAttribute('style') ?? '').toContain('line-through')
    expect(badge.textContent).toContain('삭제: 이운영')
    expect(estimateNo.contains(badge)).toBe(false)
    expect(badge.parentElement).toBe(estimateNo.parentElement)

    // STEP4 HIGH-1 fix(#759): estimateNo 1열만이 아니라 partnerBusinessNo/partnerName/
    // estimateDate/validUntil/totalAmount 나머지 데이터 열도 모두 취소선 처리한다
    // (주문(C) SalesPartnerOrderListPage 미러 정합).
    for (const cellText of ['1234567890', '삭제거래처', '2026-07-07', '2026-08-07', '₩110,000']) {
      const cell = within(row).getByText(cellText)
      expect(cell.getAttribute('style') ?? '').toContain('line-through')
    }

    // 공유 DataTable 은 현재 삭제행에 aria-disabled 를 설정하지 않는다 — 클릭 차단은
    // rowClickable(false → onClick 미부착) + onRowClick isDeleted 가드로 처리한다
    // (특정 커밋 SHA 비의존, 공유 DataTable 컴포넌트 계약 기준). 클릭 차단은 아래
    // navigate 미호출로 실증한다(#759 병합 정합).
    fireEvent.click(row)

    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('복원 버튼은 행 클릭으로 전파되지 않고 BE 한국어 에러 메시지를 danger 배너에 표시한다', async () => {
    listEstimatesMock.mockResolvedValue(pageOf([
      estimateRow({
        id: 'estimate-deleted',
        estimateNo: '2026/07/07-2',
        isDeleted: true,
        deletedByName: '이운영',
        deletedAt: '2026-07-07T08:10:00',
      }),
    ]))
    restoreEstimateMock.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 409,
        data: { message: '이미 사용 중인 견적번호로 활성 견적이 존재하여 복원할 수 없습니다' },
      },
    })

    renderPage()

    const button = await screen.findByTestId('estimate-list-row-estimate-deleted-restore')
    fireEvent.click(button)

    await waitFor(() => expect(restoreEstimateMock.mock.calls[0]?.[0]).toBe('estimate-deleted'))
    expect(navigateMock).not.toHaveBeenCalled()

    const alert = await screen.findByTestId('estimate-list-restore-error')
    expect(alert.textContent).toContain('이미 사용 중인 견적번호')
    expect(alert.getAttribute('style') ?? '').toContain('var(--color-danger-700, #991B1B)')
  })

  it('복원 불가 삭제행은 복원 버튼을 노출하지 않는다', async () => {
    listEstimatesMock.mockResolvedValue(pageOf([
      estimateRow({
        id: 'qa-residue',
        isDeleted: true,
        restoreAvailable: false,
      }),
    ]))

    renderPage()

    const row = await screen.findByTestId('estimate-list-row-qa-residue')
    expect(within(row).queryByTestId('estimate-list-row-qa-residue-restore')).toBeNull()
  })

  it('통합 보기에서 두 계열의 API 행을 한 목록에 누락 없이 표시한다', async () => {
    const estimateCount = 2
    const orderCount = 1
    listEstimatesMock.mockResolvedValue(pageOf(
      Array.from({ length: estimateCount }, (_, index) => estimateRow({
        id: `estimate-${index}`,
        estimateNo: `Q-${index}`,
      })),
    ))
    listPartnerOrdersMock.mockResolvedValue(orderPageOf(
      Array.from({ length: orderCount }, (_, index) => orderRow({
        orderNumber: `O-${index}`,
        partnerCode: `P-${index}`,
      })),
    ))

    renderPage()
    fireEvent.click(await screen.findByTestId('estimate-list-unified-toggle'))

    const table = await screen.findByTestId('estimate-unified-list-table')
    await waitFor(() => {
      expect(within(table).getAllByText('종합견적서')).toHaveLength(estimateCount)
      expect(within(table).getAllByText('주문서')).toHaveLength(orderCount)
      expect(within(table).getAllByText('P-0')).toHaveLength(1)
    })
  })

  it('통합 보기에는 담당 열이 있고 계열이 보유하지 않는 값은 빈칸으로 둔다', async () => {
    listEstimatesMock.mockResolvedValue(pageOf([estimateRow({ id: 'estimate-without-code', requesterName: '홍길동' })]))
    listPartnerOrdersMock.mockResolvedValue(orderPageOf([orderRow({ partnerCode: '' })]))

    renderPage()
    fireEvent.click(await screen.findByTestId('estimate-list-unified-toggle'))

    const table = await screen.findByTestId('estimate-unified-list-table')
    await waitFor(() => expect(within(table).getByText('담당')).toBeTruthy())

    expect(table.textContent).not.toContain('—')
    expect(within(table).getByTestId('estimate-unified-row-estimate:estimate-without-code-owner').textContent).toBe('홍길동')
    expect(within(table).getByTestId('estimate-unified-row-order:2026-08-08-1-owner').textContent).toBe('')
  })

  it('통합 보기에서 한 계열 조회가 실패해도 다른 계열을 표시하고 오류를 드러낸다', async () => {
    listPartnerOrdersMock.mockRejectedValue(new Error('partner-order unavailable'))

    renderPage()
    fireEvent.click(await screen.findByTestId('estimate-list-unified-toggle'))

    const table = await screen.findByTestId('estimate-unified-list-table')
    await waitFor(() => expect(within(table).getAllByText('종합견적서')).toHaveLength(1))
    expect((await screen.findByTestId('estimate-unified-list-error')).textContent).toContain('주문서')
  })

  it('통합 보기에서 후속 페이지가 실패해도 먼저 받은 페이지와 불완전 표시를 보존한다', async () => {
    listEstimatesMock.mockImplementation(async (options) => {
      if (options.size === 10000 && options.page === 1) {
        throw new Error('estimate page 2 unavailable')
      }
      if (options.size === 10000) {
        return { ...pageOf([estimateRow({ id: 'estimate-page-1', estimateNo: '2026/08/08-9001' })]), totalPages: 2 }
      }
      return pageOf([estimateRow()])
    })

    renderPage()
    fireEvent.click(await screen.findByTestId('estimate-list-unified-toggle'))

    const table = await screen.findByTestId('estimate-unified-list-table')
    await waitFor(() => expect(within(table).getByText('2026/08/08-9001')).toBeTruthy())
    expect((await screen.findByTestId('estimate-unified-list-error')).textContent).toContain('종합견적서')
  })
})
