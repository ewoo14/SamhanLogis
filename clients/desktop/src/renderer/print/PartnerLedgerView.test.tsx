// @vitest-environment jsdom
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PartnerLedgerView } from './PartnerLedgerView'

vi.mock('../api/partnerLedgerApi', () => ({
  getLedgerData: vi.fn().mockResolvedValue({
    partnerCode: 'P-1', partnerName: '거래처', partnerBusinessNo: '', chatRoomNames: [],
    periodFrom: '2026-08-01', periodTo: '2026-08-31',
    lines: [{ date: '2026-08-01', journalNo: 'S-1', accountCode: '', accountName: '',
      description: '품목', debit: '100', credit: '0', balance: '0',
      deliveryAddress: '서울시 배송 주소', documentType: 'SALE' }],
  }),
}))
vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: vi.fn() }))
vi.mock('./useCompanyProfile', () => ({
  useCompanyProfile: () => ({ company: { legalName: '회사', businessRegNo: '', ceo: '' } }),
}))
vi.mock('./PrintLayout', () => ({
  PrintLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  krw: (value: number) => value.toLocaleString('ko-KR'),
  krDate: (value: string) => value,
}))

describe('PartnerLedgerView', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders structured delivery address and em-dash for print zero values after loading', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/accounting/ledger/print?partnerCode=P-1&from=2026-08-01&to=2026-08-31']}>
          <PartnerLedgerView />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await waitFor(() => expect(screen.getByText('서울시 배송 주소')).toBeTruthy())
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    expect(screen.queryByText(/△/)).toBeNull()
  })
})
