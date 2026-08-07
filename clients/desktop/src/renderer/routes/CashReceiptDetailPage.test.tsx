// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { CashReceiptRow } from '../api/accounting'

const mocks = vi.hoisted(() => ({
  getCashReceipt: vi.fn(),
  confirmCashReceipt: vi.fn(),
  cancelCashReceipt: vi.fn(),
  deleteCashReceipt: vi.fn(),
  canAccess: vi.fn(() => true),
  navigate: vi.fn(),
}))

vi.mock('@samhan/design-system', () => ({
  Badge: ({ children, variant }: { children: React.ReactNode; variant?: string }) => (
    <span data-variant={variant}>{children}</span>
  ),
  Button: ({ children, variant: _variant, size: _size, loading: _loading, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
  Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  Spinner: ({ label }: { label?: string }) => <div role="status">{label}</div>,
}))

vi.mock('../api/accounting', () => ({
  getCashReceipt: mocks.getCashReceipt,
  confirmCashReceipt: mocks.confirmCashReceipt,
  cancelCashReceipt: mocks.cancelCashReceipt,
  deleteCashReceipt: mocks.deleteCashReceipt,
}))

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: vi.fn() }))
vi.mock('../hooks/usePermissions', () => ({
  usePermissions: () => ({ canAccess: mocks.canAccess }),
}))
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mocks.navigate }
})

import { CashReceiptDetailPage } from './CashReceiptDetailPage'

function receipt(overrides: Partial<CashReceiptRow> = {}): CashReceiptRow {
  return {
    id: 'receipt-1',
    slipNo: '2026/07/05-1',
    partnerCode: 'P-001',
    bizNo: '123-45-67890',
    partnerName: '삼한공조',
    amount: '2480000',
    transactionDate: '2026-07-05',
    kind: 'MANUAL_RECEIPT',
    status: 'DRAFT',
    memo: '수기 입금',
    journalNo: null,
    reverseJournalNo: null,
    externalRef: 'MANUAL-20260705-001',
    debitAccountCode: '102',
    creditAccountCode: '110',
    ...overrides,
  }
}

function renderPage(row: CashReceiptRow, initialEntry: string | { pathname: string; state?: unknown } = '/accounting/admin/cash-receipts/receipt-1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  mocks.getCashReceipt.mockResolvedValue(row)
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/accounting/admin/cash-receipts/:id" element={<CashReceiptDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  mocks.canAccess.mockReturnValue(true)
})

