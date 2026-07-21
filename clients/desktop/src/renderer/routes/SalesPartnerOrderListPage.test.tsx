// @vitest-environment jsdom

import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import type { PartnerOrderSummary } from '../api/sales'

const mocks = vi.hoisted(() => ({
  listPartnerOrders: vi.fn(),
}))

vi.mock('@samhan/design-system', () => ({
  Badge: ({ children, ...props }: { children: React.ReactNode } & Record<string, unknown>) => (
    <span {...props}>{children}</span>
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
    restorePartnerOrder: vi.fn(),
  }
})
vi.mock('../hooks/usePermissions', () => ({ usePermissions: () => ({ canAccess: () => true }) }))
vi.mock('../realtime/useCollectionRealtime', () => ({ useCollectionRealtime: vi.fn() }))
vi.mock('../realtime/PartnerOrderBoardRealtimeClient', () => ({ PartnerOrderBoardRealtimeClient: {} }))
vi.mock('../components/audit/AuditOverlaySection', () => ({ AuditInfoBanner: () => null }))
vi.mock('../components/sales/SalesSubNav', () => ({ SalesSubNav: () => null }))
vi.mock('./components/MergeConvertDialog', () => ({ MergeConvertDialog: () => null }))
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

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SalesPartnerOrderListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
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
})
