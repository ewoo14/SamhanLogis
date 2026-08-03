// @vitest-environment jsdom
import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PartnerLedgerPage } from './PartnerLedgerPage'
import {
  getLedgerData,
  getLedgerHistory,
  getSalesAggregate,
} from '../api/partnerLedgerApi'

vi.mock('../api/partnerLedgerApi', () => ({
  getSalesAggregate: vi.fn(),
  getLedgerData: vi.fn(),
  getLedgerHistory: vi.fn(),
  restoreLedger: vi.fn(),
}))

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: vi.fn() }))
vi.mock('../components/audit/AuditOverlaySection', () => ({
  AuditInfoBanner: () => null,
}))

function PrintLocationProbe() {
  const location = useLocation()
  return (
    <output data-testid="print-location">
      {location.pathname}{location.search}
    </output>
  )
}

describe('PartnerLedgerPage 인쇄 미리보기', () => {
  beforeEach(() => {
    vi.mocked(getSalesAggregate).mockResolvedValue([{
      partnerCode: 'QA-GATE-A',
      bizNo: '',
      partnerName: '대구공조(검수완료)',
      salesTotal: '2400000',
      paymentTotal: '0',
      receivableBalance: '2400000',
      periodFrom: '2026-05-01',
      periodTo: '2026-05-31',
    }])
    vi.mocked(getLedgerData).mockResolvedValue({
      partnerCode: 'QA-GATE-A',
      partnerName: '대구공조(검수완료)',
      partnerBusinessNo: '',
      chatRoomNames: [],
      periodFrom: '2026-05-01',
      periodTo: '2026-05-31',
      lines: [{
        date: '2026-05-08',
        journalNo: '2026/05/08-1',
        accountCode: '',
        description: '품목',
        debit: '2400000',
        credit: '0',
        balance: '2400000',
        documentType: 'SALE',
      }],
    })
    vi.mocked(getLedgerHistory).mockResolvedValue({ content: [] })
  })

  it('데이터가 있는 상세에서 인쇄 라우트로 이동한다', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/accounting/partner-ledger']}>
          <Routes>
            <Route path="/accounting/partner-ledger" element={<PartnerLedgerPage />} />
            <Route path="/print/partner-ledger" element={<PrintLocationProbe />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    fireEvent.change(screen.getByTestId('partner-ledger-from'), {
      target: { value: '2026-05-01' },
    })
    fireEvent.change(screen.getByTestId('partner-ledger-to'), {
      target: { value: '2026-05-31' },
    })
    fireEvent.click(screen.getByTestId('partner-ledger-search'))

    const row = await screen.findByTestId('partner-ledger-aggregate-row-QA-GATE-A')
    fireEvent.click(row)
    await screen.findByTestId('partner-ledger-detail-table')

    fireEvent.click(screen.getByTestId('partner-ledger-print-button'))

    await waitFor(() => {
      expect(screen.getByTestId('print-location').textContent).toBe(
        '/print/partner-ledger?partnerCode=QA-GATE-A&from=2026-05-01&to=2026-05-31',
      )
    })
  })
})
