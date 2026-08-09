// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

const mocks = vi.hoisted(() => ({
  listSources: vi.fn(),
  createSales: vi.fn(),
  createPurchase: vi.fn(),
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
        <div key={row.sourceLineId} data-testid={`allocation-row-${row.sourceLineId}`}>
          {columns.map((column) => (
            <div key={column.key}>{column.render ? column.render(row) : row[column.key]}</div>
          ))}
        </div>
      ))}
    </div>
  ),
}))

vi.mock('../../api/slipAllocationSourceApi', () => ({
  listSlipAllocationSources: mocks.listSources,
}))
vi.mock('../../api/salesAccountingSlipApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/salesAccountingSlipApi')>('../../api/salesAccountingSlipApi')
  return { ...actual, createSalesSlipDraft: mocks.createSales }
})
vi.mock('../../api/purchaseAccountingSlipApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/purchaseAccountingSlipApi')>('../../api/purchaseAccountingSlipApi')
  return { ...actual, createPurchaseSlipDraft: mocks.createPurchase }
})
vi.mock('../../hooks/usePageTitle', () => ({ usePageTitle: vi.fn() }))

import { SalesAccountingSlipFormPage } from './SalesAccountingSlipFormPage'
import { PurchaseAccountingSlipFormPage } from './PurchaseAccountingSlipFormPage'

const PARTNER_A = {
  partnerId: '11111111-1111-4111-8111-111111111111',
  partnerCode: 'P-SOURCE-A',
  partnerName: '원천 거래처 A',
}
const PARTNER_B = {
  partnerId: '22222222-2222-4222-8222-222222222222',
  partnerCode: 'P-SOURCE-B',
  partnerName: '원천 거래처 B',
}

function sourceRow(
  type: 'OUTBOUND' | 'INBOUND',
  partner: typeof PARTNER_A,
  suffix: string,
) {
  return {
    slipId: `slip-${suffix}`,
    slipNo: `2026/07/19-${suffix}`,
    slipType: type,
    status: 'CONFIRMED',
    slipDate: '2026-07-19',
    ...partner,
    lines: [{
      lineId: `line-${suffix}`,
      lineNo: 1,
      productCode: 'SKU-SOURCE',
      productName: '원천 품목',
      quantity: 1,
      unitPrice: '100',
      lineTotal: '100',
    }],
  }
}

function fractionalSourceRow(type: 'OUTBOUND' | 'INBOUND', partner: typeof PARTNER_A, suffix: string) {
  return {
    ...sourceRow(type, partner, suffix),
    lines: [{
      lineId: `line-${suffix}`,
      lineNo: 1,
      productCode: 'SKU-FRACTIONAL',
      productName: '?먯닔 ?덈ぉ',
      quantity: 0.08,
      unitPrice: '434788',
      lineTotal: '34783',
    }],
  }
}

function renderPage(kind: 'sales' | 'purchase') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const Page = kind === 'sales' ? SalesAccountingSlipFormPage : PurchaseAccountingSlipFormPage
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Page />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function allocateEverySourceRow() {
  await waitFor(() => expect(mocks.listSources).toHaveBeenCalled())
  const sliders = screen.getAllByRole('slider')
  sliders.forEach((slider) => fireEvent.change(slider, { target: { value: '100' } }))
}

function submitButton(testId: string): HTMLElement {
  const buttons = screen.getByTestId(testId).querySelectorAll('button')
  return buttons[buttons.length - 1] as HTMLElement
}

beforeEach(() => {
  mocks.listSources.mockResolvedValue([])
  mocks.createSales.mockResolvedValue({})
  mocks.createPurchase.mockResolvedValue({})
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe.each([
  ['sales', 'OUTBOUND', 'sales-accounting-slip-form-page', 'sales'],
  ['purchase', 'INBOUND', 'purchase-accounting-slip-form-page', 'purchase'],
] as const)('%s accounting allocation partner contract', (kind, sourceType, testId, mutationKind) => {
  it('uses whole-won display convention without changing the precise saved calculation', async () => {
    mocks.listSources.mockResolvedValue([
      fractionalSourceRow(sourceType, PARTNER_A, `${mutationKind}-fractional`),
    ])

    renderPage(kind)
    await allocateEverySourceRow()

    const pageText = screen.getByTestId(testId).textContent ?? ''
    expect(pageText).toContain('34,783')
    expect(pageText).not.toContain('34,783.04')

    fireEvent.click(submitButton(testId))
    const mutation = mutationKind === 'sales' ? mocks.createSales : mocks.createPurchase
    await waitFor(() => expect(mutation).toHaveBeenCalledTimes(1))
    expect(mutation.mock.calls[0]![0].lines[0].unitPrice).toBe('434788')
  })

  it('derives header partnerId/code/name from multiple same-partner sources', async () => {
    mocks.listSources.mockResolvedValue([
      sourceRow(sourceType, PARTNER_A, `${mutationKind}-a`),
      sourceRow(sourceType, PARTNER_A, `${mutationKind}-b`),
    ])

    renderPage(kind)
    await allocateEverySourceRow()
    fireEvent.click(submitButton(testId))

    const mutation = mutationKind === 'sales' ? mocks.createSales : mocks.createPurchase
    await waitFor(() => expect(mutation).toHaveBeenCalledTimes(1))
    const body = mutation.mock.calls[0]![0]
    expect(body.partnerId).toBe(PARTNER_A.partnerId)
    expect(body.partnerCode).toBe(PARTNER_A.partnerCode)
    expect(body.partnerName).toBe(PARTNER_A.partnerName)
    expect(body.partnerId).toBe(PARTNER_A.partnerId)
  })

  it('blocks submit when allocated sources have different partners', async () => {
    mocks.listSources.mockResolvedValue([
      sourceRow(sourceType, PARTNER_A, `${mutationKind}-a`),
      sourceRow(sourceType, PARTNER_B, `${mutationKind}-b`),
    ])

    renderPage(kind)
    await allocateEverySourceRow()
    const button = submitButton(testId) as HTMLButtonElement

    expect(button.disabled).toBe(true)
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(mutationKind === 'sales' ? mocks.createSales : mocks.createPurchase).not.toHaveBeenCalled()
  })

  it('blocks submit and explains when no allocation source is available', async () => {
    mocks.listSources.mockResolvedValue([])

    renderPage(kind)
    await waitFor(() => expect(mocks.listSources).toHaveBeenCalled())

    expect((submitButton(testId) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('alert').textContent).toContain('원천')
  })

  it.each([
    ['partnerCode', null],
    ['partnerName', null],
    ['partnerCode', '   '],
    ['partnerName', '   '],
  ] as const)('blocks submit when source %s=%j independently', async (field, value) => {
    const incompletePartner = { ...PARTNER_A, [field]: value } as typeof PARTNER_A
    mocks.listSources.mockResolvedValue([
      sourceRow(sourceType, incompletePartner, `${mutationKind}-${field}-${value == null ? 'null' : 'blank'}`),
    ])

    renderPage(kind)
    await waitFor(() => expect(mocks.listSources).toHaveBeenCalled())

    expect((submitButton(testId) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('alert').textContent).toContain('거래처')
    expect(mutationKind === 'sales' ? mocks.createSales : mocks.createPurchase).not.toHaveBeenCalled()
  })
})
