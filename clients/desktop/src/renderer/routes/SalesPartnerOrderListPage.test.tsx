// @vitest-environment jsdom

import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { PartnerOrderSummary } from '../api/sales'

const mocks = vi.hoisted(() => ({
  listPartnerOrders: vi.fn(),
  restorePartnerOrder: vi.fn(),
  canAccess: vi.fn(() => true),
}))

vi.mock('@samhan/design-system', () => ({
  safeActorName: (value: string | null | undefined) => value === 'system' ? '시스템' : value,
  Badge: ({ children, ...props }: { children: React.ReactNode } & Record<string, unknown>) => (
    <span {...props}>{children}</span>
  ),
  OrderNumberDisplay: ({ orderNumber, ...props }: { orderNumber: string } & Record<string, unknown>) => (
    <span {...props}>{orderNumber}</span>
  ),
  OrderStatusBadge: ({ status, ...props }: { status: string } & Record<string, unknown>) => (
    <span {...props} data-status={status}>{status}</span>
  ),
  Button: ({ children, ...props }: { children: React.ReactNode } & Record<string, unknown>) => (
    <button {...props}>{children}</button>
  ),
  DataTable: ({
    columns,
    rows,
    rowTestId,
  }: {
    columns: Array<{ key: string; render: (row: PartnerOrderSummary) => React.ReactNode }>
    rows: PartnerOrderSummary[]
    rowTestId: (row: PartnerOrderSummary) => string
  }) => (
    <div data-testid="partner-order-table">
      {rows.map((row) => (
        <div key={rowTestId(row)} data-testid={rowTestId(row)}>
          {columns.map((column) => (
            <div key={column.key}>{column.render(row)}</div>
          ))}
        </div>
      ))}
    </div>
  ),
  Input: ({ inputSize: _inputSize, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { inputSize?: string }) => (
    <input {...props} />
  ),
  Select: ({ selectSize: _selectSize, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { selectSize?: string }) => (
    <select {...props} />
  ),
}))

vi.mock('../api/sales', async () => {
  const actual = await vi.importActual<typeof import('../api/sales')>('../api/sales')
  return {
    ...actual,
    listPartnerOrders: mocks.listPartnerOrders,
    restorePartnerOrder: mocks.restorePartnerOrder,
  }
})
vi.mock('../hooks/usePermissions', () => ({ usePermissions: () => ({ canAccess: mocks.canAccess }) }))
vi.mock('../realtime/useCollectionRealtime', () => ({ useCollectionRealtime: vi.fn() }))
vi.mock('../realtime/PartnerOrderBoardRealtimeClient', () => ({ PartnerOrderBoardRealtimeClient: {} }))
vi.mock('../components/audit/AuditOverlaySection', () => ({ AuditInfoBanner: () => null }))
vi.mock('../components/sales/SalesSubNav', () => ({ SalesSubNav: () => null }))
vi.mock('./components/MergeConvertDialog', () => ({
  MergeConvertDialog: ({ onSuccess }: { onSuccess: (slipNo: string, orderNos: string[]) => void }) => (
    <button
      type="button"
      data-testid="test-merge-success"
      onClick={() => onSuccess('SLIP-TEST-1', ['2026/05/31-2'])}
    >
      test merge success
    </button>
  ),
}))
vi.mock('../stores/pageTitle', () => ({ usePageTitleStore: () => vi.fn() }))
vi.mock('../components/sales/sales.module.css', () => ({ default: new Proxy({}, { get: (_target, key) => String(key) }) }))

import { SalesPartnerOrderListPage } from './SalesPartnerOrderListPage'

const row = (overrides: Partial<PartnerOrderSummary>): PartnerOrderSummary => ({
  orderNumber: '2026/05/31-6',
  partnerCode: '8540000006',
  partnerName: '전표 발행 대기 거래처',
  submittedAt: '2026-05-31T11:00:00',
  status: 'CONFIRMED',
  slipPublishStatus: 'PENDING_RETRY',
  totalAmount: 640000,
  linkedSlipNo: null,
  ...overrides,
})

function renderPage(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SalesPartnerOrderListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function ReturnLocationProbe() {
  const location = useLocation()
  return <output data-testid="order-return-location">{location.pathname}{location.search}</output>
}

afterEach(cleanup)

describe('SalesPartnerOrderListPage 전표 발행 상태 배지', () => {
  beforeEach(() => {
    mocks.listPartnerOrders.mockReset()
    mocks.listPartnerOrders.mockResolvedValue({
      content: [
        row({ orderNumber: '2026/05/31-6', slipPublishStatus: 'PENDING_RETRY' }),
        row({
          orderNumber: '2026/05/31-7',
          partnerCode: '8540000007',
          partnerName: '전표 발행 실패 거래처',
          submittedAt: '2026-05-31T12:00:00',
          slipPublishStatus: 'FAILED_PERMANENT',
          totalAmount: 410000,
        }),
        row({ orderNumber: '2026/05/31-8', slipPublishStatus: 'PUBLISHED' }),
        row({ orderNumber: '2026/05/31-9', slipPublishStatus: 'NOT_REQUIRED' }),
      ],
      totalElements: 4,
      totalPages: 1,
      number: 0,
      size: 50,
      first: true,
      last: true,
    })
  })

  it('주문번호는 문서번호 상세 링크이며 검색·스크롤 목록 identity를 전달한다', async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={['/sales/partner-orders?keyword=세번째']}>
          <Routes>
            <Route path="/sales/partner-orders" element={<SalesPartnerOrderListPage />} />
            <Route path="/sales/partner-orders/*" element={<ReturnLocationProbe />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    const link = await screen.findByRole('link', { name: /2026\/05\/31-8/ })
    expect(link.getAttribute('href')).toBe('/sales/partner-orders/2026-05-31-8')
    fireEvent.click(link)
    expect((await screen.findByTestId('order-return-location')).textContent).toBe('/sales/partner-orders/2026-05-31-8')
  })

  it('기본 목록은 삭제행을 제외하고 토글을 켰을 때만 삭제행을 조회한다', async () => {
    renderPage()

    await screen.findByTestId('partner-order-table')
    const listCalls = () => mocks.listPartnerOrders.mock.calls.filter(([, , filters]) => filters?.status === 'DRAFT')
    expect(listCalls().at(-1)?.[2]).not.toHaveProperty('includeDeleted', true)

    fireEvent.click(screen.getByTestId('partner-order-list-include-deleted'))
    await waitFor(() => expect(listCalls().at(-1)?.[2]).toHaveProperty('includeDeleted', true))
  })

  it('삭제 포함 목록은 다음 페이지로 이동하고 토글을 끄면 첫 활성 페이지로 돌아온다', async () => {
    mocks.listPartnerOrders.mockImplementation(async (page, size, filters) => ({
      content: [row({ orderNumber: `${filters?.includeDeleted ? 'deleted' : 'active'}-${page}` })],
      totalElements: filters?.includeDeleted ? 101 : 1,
      totalPages: filters?.includeDeleted ? 3 : 1,
      number: page,
      size,
      first: page === 0,
      last: page === (filters?.includeDeleted ? 2 : 0),
    }))

    renderPage()
    const toggle = await screen.findByTestId('partner-order-list-include-deleted')
    fireEvent.click(toggle)
    fireEvent.click(await screen.findByTestId('partner-order-list-next-page'))

    await waitFor(() => expect(mocks.listPartnerOrders).toHaveBeenLastCalledWith(1, 50, expect.objectContaining({ includeDeleted: true })))
    fireEvent.click(await screen.findByTestId('partner-order-list-next-page'))
    await waitFor(() => expect(mocks.listPartnerOrders).toHaveBeenLastCalledWith(2, 50, expect.objectContaining({ includeDeleted: true })))
    fireEvent.click(toggle)
    await waitFor(() => expect(mocks.listPartnerOrders).toHaveBeenLastCalledWith(0, 50, expect.not.objectContaining({ includeDeleted: true })))
  })

  it('FAILED_PERMANENT·PENDING_RETRY만 배지를 표시하고 정상 상태는 표시하지 않는다', async () => {
    renderPage()

    expect((await screen.findByTestId('partner-order-row-slip-publish-status-2026/05/31-6')).textContent)
      .toContain('전표 발행 재시도 중')
    expect(screen.getByTestId('partner-order-row-slip-publish-status-2026/05/31-7').textContent)
      .toContain('전표 발행 실패')
    expect(screen.queryByTestId('partner-order-row-slip-publish-status-2026/05/31-8')).toBeNull()
    expect(screen.queryByTestId('partner-order-row-slip-publish-status-2026/05/31-9')).toBeNull()
  })

  it('실패 건수 배너는 0건이 아니면 표시되고 클릭 시 발행실패 필터를 적용한다', async () => {
    renderPage()

    const banner = await screen.findByTestId('partner-order-slip-publish-failure-banner')
    expect(banner.textContent).toContain('발행 실패 4건')
    expect((screen.getByTestId('partner-order-list-status-filter') as HTMLSelectElement).value).toBe('DRAFT')

    fireEvent.click(banner)

    await waitFor(() => {
      expect((screen.getByTestId('partner-order-list-slip-publish-filter') as HTMLSelectElement).value).toBe('FAILED')
      expect((screen.getByTestId('partner-order-list-status-filter') as HTMLSelectElement).value).toBe('')
    })
    expect(
      mocks.listPartnerOrders.mock.calls.some(([, , filters]) => filters?.slipPublishStatus === 'FAILED'),
    ).toBe(true)
  })

  // #863 R1 H-6: failedCountQuery는 partnerId/searchKeyword와 무관한 전역 집계인데, 배너 클릭이
  // 기존 거래처/검색어 필터를 초기화하지 않으면 "발행 실패 4건" 배너 바로 아래 "등록된 주문이
  // 없습니다"가 뜨는 모집단 불일치가 발생했다. 배너 클릭이 두 필터를 함께 초기화하는지 검증한다.
  it('H-6: 거래처 필터가 걸린 상태에서 배너를 클릭하면 거래처/검색어 필터가 함께 초기화된다', async () => {
    renderPage()

    const partnerFilter = (await screen.findByTestId(
      'partner-order-list-partner-filter',
    )) as HTMLInputElement
    const keywordFilter = screen.getByTestId('partner-order-list-keyword-filter') as HTMLInputElement
    fireEvent.change(partnerFilter, { target: { value: '9999999999' } })
    fireEvent.change(keywordFilter, { target: { value: '무관한 검색어' } })
    expect(partnerFilter.value).toBe('9999999999')
    expect(keywordFilter.value).toBe('무관한 검색어')

    const banner = await screen.findByTestId('partner-order-slip-publish-failure-banner')
    fireEvent.click(banner)

    await waitFor(() => {
      expect((screen.getByTestId('partner-order-list-slip-publish-filter') as HTMLSelectElement).value).toBe('FAILED')
    })
    // 배너는 전역 집계를 약속하므로 클릭 시 거래처/검색어 필터를 비워 같은 모집단을 보여줘야 한다.
    expect(partnerFilter.value).toBe('')
    expect(keywordFilter.value).toBe('')
    // 필터가 비워진 채로 목록 쿼리가 다시 나갔는지(마지막 호출 기준) 확인한다.
    const lastCall = mocks.listPartnerOrders.mock.calls.at(-1)
    expect(lastCall?.[2]?.partnerId).toBeUndefined()
    expect(lastCall?.[2]?.searchKeyword).toBeUndefined()
  })
})

// #863 R1 MED: failedCountQuery 실패를 무음(totalElements ?? 0 === 0)으로 삼키면 "발행 실패 0건"
// 처럼 보여 이 슬라이스가 없애려던 false-negative(실패인데 정상으로 보임)를 재현한다.
describe('SalesPartnerOrderListPage 발행실패 건수 조회 실패', () => {
  beforeEach(() => {
    mocks.listPartnerOrders.mockReset()
    mocks.listPartnerOrders.mockImplementation(
      (_page: number, _size: number, filters?: { slipPublishStatus?: string }) => {
        if (filters?.slipPublishStatus === 'FAILED') {
          return Promise.reject(new Error('네트워크 오류'))
        }
        return Promise.resolve({
          content: [],
          totalElements: 0,
          totalPages: 0,
          number: 0,
          size: 50,
          first: true,
          last: true,
        })
      },
    )
  })

  it('실패 건수 조회가 에러면 배너 대신 에러 안내를 표시하고, "발행 실패 0건"으로 보이지 않는다', async () => {
    renderPage()

    // failedCountQuery는 retry:1이라 React Query 기본 backoff(~1초)만큼 재시도 후에야 isError가
    // true로 확정된다 — testing-library 기본 findBy 타임아웃(1000ms)보다 넉넉히 잡는다.
    const errorBanner = await screen.findByTestId(
      'partner-order-slip-publish-failure-count-error',
      {},
      { timeout: 5000 },
    )
    expect(errorBanner.textContent).toContain('발행 실패 건수를 확인하지 못했습니다')
    expect(screen.queryByTestId('partner-order-slip-publish-failure-banner')).toBeNull()
  }, 10_000)
})

describe('SalesPartnerOrderListPage 병합 권한 게이팅', () => {
  beforeEach(() => {
    mocks.listPartnerOrders.mockReset()
    mocks.listPartnerOrders.mockResolvedValue({
      content: [],
      totalElements: 0,
      totalPages: 0,
      number: 0,
      size: 50,
      first: true,
      last: true,
    })
    mocks.canAccess.mockReset()
    mocks.canAccess.mockImplementation((page: string, action: string) =>
      !(page === 'partners.search' && action === 'view'),
    )
  })

  it('병합 생성 권한은 있어도 거래처 검색 권한이 없으면 버튼을 비활성화하고 사유를 안내한다', async () => {
    renderPage()

    expect(await screen.findByTestId('merge-convert-action-bar')).toBeTruthy()
    expect((screen.getByTestId('merge-convert-open') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByTestId('merge-convert-permission-hint').textContent).toContain(
      '거래처 검색 권한이 필요합니다',
    )
  })
})

describe('SalesPartnerOrderListPage 병합 성공 캐시 무효화', () => {
  beforeEach(() => {
    mocks.listPartnerOrders.mockReset()
    mocks.listPartnerOrders.mockResolvedValue({
      content: [row({ orderNumber: '2026/05/31-2', status: 'DRAFT' })],
      totalElements: 1,
      totalPages: 1,
      number: 0,
      size: 50,
      first: true,
      last: true,
    })
    mocks.canAccess.mockReset()
    mocks.canAccess.mockReturnValue(true)
  })

  it('병합 성공 시 목록·후보·정규화된 주문 상세 키를 무효화한다', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateQueries = vi.spyOn(client, 'invalidateQueries')

    renderPage(client)
    await screen.findByTestId('merge-convert-open')
    fireEvent.click(screen.getByTestId('merge-convert-open'))
    fireEvent.click(screen.getByTestId('test-merge-success'))

    await waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['partner-orders'] })
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['partner-order-merge-candidates'] })
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['partner-order', '2026-05-31-2'] })
    })
  })
})

describe('SalesPartnerOrderListPage 복원 캐시 무효화', () => {
  beforeEach(() => {
    mocks.listPartnerOrders.mockReset()
    mocks.listPartnerOrders.mockResolvedValue({
      content: [row({ orderNumber: '2026/05/31-restore', status: 'DRAFT', isDeleted: true })],
      totalElements: 1,
      totalPages: 1,
      number: 0,
      size: 50,
      first: true,
      last: true,
    })
    mocks.restorePartnerOrder.mockReset()
    mocks.restorePartnerOrder.mockResolvedValue(row({ orderNumber: '2026/05/31-restore', isDeleted: false }))
    mocks.canAccess.mockReset()
    mocks.canAccess.mockReturnValue(true)
  })

  it('복원 성공 시 하이픈 정규화된 주문 상세 캐시를 무효화한다', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateQueries = vi.spyOn(client, 'invalidateQueries')

    renderPage(client)
    fireEvent.click(await screen.findByTestId('partner-order-restore-2026/05/31-restore:deleted'))

    await waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['partner-orders'] })
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['partner-order', '2026-05-31-restore'] })
    })
    expect(invalidateQueries).not.toHaveBeenCalledWith({ queryKey: ['partner-order', '2026/05/31-restore'] })
  })
})
