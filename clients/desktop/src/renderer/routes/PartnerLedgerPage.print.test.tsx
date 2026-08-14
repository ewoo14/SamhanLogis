// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PartnerLedgerPage, buildCsv } from './PartnerLedgerPage'
import {
  getLedgerData,
  getLedgerHistory,
  getSalesAggregate,
  captureLedger,
  copyLedgerSnapshot,
  restoreLedger,
} from '../api/partnerLedgerApi'

vi.mock('../api/partnerLedgerApi', () => ({
  getSalesAggregate: vi.fn(),
  getLedgerData: vi.fn(),
  getLedgerHistory: vi.fn(),
  captureLedger: vi.fn(),
  copyLedgerSnapshot: vi.fn(),
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
    cleanup()
    vi.clearAllMocks()
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
    vi.mocked(captureLedger).mockResolvedValue({} as never)
    vi.mocked(copyLedgerSnapshot).mockResolvedValue({} as never)
  })

  it('선택한 거래처들을 Electron-safe 일괄 인쇄 route로 전환한다', async () => {
    vi.mocked(getSalesAggregate).mockResolvedValue([
      {
        partnerCode: 'QA-GATE-A', bizNo: '', partnerName: '대구공조(검수완료)',
        salesTotal: '2400000', paymentTotal: '0', receivableBalance: '2400000',
        periodFrom: '2026-05-01', periodTo: '2026-05-31',
      },
      {
        partnerCode: 'QA-GATE-B', bizNo: '', partnerName: '부산공조(출력)',
        salesTotal: '1300000', paymentTotal: '0', receivableBalance: '1300000',
        periodFrom: '2026-05-01', periodTo: '2026-05-31',
      },
    ])
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/accounting/partner-ledger']}>
          <Routes>
            <Route path="/accounting/partner-ledger" element={<PartnerLedgerPage />} />
            <Route path="/print/partner-ledger-batch" element={<PrintLocationProbe />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    fireEvent.change(screen.getByTestId('partner-ledger-from'), { target: { value: '2026-05-01' } })
    fireEvent.change(screen.getByTestId('partner-ledger-to'), { target: { value: '2026-05-31' } })
    fireEvent.click(screen.getByTestId('partner-ledger-search'))
    const table = await screen.findByTestId('partner-ledger-aggregate-table')
    fireEvent.click(within(table).getByLabelText('대구공조(검수완료) 일괄 인쇄 선택'))
    fireEvent.click(within(table).getByLabelText('부산공조(출력) 일괄 인쇄 선택'))
    fireEvent.click(screen.getByTestId('partner-ledger-batch-print-button'))

    await waitFor(() => {
      expect(screen.getByTestId('print-location').textContent).toBe(
        '/print/partner-ledger-batch?from=2026-05-01&to=2026-05-31&partnerCodes=QA-GATE-A&partnerCodes=QA-GATE-B',
      )
    })
    expect(openSpy).not.toHaveBeenCalled()
    openSpy.mockRestore()
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

  it('식별 불가(-) 집계 행은 빈 상세·인쇄를 열지 않는다', async () => {
    vi.mocked(getLedgerData).mockClear()
    vi.mocked(getSalesAggregate).mockResolvedValue([{
      partnerCode: '-', bizNo: '', partnerName: '식별 불가 출고전표',
      salesTotal: '197476400', paymentTotal: '0', receivableBalance: '0',
      periodFrom: '2026-01-01', periodTo: '2026-03-31',
    }])

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/accounting/partner-ledger']}>
          <Routes><Route path="/accounting/partner-ledger" element={<PartnerLedgerPage />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    fireEvent.change(screen.getByTestId('partner-ledger-from'), { target: { value: '2026-01-01' } })
    fireEvent.change(screen.getByTestId('partner-ledger-to'), { target: { value: '2026-03-31' } })
    fireEvent.click(screen.getByTestId('partner-ledger-search'))

    const row = await screen.findByTestId('partner-ledger-aggregate-row--')
    expect((within(row).getByRole('button', { name: '원장 보기' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(row)
    expect(getLedgerData).not.toHaveBeenCalledWith('-', expect.anything(), expect.anything())
  })

  it('선택한 원장의 원장 저장 이력 옆 저장 조작은 snapshot을 한 번 생성한다', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/accounting/partner-ledger']}>
          <Routes><Route path="/accounting/partner-ledger" element={<PartnerLedgerPage />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    fireEvent.change(screen.getByTestId('partner-ledger-from'), { target: { value: '2026-05-01' } })
    fireEvent.change(screen.getByTestId('partner-ledger-to'), { target: { value: '2026-05-31' } })
    fireEvent.click(screen.getByTestId('partner-ledger-search'))
    fireEvent.click(await screen.findByTestId('partner-ledger-aggregate-row-QA-GATE-A'))
    await screen.findByTestId('partner-ledger-detail-table')

    fireEvent.click(screen.getByTestId('partner-ledger-save-snapshot'))

    await waitFor(() => {
      expect(captureLedger).toHaveBeenCalledWith('QA-GATE-A', '2026-05-01', '2026-05-31')
    })
  })

  it('조회 반복은 snapshot을 생성하지 않는다', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/accounting/partner-ledger']}>
          <Routes><Route path="/accounting/partner-ledger" element={<PartnerLedgerPage />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    fireEvent.change(screen.getByTestId('partner-ledger-from'), { target: { value: '2026-05-01' } })
    fireEvent.change(screen.getByTestId('partner-ledger-to'), { target: { value: '2026-05-31' } })
    fireEvent.click(screen.getByTestId('partner-ledger-search'))
    await screen.findByTestId('partner-ledger-aggregate-table')
    fireEvent.click(screen.getByTestId('partner-ledger-search'))

    await waitFor(() => expect(getSalesAggregate).toHaveBeenCalledTimes(2))
    expect(captureLedger).not.toHaveBeenCalled()
  })

  it('복원본 상태의 저장과 인쇄는 live 재조회 대신 snapshot batch를 사용한다', async () => {
    const historyItem = {
      batchNo: 'LED-20260804-000021', partnerCode: 'QA-GATE-A',
      periodFrom: '2026-05-01', periodTo: '2026-05-31', lineCount: 1,
      savedAt: '2026-08-04T10:00:00', ledger: null,
    }
    vi.mocked(getLedgerHistory).mockResolvedValue({
      content: [historyItem], number: 0, totalPages: 1,
    })
    vi.mocked(restoreLedger).mockResolvedValue({
      ...historyItem,
      ledger: {
        partnerCode: 'QA-GATE-A', partnerName: '복원 거래처', partnerBusinessNo: '',
        chatRoomNames: [], periodFrom: '2026-05-01', periodTo: '2026-05-31',
        openingBalance: '500', salesTotal: '1100', paymentTotal: '400', closingBalance: '1200',
        documents: [{
          type: 'SALE', documentNo: '2026/05/01-1', date: '2026-05-01',
          deliveryAddress: null, amount: '1100', lines: [{ productName: '복원품', modelName: null,
            quantity: 1, unitPriceWithVat: '1100', lineAmount: '1100' }],
        }], lines: [],
      },
    })

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
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

    fireEvent.change(screen.getByTestId('partner-ledger-from'), { target: { value: '2026-05-01' } })
    fireEvent.change(screen.getByTestId('partner-ledger-to'), { target: { value: '2026-05-31' } })
    fireEvent.click(screen.getByTestId('partner-ledger-search'))
    fireEvent.click(await screen.findByTestId('partner-ledger-aggregate-row-QA-GATE-A'))
    await screen.findByTestId('partner-ledger-detail-table')
    fireEvent.click(await screen.findByTestId('partner-ledger-restore-LED-20260804-000021'))
    await screen.findByRole('status')

    fireEvent.click(screen.getByTestId('partner-ledger-save-snapshot'))
    await waitFor(() => expect(copyLedgerSnapshot).toHaveBeenCalledWith('LED-20260804-000021'))
    expect(captureLedger).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('partner-ledger-print-button'))
    await waitFor(() => expect(screen.getByTestId('print-location').textContent).toContain(
      'batchNo=LED-20260804-000021',
    ))
  })

  it('이력 다음 페이지에서 21번째 이후 snapshot을 복원할 수 있다', async () => {
    const first = {
      batchNo: 'LED-20260804-000020', partnerCode: 'QA-GATE-A',
      periodFrom: '2026-05-01', periodTo: '2026-05-31', lineCount: 1,
      savedAt: '2026-08-04T09:00:00', ledger: null,
    }
    const second = {
      ...first, batchNo: 'LED-20260804-000001', savedAt: '2026-08-03T09:00:00',
    }
    vi.mocked(getLedgerHistory)
      .mockResolvedValueOnce({ content: [first], number: 0, totalPages: 2 })
      .mockResolvedValueOnce({ content: [second], number: 1, totalPages: 2 })
    vi.mocked(restoreLedger).mockResolvedValue({ ...second, ledger: null })

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/accounting/partner-ledger']}>
          <Routes><Route path="/accounting/partner-ledger" element={<PartnerLedgerPage />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    fireEvent.change(screen.getByTestId('partner-ledger-from'), { target: { value: '2026-05-01' } })
    fireEvent.change(screen.getByTestId('partner-ledger-to'), { target: { value: '2026-05-31' } })
    fireEvent.click(screen.getByTestId('partner-ledger-search'))
    fireEvent.click(await screen.findByTestId('partner-ledger-aggregate-row-QA-GATE-A'))
    await screen.findByTestId('partner-ledger-restore-LED-20260804-000020')
    fireEvent.click(screen.getByTestId('partner-ledger-history-next'))
    await screen.findByTestId('partner-ledger-restore-LED-20260804-000001')
    fireEvent.click(screen.getByTestId('partner-ledger-restore-LED-20260804-000001'))
    await waitFor(() => expect(restoreLedger).toHaveBeenCalledWith('LED-20260804-000001'))
  })

  it('CSV 직렬화는 전달받은 snapshot 원장의 거래처와 금액을 사용한다', () => {
    const csv = buildCsv([{
      partnerCode: 'P-LIVE', bizNo: '', partnerName: 'live', salesTotal: '999',
      paymentTotal: '0', receivableBalance: '999', periodFrom: '2026-05-01', periodTo: '2026-05-31',
    }], {
      partnerCode: 'P-SNAPSHOT', partnerName: 'snapshot', partnerBusinessNo: '', chatRoomNames: [],
      periodFrom: '2026-05-01', periodTo: '2026-05-31', openingBalance: '500', salesTotal: '1100',
      paymentTotal: '400', closingBalance: '1200', lines: [{ date: '2026-05-01', journalNo: '2026/05/01-2',
        accountCode: '', description: '복원품', debit: '1100', credit: '0', balance: '1600' }],
    })

    expect(csv).toContain('P-LIVE')
    expect(csv).toContain('snapshot')
    expect(csv).toContain('2026/05/01-2')
  })
})
