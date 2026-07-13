// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../hooks/usePermissions', () => ({
  usePermissions: () => ({ canAccess: () => true, isLoading: false }),
}))
vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }))

const listDailyClosingsMock = vi.fn()
vi.mock('../api/accounting', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/accounting')>()
  return {
    ...actual,
    listDailyClosings: (...args: unknown[]) => listDailyClosingsMock(...args),
    createDailyClosing: vi.fn(),
    reverseDailyClosing: vi.fn(),
  }
})

const getDailyClosingDetailMock = vi.fn()
vi.mock('../api/closingApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/closingApi')>()
  return {
    ...actual,
    getDailyClosingDetail: (...args: unknown[]) => getDailyClosingDetailMock(...args),
  }
})

import { DailyClosingPage } from './DailyClosingPage'

const detailFixture = {
  date: '2026-07-13',
  totalTaxInvoiceCount: 1,
  totalSupply: '110000',
  totalVat: '11000',
  totalAmount: '121000',
  totalDiscount: '0',
  taxInvoices: [
    {
      taxInvoiceNo: 'TX-20260713-001',
      salesSlipNo: 'S-001',
      sourceSlipNo: 'SRC-001',
      bizNo: '1234567890',
      partnerName: '삼한테스트',
      supplyAmount: '110000',
      vatAmount: '11000',
      totalAmount: '121000',
    },
  ],
  productSummaries: [
    {
      productName: 'AM160NXVHHH1 [상업멀티]',
      modelName: null,
      quantity: 1,
      supplyAmount: 500000,
      releasePrice: 1000000,
      deliveryPrice: 700000,
      expectedRate: 45,
      actualRate: 45,
      verified: true,
      revalidationStatus: 'VERIFIED',
    },
    {
      productName: '미등록서비스품목',
      modelName: null,
      quantity: 1,
      supplyAmount: 100000,
      releasePrice: null,
      deliveryPrice: null,
      expectedRate: null,
      actualRate: null,
      verified: null,
      revalidationStatus: 'NOT_FOUND',
    },
    {
      productName: '과충전 모델',
      modelName: 'X-404',
      quantity: 1,
      supplyAmount: 105000,
      releasePrice: null,
      deliveryPrice: null,
      expectedRate: 0,
      actualRate: -5,
      verified: false,
      revalidationStatus: 'AMBIGUOUS',
    },
  ],
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <DailyClosingPage />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  listDailyClosingsMock.mockReset()
  getDailyClosingDetailMock.mockReset()
})

describe('DailyClosingPage 모델별 재검증', () => {
  it('매출 조회에서 재검증 결과와 0/null/음수 할인율을 렌더한다', async () => {
    listDailyClosingsMock.mockResolvedValue({
      content: [],
      totalElements: 0,
      totalPages: 0,
      number: 0,
      size: 20,
      first: true,
      last: true,
    })
    getDailyClosingDetailMock.mockResolvedValue(detailFixture)

    renderPage()

    await screen.findByText('모델별 재검증')

    expect(screen.getByText('AM160NXVHHH1 [상업멀티]')).toBeTruthy()
    expect(screen.getByText('1,000,000')).toBeTruthy()
    expect(screen.getAllByText('확인').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('불일치')).toBeTruthy()
    expect(screen.getByText('판정불가')).toBeTruthy()
    expect(screen.getByText('미등록')).toBeTruthy()
    expect(screen.getByText('모호')).toBeTruthy()
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3)
    expect(screen.getByText('0%')).toBeTruthy()

    const negativeRate = screen.getByText('-5%') as HTMLElement
    expect(negativeRate.getAttribute('style')).toContain('color: var(--state-danger)')
  })

  it('매입 조회에서는 재검증 테이블을 렌더하지 않고 기존 상세 전표는 유지한다', async () => {
    listDailyClosingsMock.mockResolvedValue({
      content: [],
      totalElements: 0,
      totalPages: 0,
      number: 0,
      size: 20,
      first: true,
      last: true,
    })
    getDailyClosingDetailMock.mockResolvedValue(detailFixture)

    renderPage()

    fireEvent.click(screen.getByRole('button', { name: '매출전표' }))
    fireEvent.click(screen.getByRole('radio', { name: '매입' }))

    await waitFor(() => {
      expect(getDailyClosingDetailMock).toHaveBeenLastCalledWith(
        expect.any(String),
        'PURCHASE',
        'PURCHASE_SLIP',
      )
    })

    expect(await screen.findByText('TX-20260713-001')).toBeTruthy()
    expect(screen.queryByText('모델별 재검증')).toBeNull()
  })
})
