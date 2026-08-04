// @vitest-environment jsdom
import React from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getLedgerData, restoreLedger } from '../api/partnerLedgerApi'
import { PartnerLedgerView } from './PartnerLedgerView'
import { PartnerLedgerBatchView } from './PartnerLedgerBatchView'

vi.mock('../api/partnerLedgerApi', () => ({
  getLedgerData: vi.fn().mockResolvedValue({
    partnerCode: 'P-1', partnerName: '거래처', partnerBusinessNo: '', chatRoomNames: [],
    periodFrom: '2026-08-01', periodTo: '2026-08-31',
    lines: [{ date: '2026-08-01', journalNo: '2026/08/01-1', accountCode: '', accountName: '',
      description: '품목', debit: '100', credit: '0', balance: '0',
      deliveryAddress: '서울시 배송 주소', documentType: 'SALE' }],
  }),
  restoreLedger: vi.fn(),
  mapLedgerSnapshotResponse: vi.fn((source) => ({
    partnerCode: source.partnerCode,
    partnerName: source.partnerName,
    partnerBusinessNo: source.partnerBusinessNo,
    chatRoomNames: source.chatRoomNames ?? [],
    periodFrom: source.periodFrom,
    periodTo: source.periodTo,
    openingBalance: source.openingBalance ?? '0',
    salesTotal: source.salesTotal ?? '0',
    paymentTotal: source.paymentTotal ?? '0',
    closingBalance: source.closingBalance ?? '0',
    lines: source.lines ?? [],
  })),
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
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

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

  it('snapshot 인쇄는 같은 기간 live query cache와 분리해 복원본을 읽는다', async () => {
    vi.mocked(restoreLedger).mockResolvedValue({
      batchNo: 'LED-20260804-000021', partnerCode: 'P-1', periodFrom: '2026-08-01',
      periodTo: '2026-08-31', lineCount: 1, savedAt: '2026-08-04T10:00:00', ledger: {
        partnerCode: 'P-1', partnerName: '복원 거래처', partnerBusinessNo: '', chatRoomNames: [],
        periodFrom: '2026-08-01', periodTo: '2026-08-31', documents: [], lines: [{
          date: '2026-08-01', journalNo: '2026/08/01-99', accountCode: '', description: '복원 line',
          debit: '700', credit: '0', balance: '700', documentType: 'SALE',
        }],
      },
    })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/accounting/ledger/print?partnerCode=P-1&from=2026-08-01&to=2026-08-31&batchNo=LED-20260804-000021']}>
          <PartnerLedgerView />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await waitFor(() => expect(screen.getByText('복원 line')).toBeTruthy())
    expect(restoreLedger).toHaveBeenCalledWith('LED-20260804-000021')
    expect(getLedgerData).not.toHaveBeenCalled()
  })
  it('keeps print summary one time for a multi-page-sized ledger', async () => {
    vi.mocked(getLedgerData).mockResolvedValue({
      partnerCode: 'P-1', partnerName: '거래처', partnerBusinessNo: '', chatRoomNames: [],
      periodFrom: '2026-08-01', periodTo: '2026-08-31',
      lines: Array.from({ length: 80 }, (_, index) => ({
        date: '2026-08-01', journalNo: `2026/08/01-${index + 1}`,
        accountCode: '', accountName: '', description: `품목 ${index + 1}`,
        debit: '100', credit: '0', balance: String((index + 1) * 100),
        deliveryAddress: null, documentType: 'SALE' as const,
      })),
    })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/accounting/ledger/print?partnerCode=P-1&from=2026-08-01&to=2026-08-31']}>
          <PartnerLedgerView />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('partner-ledger-print-summary')).toBeTruthy())
    expect(screen.getAllByTestId('partner-ledger-print-summary')).toHaveLength(1)
  })

  it('renders negative running and closing balances in red while zero stays an em-dash', async () => {
    vi.mocked(getLedgerData).mockResolvedValue({
      partnerCode: 'P-1', partnerName: '거래처', partnerBusinessNo: '', chatRoomNames: [],
      periodFrom: '2026-08-01', periodTo: '2026-08-31',
      lines: [{ date: '2026-08-01', journalNo: '2026/08/01-1', accountCode: '', accountName: '',
        description: '입금', debit: '0', credit: '100', balance: '-100',
        deliveryAddress: null, documentType: 'CASH_RECEIPT' as const }],
    })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/accounting/ledger/print?partnerCode=P-1&from=2026-08-01&to=2026-08-31']}>
          <PartnerLedgerView />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await waitFor(() => expect(screen.getAllByText('-100')).toHaveLength(2))
    screen.getAllByText('-100').forEach((element) => {
      expect((element as HTMLElement).style.color).toBe('rgb(220, 38, 38)')
    })
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('prints the stored journal number unchanged and labels the column as journal number', async () => {
    const storedJournalNo = '2026/05/06-3'
    vi.mocked(getLedgerData).mockResolvedValue({
      partnerCode: '8428102605', partnerName: '주식회사 제이시스템', partnerBusinessNo: '', chatRoomNames: [],
      periodFrom: '2026-05-01', periodTo: '2026-05-31',
      lines: [{ date: '2026-05-06', journalNo: storedJournalNo, accountCode: '', accountName: '',
        description: '입금보고서', debit: '0', credit: '90402200', balance: '-90402200',
        deliveryAddress: null, documentType: 'CASH_RECEIPT' as const }],
    })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/accounting/ledger/print?partnerCode=8428102605&from=2026-05-01&to=2026-05-31']}>
          <PartnerLedgerView />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await waitFor(() => expect(screen.getByText(storedJournalNo)).toBeTruthy())
    expect(screen.getByText(storedJournalNo).textContent).toBe(storedJournalNo)
    expect(screen.getAllByRole('columnheader', { name: '분개번호' }).length).toBeGreaterThan(0)
    expect(screen.queryByText('2026/05/06-4')).toBeNull()
  })

  it('일괄 인쇄 화면에 선택한 모든 거래처 원장을 렌더링한다', async () => {
    vi.mocked(getLedgerData).mockImplementation(async (partnerCode) => ({
      partnerCode,
      partnerName: partnerCode === 'P-1' ? '첫 거래처' : '둘째 거래처',
      partnerBusinessNo: '', chatRoomNames: [],
      periodFrom: '2026-08-01', periodTo: '2026-08-31', lines: [],
    }))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/print/partner-ledger-batch?from=2026-08-01&to=2026-08-31&partnerCodes=P-1&partnerCodes=P-2']}>
          <PartnerLedgerBatchView />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('첫 거래처')).toBeTruthy()
      expect(screen.getByText('둘째 거래처')).toBeTruthy()
    })
    expect(getLedgerData).toHaveBeenCalledWith('P-1', '2026-08-01', '2026-08-31')
    expect(getLedgerData).toHaveBeenCalledWith('P-2', '2026-08-01', '2026-08-31')
  })
})
