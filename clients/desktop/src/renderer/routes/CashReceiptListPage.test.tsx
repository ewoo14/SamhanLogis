// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../hooks/usePermissions', () => ({
  usePermissions: () => ({ canAccess: () => true, isLoading: false }),
}))
vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }))

const listCashReceiptsMock = vi.fn()
vi.mock('../api/accounting', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/accounting')>()
  return { ...actual, listCashReceipts: (...args: unknown[]) => listCashReceiptsMock(...args) }
})

import { CashReceiptListPage } from './CashReceiptListPage'

function renderPage(initialEntry = '/') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <CashReceiptListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const sampleRow = {
  id: '00000000-0000-0000-0000-000000000001',
  slipNo: '2026/05/19-3',
  partnerName: '삼한공조',
  amount: '2480000',
  transactionDate: '2026-05-19',
  kind: 'DEPOSIT_REPORT',
  status: 'CONFIRMED',
  journalNo: '2026/05/19-12',
}

afterEach(() => {
  cleanup()
  listCashReceiptsMock.mockReset()
})

describe('CashReceiptListPage', () => {
  it('URL query의 필터와 page를 목록 정본으로 복원한다', async () => {
    listCashReceiptsMock.mockResolvedValue({
      content: [sampleRow], totalElements: 101, totalPages: 3, number: 2, size: 50, first: false, last: true,
    })
    renderPage('/accounting/admin/cash-receipts?partnerName=%EC%82%BC%ED%95%9C%EA%B3%B5%EC%A1%B0&kind=DEPOSIT_REPORT&page=2')

    expect(await screen.findByTestId('cash-receipt-filter-partner-name')).toHaveValue('삼한공조')
    expect(screen.getByTestId('cash-receipt-filter-kind')).toHaveValue('DEPOSIT_REPORT')
    await waitFor(() => expect(listCashReceiptsMock).toHaveBeenCalledWith(expect.objectContaining({ page: 2 })))
  })

  it('전표번호는 상세 링크로 렌더한다', async () => {
    listCashReceiptsMock.mockResolvedValue({
      content: [sampleRow], totalElements: 1, totalPages: 1, number: 0, size: 50, first: true, last: true,
    })
    renderPage()

    const slip = await screen.findByTestId('cash-receipt-slip-2026/05/19-3')
    expect(slip.textContent).toBe('2026/05/19-3')
    expect(slip).toHaveAttribute('aria-label', '2026/05/19-3 상세 보기')
    expect(slip.closest('a')?.getAttribute('href')).toBe('/accounting/admin/cash-receipts/00000000-0000-0000-0000-000000000001')
  })

  it('오류 시 에러 배너만 노출하고 빈 상태 문구는 동시 노출하지 않는다', async () => {
    listCashReceiptsMock.mockRejectedValue(new Error('boom'))
    renderPage()

    await waitFor(() => expect(screen.getByTestId('cash-receipt-error')).toBeTruthy())
    // 오류+빈 상태 동시 노출 회귀 가드
    expect(screen.queryByText('조건에 맞는 입금 자료가 없습니다.')).toBeNull()
  })

  it('목록에서는 입금보고서 신규 작성 문을 제공하지 않는다', async () => {
    listCashReceiptsMock.mockResolvedValue({
      content: [], totalElements: 0, totalPages: 0, number: 0, size: 50, first: true, last: true,
    })
    renderPage()

    await waitFor(() => expect(listCashReceiptsMock).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: '신규 작성' })).toBeNull()
  })
})