describe('CashReceiptDetailPage', () => {
  it('상세 목록 CTA는 원래 history entry를 되감는다', async () => {
    renderPage(receipt(), {
      pathname: '/accounting/admin/cash-receipts/receipt-1',
      state: {
        returnTo: { pathname: '/accounting/admin/cash-receipts', search: '?kind=DEPOSIT_REPORT&page=2' },
        returnEntryKey: 'source-entry',
      },
    })

    fireEvent.click(await screen.findByRole('button', { name: '목록' }))
    expect(mocks.navigate).toHaveBeenCalledWith(-1)
  })

  it('상세 직접 진입은 canonical fallback을 replace한다', async () => {
    renderPage(receipt(), {
      pathname: '/accounting/admin/cash-receipts/receipt-1',
      state: { returnTo: { pathname: '/accounting/admin/cash-receipts', search: '?kind=DEPOSIT_REPORT&page=2' } },
    })

    fireEvent.click(await screen.findByRole('button', { name: '목록' }))
    expect(mocks.navigate).toHaveBeenCalledWith({
      pathname: '/accounting/admin/cash-receipts',
      search: '?kind=DEPOSIT_REPORT&page=2',
    }, { replace: true })
  })

  it('상세 필드와 S4a kind 라벨을 렌더하고 DRAFT 액션을 활성화한다', async () => {
    renderPage(receipt())

    expect(await screen.findByRole('heading', { name: '2026/07/05-1' })).not.toBeNull()
    expect(screen.getAllByText('수기 입금').length).toBeGreaterThan(0)
    expect(screen.getByText('삼한공조')).not.toBeNull()
    expect((screen.getByRole('button', { name: '확정' }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByRole('button', { name: '편집' }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByRole('button', { name: '삭제' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('BANK_LINKED 상세는 편집을 비활성화하고 PATCH 진입을 막는다', async () => {
    renderPage(receipt({ kind: 'BANK_LINKED', status: 'CONFIRMED', journalNo: '2026/07/05-9' }))

    expect(await screen.findByText('통장연계')).not.toBeNull()
    const edit = screen.getByRole('button', { name: '편집 불가' })
    expect((edit as HTMLButtonElement).disabled).toBe(true)
    const describedBy = edit.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy!)?.textContent).toBe('통장연계 입금보고서는 수정할 수 없습니다.')
    expect(screen.queryByRole('button', { name: '편집' })).toBeNull()
  })

  it('BANK_LINKED 편집 불가 버튼은 update 권한이 있을 때만 노출한다', async () => {
    mocks.canAccess.mockImplementation((_pageCode, action) => action !== 'update')
    renderPage(receipt({ kind: 'BANK_LINKED', status: 'CONFIRMED' }))

    await screen.findByText('통장연계')
    expect(screen.queryByRole('button', { name: '편집 불가' })).toBeNull()
  })

  it('CONFIRMED 수기 입금보고서는 편집 버튼을 노출한다 (편집 시 역분개 재게시)', async () => {
    renderPage(receipt({ kind: 'MANUAL_RECEIPT', status: 'CONFIRMED', journalNo: '2026/07/05-9' }))

    await screen.findByText('확정')
    expect((screen.getByRole('button', { name: '편집' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('금액이 음수이면 회계 표시 규약에 따라 danger 색상으로 렌더한다', async () => {
    renderPage(receipt({ amount: '-12000' }))

    const amount = await screen.findByText('-12,000')
    expect(amount.getAttribute('style')).toContain('var(--color-danger-700')
  })

  it('CANCELLED 수기 입금보고서는 편집 불가 버튼과 차단 사유를 노출한다', async () => {
    renderPage(receipt({ kind: 'MANUAL_RECEIPT', status: 'CANCELLED' }))

    await screen.findByText('취소')
    const edit = screen.getByRole('button', { name: '편집 불가' })
    expect((edit as HTMLButtonElement).disabled).toBe(true)
    const describedBy = edit.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy!)?.textContent).toBe('취소된 입금보고서는 수정할 수 없습니다.')
    expect(screen.queryByRole('button', { name: '편집' })).toBeNull()
  })

  it('값이 비어 있는 상세 Field 는 em dash fallback 을 렌더한다', async () => {
    renderPage(receipt({
      partnerCode: null,
      bizNo: null,
      journalNo: null,
      reverseJournalNo: null,
      externalRef: null,
      memo: null,
    }))

    await screen.findByRole('heading', { name: '2026/07/05-1' })
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(6)
    expect(screen.queryByText('-')).toBeNull()
  })

  it('kind와 CONFIRMED 상태 badge tone을 success로 렌더한다', async () => {
    renderPage(receipt({ kind: 'BANK_LINKED', status: 'CONFIRMED' }))

    expect((await screen.findByText('통장연계')).getAttribute('data-variant')).toBe('success')
    expect(screen.getByText('확정').getAttribute('data-variant')).toBe('success')
  })

  it('확정/취소/삭제 mutation을 호출한다', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mocks.confirmCashReceipt.mockResolvedValue(receipt({ status: 'CONFIRMED' }))
    mocks.cancelCashReceipt.mockResolvedValue(receipt({ status: 'CANCELLED' }))
    mocks.deleteCashReceipt.mockResolvedValue(undefined)

    renderPage(receipt())
    fireEvent.click(await screen.findByRole('button', { name: '확정' }))
    await waitFor(() => expect(mocks.confirmCashReceipt).toHaveBeenCalledWith('receipt-1'))

    cleanup()
    renderPage(receipt({ status: 'CONFIRMED' }))
    fireEvent.click(await screen.findByRole('button', { name: '취소' }))
    await waitFor(() => expect(mocks.cancelCashReceipt).toHaveBeenCalledWith('receipt-1'))

    cleanup()
    renderPage(receipt())
    fireEvent.click(await screen.findByRole('button', { name: '삭제' }))
    await waitFor(() => expect(mocks.deleteCashReceipt).toHaveBeenCalledWith('receipt-1'))
  })
})
