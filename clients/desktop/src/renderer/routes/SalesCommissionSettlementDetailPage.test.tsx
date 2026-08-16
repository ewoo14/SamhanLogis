// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const mocks = vi.hoisted(() => ({ get: vi.fn(), calculate: vi.fn() }))

vi.mock('@samhan/design-system', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  Spinner: ({ label }: { label?: string }) => <div role="status">{label}</div>,
}))
vi.mock('../api/accounting', () => ({
  getSalesCommissionSettlement: mocks.get,
  calculateSalesCommissionSettlement: mocks.calculate,
  confirmSalesCommissionSettlement: vi.fn(),
}))
vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: vi.fn() }))
vi.mock('../hooks/usePermissions', () => ({ usePermissions: () => ({ canAccess: () => true }) }))

import { SalesCommissionSettlementDetailPage } from './SalesCommissionSettlementDetailPage'

const draft = {
  id: 'draft-internal-id', documentNo: null, settlementDate: '2026-08-11', status: 'DRAFT',
  totalAmount: null, payoutAmount: null, supplyAmount: null, vatAmount: null, rateContractVersion: null,
}

const calculated = {
  ...draft,
  totalAmount: '1000000', payoutAmount: '920000', supplyAmount: '836364', vatAmount: '83636',
  rateContractVersion: 1, equipmentAmount: '0', prepaidAmount: '0', installInputAmount: '0',
  safetyInputAmount: '0', paymentMethod: 'CARD', withholdingApplied: true,
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

  it('입력값이 바뀌는 즉시 계산 결과를 다시 계산한다', async () => {
    mocks.get.mockResolvedValue(calculated)
    mocks.calculate.mockResolvedValue({ ...calculated, totalAmount: '2000000', payoutAmount: '1840000' })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/accounting/sales-commission-settlements/id']}><Routes><Route path="/accounting/sales-commission-settlements/:id" element={<SalesCommissionSettlementDetailPage />} /></Routes></MemoryRouter></QueryClientProvider>)

    const input = await screen.findByLabelText('총 결제금액')
    fireEvent.change(input, { target: { value: '2000000' } })
    expect(await screen.findByText('₩1,840,000')).toBeInTheDocument()
    expect(mocks.calculate).toHaveBeenCalled()
  })

  it('레거시의 제경비율 8%/수기 토글과 수기 비율 입력을 제공한다', async () => {
    mocks.get.mockResolvedValue(draft)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/accounting/sales-commission-settlements/id']}><Routes><Route path="/accounting/sales-commission-settlements/:id" element={<SalesCommissionSettlementDetailPage />} /></Routes></MemoryRouter></QueryClientProvider>)

    expect(await screen.findByLabelText('제경비율')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '수기' }))
    expect(await screen.findByLabelText('수기 제경비율')).toBeInTheDocument()
  })

  it('빈 금액은 0으로 보내되 문자는 거부한다', async () => {
    mocks.get.mockResolvedValue(draft)
    mocks.calculate.mockResolvedValue(calculated)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/accounting/sales-commission-settlements/id']}><Routes><Route path="/accounting/sales-commission-settlements/:id" element={<SalesCommissionSettlementDetailPage />} /></Routes></MemoryRouter></QueryClientProvider>)

    const input = await screen.findByLabelText('총 결제금액')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.click(screen.getByTestId('sales-commission-settlement-calculate'))
    await waitFor(() => expect(mocks.calculate).toHaveBeenCalledWith('id', expect.objectContaining({ total: '0' })))
    fireEvent.change(input, { target: { value: '문자' } })
    expect(screen.getByRole('alert')).toHaveTextContent('금액 형식')
  })

  it('18자리 금액은 문자열 정밀도를 그대로 표시한다', async () => {
    mocks.get.mockResolvedValue({ ...calculated, totalAmount: '999999999999999999', payoutAmount: '999999999999999999' })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/accounting/sales-commission-settlements/id']}><Routes><Route path="/accounting/sales-commission-settlements/:id" element={<SalesCommissionSettlementDetailPage />} /></Routes></MemoryRouter></QueryClientProvider>)
    expect((await screen.findAllByText('₩999,999,999,999,999,999')).length).toBeGreaterThanOrEqual(2)
  })

  it('19자리 금액은 서버로 보내기 전에 명시적으로 거부한다', async () => {
    mocks.get.mockResolvedValue(draft)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/accounting/sales-commission-settlements/id']}><Routes><Route path="/accounting/sales-commission-settlements/:id" element={<SalesCommissionSettlementDetailPage />} /></Routes></MemoryRouter></QueryClientProvider>)
    const input = await screen.findByLabelText('총 결제금액')
    fireEvent.change(input, { target: { value: '9999999999999999999' } })
    fireEvent.click(screen.getByTestId('sales-commission-settlement-calculate'))
    expect(screen.getByRole('alert')).toHaveTextContent('18자리')
    expect(mocks.calculate).not.toHaveBeenCalled()
  })

  it('느린 이전 계산 응답은 최신 입력 결과를 덮어쓰지 않는다', async () => {
    mocks.get.mockResolvedValue(calculated)
    let resolveFirst!: (value: typeof calculated) => void
    let resolveSecond!: (value: typeof calculated) => void
    mocks.calculate
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve }))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/accounting/sales-commission-settlements/id']}><Routes><Route path="/accounting/sales-commission-settlements/:id" element={<SalesCommissionSettlementDetailPage />} /></Routes></MemoryRouter></QueryClientProvider>)

    const input = await screen.findByLabelText('총 결제금액')
    fireEvent.change(input, { target: { value: '1' } })
    fireEvent.change(input, { target: { value: '12' } })
    await waitFor(() => expect(mocks.calculate).toHaveBeenCalledTimes(2))
    resolveSecond({ ...calculated, totalAmount: '12', payoutAmount: '12' })
    await waitFor(() => expect(screen.getAllByText('₩12').length).toBeGreaterThanOrEqual(1))
    resolveFirst({ ...calculated, totalAmount: '1', payoutAmount: '1' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.getByLabelText('총 결제금액')).toHaveValue('12')
    expect(screen.getAllByText('₩12').length).toBeGreaterThanOrEqual(1)
  })
})
