// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
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

function renderPage(initialEntries: string[] = ['/sales/estimates']) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>
        <EstimateListPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location-probe">{location.pathname}{location.search}</output>
}

function setTabPermissions({ estimates, orders }: { estimates: boolean; orders: boolean }) {
  canAccessMock.mockImplementation((pageCode: string) => {
    if (pageCode === 'estimates.list') return estimates
    if (pageCode === 'sales.partner-order.list') return orders
    return false
  })
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
    const estimateNo = within(row).getByText('2026/07/07-2')
    const badge = within(row).getByTestId('estimate-list-row-estimate-deleted-deleted-badge')

    expect(estimateNo.getAttribute('style') ?? '').toContain('line-through')
    expect(badge.textContent).toContain('삭제됨')
    expect(estimateNo.contains(badge)).toBe(false)

    for (const cellText of ['데스크톱', '삭제거래처', '₩110,000']) {
      const cell = within(row).getByText(cellText)
      expect(cell.getAttribute('style') ?? '').toContain('line-through')
    }
    expect(within(row).queryByText('2026-07-07')).toBeNull()

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

  it('견적서 관리에는 종합견적서와 주문서 탭만 있고 통합 목록 토글은 없다', async () => {
    renderPage()

    expect(await screen.findByRole('tab', { name: '종합견적서' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: '주문서' })).toBeTruthy()
    expect(screen.queryByTestId('estimate-list-unified-toggle')).toBeNull()
    expect(screen.queryByTestId('estimate-unified-list-table')).toBeNull()
  })

  it('종합견적서 탭은 데스크톱 견적과 웹 종합견적만 조회하고 웹 주문서는 조회하지 않는다', async () => {
    listEstimatesMock.mockResolvedValue(pageOf([estimateRow({ estimateNo: '2026/08/13-1' })]))
    listWebQuoteSnapshotSummariesMock.mockResolvedValue([
      { snapshotKey: 'quote-1', documentLabel: '웹-견적-1', custName: '웹 거래처', created: '2026-08-13T11:00:00', totalAmount: '300000' },
    ])
    listWebPartnerOrderDraftSummariesMock.mockResolvedValue([
      { draftKey: 'draft-1', documentLabel: '웹-주문-1', partnerCode: 'P-1', createdAt: '2026-08-13T12:00:00', totalAmount: '400000' },
    ])

    renderPage()

    const table = await screen.findByTestId('estimate-list-table')
    await waitFor(() => {
      expect(within(table).getByText('데스크톱')).toBeTruthy()
      expect(within(table).getByText('웹')).toBeTruthy()
      expect(within(table).getByText('2026/08/13-1')).toBeTruthy()
      expect(within(table).getByText('웹-견적-1')).toBeTruthy()
      expect(within(table).queryByText('웹-주문-1')).toBeNull()
    })
    expect(listWebQuoteSnapshotSummariesMock).toHaveBeenCalled()
    expect(listWebPartnerOrderDraftSummariesMock).not.toHaveBeenCalled()
    expect(listPartnerOrdersMock).not.toHaveBeenCalled()
  })

  it('상태 필터는 데스크톱 견적에 서버측 적용되고 웹 저장분에는 적용되지 않음을 표시한다', async () => {
    const desktopDraft = estimateRow({ id: 'desktop-draft', estimateNo: '2026/08/13-1', status: 'QUOTE_DRAFT' })
    const desktopSent = estimateRow({ id: 'desktop-sent', estimateNo: '2026/08/13-2', status: 'QUOTE_SENT' })
    listEstimatesMock.mockImplementation(async (options = {}) => pageOf(
      options.status === 'QUOTE_DRAFT' ? [desktopDraft] : [desktopDraft, desktopSent],
    ))
    listWebQuoteSnapshotSummariesMock.mockResolvedValue([
      { snapshotKey: 'quote-1', documentLabel: '웹-견적-1', custName: '웹 거래처', created: '2026-08-13T11:00:00', totalAmount: '300000' },
    ])

    renderPage()

    const table = await screen.findByTestId('estimate-list-table')
    expect(await within(table).findByText('2026/08/13-2')).toBeTruthy()

    fireEvent.change(screen.getByTestId('estimate-list-filter-status'), { target: { value: 'QUOTE_DRAFT' } })

    await waitFor(() => {
      expect(within(table).getByText('2026/08/13-1')).toBeTruthy()
      expect(within(table).queryByText('2026/08/13-2')).toBeNull()
      expect(within(table).getByText('웹-견적-1')).toBeTruthy()
      expect(listEstimatesMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'QUOTE_DRAFT' }))
    })
    expect(screen.getByTestId('estimate-list-status-scope-note').textContent).toContain('데스크톱 견적에만 적용')
    expect(screen.getByTestId('estimate-list-status-scope-note').textContent).toContain('웹 종합견적서 저장분')
    expect(screen.getByTestId('estimate-list-status-scope-note').textContent).toContain('걸러지지 않습니다')
  })

  it('기간·삭제 필터는 종합견적서 탭에만 노출한다', async () => {
    renderPage()

    await screen.findByTestId('estimate-list-table')

    expect(screen.getByTestId('estimate-list-filter-start')).toBeTruthy()
    expect(screen.getByTestId('estimate-list-filter-end')).toBeTruthy()
    expect(screen.getByTestId('estimate-list-include-deleted')).toBeTruthy()
  })

  it('웹 종합견적서 조회가 실패해도 데스크톱 행은 남기고 부분 실패를 표시한다', async () => {
    listEstimatesMock.mockResolvedValue(pageOf([estimateRow({ estimateNo: '2026/08/13-2' })]))
    listWebQuoteSnapshotSummariesMock.mockRejectedValue(new Error('web quote unavailable'))

    renderPage()

    const table = await screen.findByTestId('estimate-list-table')
    expect(await within(table).findByText('2026/08/13-2')).toBeTruthy()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('웹 종합견적서')
    expect(alert.textContent).toContain('불러오지 못했습니다')
  })

  it('웹 종합견적서 행은 UUID가 아닌 opaque snapshot key 상세 경로로 열린다', async () => {
    listWebQuoteSnapshotSummariesMock.mockResolvedValue([
      { snapshotKey: '2026-08-13T11:00:00', documentLabel: '웹-견적-상세', custName: '웹 거래처', created: '2026-08-13T11:00:00', totalAmount: '300000' },
    ])

    renderPage()

    const row = await screen.findByTestId('estimate-list-row-web-quote:2026-08-13T11:00:00')
    fireEvent.click(row)

    expect(navigateMock).toHaveBeenCalledWith(
      '/sales/estimates/web-snapshots/2026-08-13T11%3A00%3A00',
      expect.objectContaining({ state: expect.objectContaining({ returnEntryKey: expect.any(String) }) }),
    )
  })

  it('주문서 탭은 웹 주문서만 조회하고 견적 계열은 조회하지 않는다', async () => {
    listWebPartnerOrderDraftSummariesMock.mockResolvedValue([
      { draftKey: 'draft-1', documentLabel: '웹-주문-1', partnerCode: 'P-1', createdAt: '2026-08-13T12:00:00', totalAmount: '400000' },
    ])

    renderPage(['/sales/estimates?tab=orders'])

    const orderTab = await screen.findByRole('tab', { name: '주문서' })
    expect(orderTab.getAttribute('aria-selected')).toBe('true')
    const table = await screen.findByTestId('estimate-list-table')
    await waitFor(() => {
      expect(within(table).getByText('웹-주문-1')).toBeTruthy()
      expect(within(table).queryByText('종합견적서')).toBeNull()
    })
    expect(listWebPartnerOrderDraftSummariesMock).toHaveBeenCalled()
    expect(listEstimatesMock).not.toHaveBeenCalled()
    expect(listWebQuoteSnapshotSummariesMock).not.toHaveBeenCalled()
    expect(listPartnerOrdersMock).not.toHaveBeenCalled()
  })

  it('지원하지 않는 주문서 필터는 숨기고 웹 주문서 API에는 필터를 보내지 않는다', async () => {
    renderPage(['/sales/estimates?tab=orders&status=QUOTE_SENT&startDate=2026-08-01&endDate=2026-08-13&includeDeleted=true'])

    await screen.findByTestId('estimate-list-table')
    await waitFor(() => expect(listWebPartnerOrderDraftSummariesMock).toHaveBeenCalledWith())

    expect(screen.queryByTestId('estimate-list-filter-status')).toBeNull()
    expect(screen.queryByTestId('estimate-list-filter-start')).toBeNull()
    expect(screen.queryByTestId('estimate-list-filter-end')).toBeNull()
    expect(screen.queryByTestId('estimate-list-include-deleted')).toBeNull()
  })

  it.each([
    {
      name: 'RED-A estimates.list 만',
      permissions: { estimates: true, orders: false },
      initialEntry: '/sales/estimates?tab=orders',
      expectedTabs: ['종합견적서'],
      expectedLocation: '/sales/estimates',
    },
    {
      name: 'RED-B sales.partner-order.list 만',
      permissions: { estimates: false, orders: true },
      initialEntry: '/sales/estimates',
      expectedTabs: ['주문서'],
      expectedLocation: '/sales/estimates?tab=orders',
    },
    {
      name: 'RED-D 두 권한 모두',
      permissions: { estimates: true, orders: true },
      initialEntry: '/sales/estimates',
      expectedTabs: ['종합견적서', '주문서'],
      expectedLocation: '/sales/estimates',
    },
  ])('$name 계정은 접근 가능한 탭만 정확히 렌더링한다', async ({ permissions, initialEntry, expectedTabs, expectedLocation }) => {
    setTabPermissions(permissions)

    renderPage([initialEntry])

    await screen.findByTestId('estimate-list-table')
    await waitFor(() => {
      expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(expectedTabs)
      expect(screen.getByTestId('location-probe').textContent).toBe(expectedLocation)
    })
  })

  it.each([
    {
      name: 'estimates.list 만 계정의 주문서 URL',
      permissions: { estimates: true, orders: false },
      initialEntry: '/sales/estimates?tab=orders',
      expectedTabs: ['종합견적서'],
      expectedLocation: '/sales/estimates',
      forbiddenApi: 'orders',
    },
    {
      name: 'sales.partner-order.list 만 계정의 종합견적서 URL',
      permissions: { estimates: false, orders: true },
      initialEntry: '/sales/estimates?tab=estimates',
      expectedTabs: ['주문서'],
      expectedLocation: '/sales/estimates?tab=orders',
      forbiddenApi: 'estimates',
    },
  ])('RED-E $name은 권한 없는 탭 내용과 API에 도달하지 않는다', async ({ permissions, initialEntry, expectedTabs, expectedLocation, forbiddenApi }) => {
    setTabPermissions(permissions)

    renderPage([initialEntry])

    await screen.findByTestId('estimate-list-table')
    await waitFor(() => {
      expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(expectedTabs)
      expect(screen.getByTestId('location-probe').textContent).toBe(expectedLocation)
    })
    if (forbiddenApi === 'orders') {
      expect(listWebPartnerOrderDraftSummariesMock).not.toHaveBeenCalled()
      expect(screen.queryByText('등록된 주문서가 없습니다.')).toBeNull()
    } else {
      expect(listEstimatesMock).not.toHaveBeenCalled()
      expect(screen.queryByText('등록된 종합견적서가 없습니다.')).toBeNull()
    }
  })
})
