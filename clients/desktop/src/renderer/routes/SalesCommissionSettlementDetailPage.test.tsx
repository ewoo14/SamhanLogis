// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const mocks = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock('@samhan/design-system', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  Spinner: ({ label }: { label?: string }) => <div role="status">{label}</div>,
}))
vi.mock('../api/accounting', () => ({
  getSalesCommissionSettlement: mocks.get,
  confirmSalesCommissionSettlement: vi.fn(),
}))
vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: vi.fn() }))
vi.mock('../hooks/usePermissions', () => ({ usePermissions: () => ({ canAccess: () => true }) }))

import { SalesCommissionSettlementDetailPage } from './SalesCommissionSettlementDetailPage'

const draft = {
  id: 'draft-internal-id', documentNo: null, settlementDate: '2026-08-11', status: 'DRAFT',
  totalAmount: null, payoutAmount: null, supplyAmount: null, vatAmount: null, rateContractVersion: null,
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SalesCommissionSettlementDetailPage 복귀 계약', () => {
  it('DRAFT UUID route를 열고 history back으로 목록 query를 보존한다', async () => {
    mocks.get.mockResolvedValue(draft)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[
          '/accounting/sales-commission-settlements?status=DRAFT',
          {
            pathname: '/accounting/sales-commission-settlements/draft-internal-id',
            state: {
              returnTo: { pathname: '/accounting/sales-commission-settlements', search: '?status=DRAFT' },
              returnEntryKey: 'list-entry-key',
            },
          },
        ]} initialIndex={1}>
          <Routes>
            <Route path="/accounting/sales-commission-settlements/:id" element={<SalesCommissionSettlementDetailPage />} />
            <Route path="/accounting/sales-commission-settlements" element={<div data-testid="settlement-list-returned" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByText('임시저장')).toBeInTheDocument()
    expect(mocks.get).toHaveBeenCalledWith('draft-internal-id')
    fireEvent.click(screen.getByTestId('sales-commission-settlement-back'))
    expect(await screen.findByTestId('settlement-list-returned')).toBeInTheDocument()
  })
})
