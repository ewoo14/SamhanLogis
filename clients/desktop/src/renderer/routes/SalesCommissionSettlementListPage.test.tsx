// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
}))

vi.mock('@samhan/design-system', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  DataTable: ({ rows, columns, emptyMessage, rowKey }: any) => (
    <table>
      <tbody>
        {rows.length === 0 ? <tr><td>{emptyMessage}</td></tr> : rows.map((row: any) => (
          <tr key={rowKey(row)}>{columns.map((column: any) => <td key={column.key}>{column.render ? column.render(row) : row[column.key]}</td>)}</tr>
        ))}
      </tbody>
    </table>
  ),
}))
vi.mock('../api/accounting', () => ({
  listSalesCommissionSettlements: mocks.list,
  createSalesCommissionSettlement: vi.fn(),
}))
vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: vi.fn() }))
vi.mock('../hooks/usePermissions', () => ({ usePermissions: () => ({ canAccess: () => true }) }))

import { SalesCommissionSettlementListPage } from './SalesCommissionSettlementListPage'

const draft = {
  id: 'draft-internal-id', documentNo: null, settlementDate: '2026-08-11', status: 'DRAFT',
  totalAmount: null, payoutAmount: null, supplyAmount: null, vatAmount: null, rateContractVersion: null,
}
const confirmed = { ...draft, id: 'confirmed-internal-id', documentNo: '2026/08/11-1', status: 'CONFIRMED' }

function StateProbe() {
  const location = useLocation()
  const state = location.state as { returnTo?: { pathname?: string; search?: string } } | null
  return <div data-testid="return-state">{state?.returnTo?.pathname}|{state?.returnTo?.search}</div>
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/accounting/sales-commission-settlements?status=DRAFT']}>
        <Routes>
          <Route path="/accounting/sales-commission-settlements" element={<SalesCommissionSettlementListPage />} />
          <Route path="/accounting/sales-commission-settlements/:id" element={<StateProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SalesCommissionSettlementListPage 상세 진입 계약', () => {
  it('번호 없는 DRAFT도 사용자용 링크 텍스트와 UUID 내부 href로 상세 진입한다', async () => {
    mocks.list.mockResolvedValue({ content: [draft, confirmed], totalElements: 2, totalPages: 1, number: 0, size: 20, first: true, last: true })
    renderPage()

    const draftLink = await screen.findByTestId('sales-commission-settlement-document-draft-2026-08-11')
    expect(draftLink).toHaveTextContent('임시저장 · 2026-08-11')
    expect(draftLink.closest('a')).toHaveAttribute('href', '/accounting/sales-commission-settlements/draft-internal-id')
    expect(screen.getByTestId('sales-commission-settlement-document-2026/08/11-1')).toHaveTextContent('2026/08/11-1')
    expect(screen.queryByText('draft-internal-id')).toBeNull()
  })

  it('문서번호 링크는 #1094 returnTo 상태를 native Link으로 전달한다', async () => {
    mocks.list.mockResolvedValue({ content: [confirmed], totalElements: 1, totalPages: 1, number: 0, size: 20, first: true, last: true })
    renderPage()

    const link = await screen.findByTestId('sales-commission-settlement-document-2026/08/11-1')
    link.click()
    expect(await screen.findByTestId('return-state')).toHaveTextContent('/accounting/sales-commission-settlements|?status=DRAFT')
  })
})
