// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../hooks/usePermissions', () => ({
  usePermissions: () => ({ canAccess: () => true, isLoading: false }),
}))
vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }))

const listCashReceiptsMock = vi.fn()
const { getScrollAnchorMock } = vi.hoisted(() => ({ getScrollAnchorMock: vi.fn(() => 640) }))
vi.mock('../utils/returnContract', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/returnContract')>()
  return { ...actual, getScrollAnchor: getScrollAnchorMock }
})
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
  it('입금보고서 복귀는 한 번의 프레임 복원만 사용한다', async () => {
    const source = (await import('node:fs')).readFileSync('src/renderer/routes/CashReceiptListPage.tsx', 'utf8')
    expect(source).not.toContain('const delayed = window.setTimeout(restore, 100)')
  })

  it('URL query의 필터와 page를 목록 정본으로 복원한다', async () => {
    listCashReceiptsMock.mockResolvedValue({
      content: [sampleRow], totalElements: 101, totalPages: 3, number: 2, size: 50, first: false, last: true,
    })
    renderPage('/accounting/admin/cash-receipts?partnerName=%EC%82%BC%ED%95%9C%EA%B3%B5%EC%A1%B0&kind=DEPOSIT_REPORT&page=2')

    expect(await screen.findByTestId('cash-receipt-filter-partner-name')).toHaveValue('삼한공조')
    expect(screen.getByTestId('cash-receipt-filter-kind')).toHaveValue('DEPOSIT_REPORT')
    await waitFor(() => expect(listCashReceiptsMock).toHaveBeenCalledWith(expect.objectContaining({ page: 2 })))
  })

  it('복귀 URL이 같은 입금보고서라도 스크롤 identity를 값으로 복원한다', async () => {
    listCashReceiptsMock.mockResolvedValue({
      content: [sampleRow], totalElements: 1, totalPages: 1, number: 0, size: 50, first: true, last: true,
    })
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={[{ pathname: '/accounting/admin/cash-receipts', search: '?slipNo=2026%2F08%2F07-8', key: 'cash-list-entry' }]}>
          <CashReceiptListPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await screen.findByTestId('cash-receipt-filter-slip-no')
    expect(screen.getByTestId('cash-receipt-filter-slip-no')).toHaveValue('2026/08/07-8')
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 640, behavior: 'auto' }))
    scrollTo.mockRestore()
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

  it('삭제로 현재 page가 비면 필터를 유지한 채 마지막 유효 page로 clamp한다', async () => {
    listCashReceiptsMock
      .mockResolvedValueOnce({ content: [], totalElements: 51, totalPages: 2, number: 2, size: 50, first: false, last: true })
      .mockResolvedValueOnce({ content: [sampleRow], totalElements: 50, totalPages: 2, number: 1, size: 50, first: false, last: true })
    renderPage('/accounting/admin/cash-receipts?kind=DEPOSIT_REPORT&page=2')

    await waitFor(() => expect(listCashReceiptsMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(listCashReceiptsMock).toHaveBeenCalledTimes(2))
    expect(listCashReceiptsMock).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, kind: 'DEPOSIT_REPORT' }))
  })
})
