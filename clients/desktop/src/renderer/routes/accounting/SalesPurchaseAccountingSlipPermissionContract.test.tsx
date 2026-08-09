// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

const mocks = vi.hoisted(() => ({
  canAccess: vi.fn(),
  listSales: vi.fn(),
  listPurchase: vi.fn(),
  postSales: vi.fn(),
  postPurchase: vi.fn(),
}))

vi.mock('@samhan/design-system', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Button: ({ children, ...props }: { children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>{children}</button>
  ),
  Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  DataTable: ({ columns, rows }: { columns: Array<{ key: string; render?: (row: any) => React.ReactNode }>; rows: any[] }) => (
    <div>
      {rows.map((row) => (
        <div key={row.slipNo} data-testid={`slip-row-${row.slipNo}`}>
          {columns.map((column) => (
            <div key={column.key}>{column.render ? column.render(row) : row[column.key]}</div>
          ))}
        </div>
      ))}
    </div>
  ),
  Spinner: ({ label }: { label: string }) => <span>{label}</span>,
}))

vi.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => ({
    canAccess: mocks.canAccess,
    isLoading: false,
  }),
}))
vi.mock('../../hooks/usePageTitle', () => ({ usePageTitle: vi.fn() }))
vi.mock('../../api/salesAccountingSlipApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/salesAccountingSlipApi')>('../../api/salesAccountingSlipApi')
  return { ...actual, listSalesAccountingSlips: mocks.listSales, postSalesSlip: mocks.postSales }
})
vi.mock('../../api/purchaseAccountingSlipApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/purchaseAccountingSlipApi')>('../../api/purchaseAccountingSlipApi')
  return { ...actual, listPurchaseAccountingSlips: mocks.listPurchase, postPurchaseSlip: mocks.postPurchase }
})

import { SalesAccountingSlipPage } from './SalesAccountingSlipPage'
import { PurchaseAccountingSlipPage } from './PurchaseAccountingSlipPage'

const DRAFT_SLIP = {
  id: null,
  slipNo: '2026/08/09-1',
  slipDate: '2026-08-09',
  partnerCode: 'P-TEST',
  partnerName: '테스트 거래처',
  taxType: 'TAXABLE',
  status: 'DRAFT',
  totalSupplyAmount: '1000',
  totalVatAmount: '100',
  totalAmount: '1100',
  memo: null,
  lines: [],
} as const

function renderPage(kind: 'sales' | 'purchase') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const Page = kind === 'sales' ? SalesAccountingSlipPage : PurchaseAccountingSlipPage
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Page />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mocks.canAccess.mockImplementation((_pageCode: string, action: string) => action === 'view')
  mocks.listSales.mockResolvedValue([DRAFT_SLIP])
  mocks.listPurchase.mockResolvedValue([DRAFT_SLIP])
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe.each([
  ['sales', '매출전표', 'accounting.sales-slip.accounting'],
  ['purchase', '매입전표', 'accounting.purchase-slip.accounting'],
] as const)('%s accounting slip list write permissions', (kind, _title, pageCode) => {
  it('does not render 작성 or DRAFT 전기 when create/update are denied', async () => {
    renderPage(kind)

    await waitFor(() => expect(screen.getByTestId(`slip-row-${DRAFT_SLIP.slipNo}`)).toBeTruthy())

    expect(mocks.canAccess).toHaveBeenCalledWith(pageCode, 'create')
    expect(mocks.canAccess).toHaveBeenCalledWith(pageCode, 'update')
    expect(screen.queryByRole('button', { name: '작성' })).toBeNull()
    expect(screen.queryByRole('button', { name: '전기' })).toBeNull()
  })

  it('renders 작성 and DRAFT 전기 when create/update are granted', async () => {
    mocks.canAccess.mockReturnValue(true)
    renderPage(kind)

    await waitFor(() => expect(screen.getByTestId(`slip-row-${DRAFT_SLIP.slipNo}`)).toBeTruthy())

    expect(screen.getByRole('button', { name: '작성' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '전기' })).toBeTruthy()
  })
})
