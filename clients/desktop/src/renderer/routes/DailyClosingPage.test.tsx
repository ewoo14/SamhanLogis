// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }))

const getDailyClosingRowsMock = vi.fn()
vi.mock('../api/closingApi', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getDailyClosingRows: (...args: unknown[]) => getDailyClosingRowsMock(...args) }
})

import { DAILY_CLOSING_HEADERS, DailyClosingPage } from './DailyClosingPage'

const rows = [
  {
    dcCondition: null, slipDate: '2026-08-14', seqNo: 2, warehouseName: null,
    productName: '미확보 품목', quantity: 0, unitPriceWithVat: null, supplyAmount: null,
    vatAmount: null, total: null, partnerName: '거래처', partnerCode: 'P-2026-0017',
    productPrice: null, discountRate: null, grandTotal: null, confirmation: 'UNDETERMINED',
    confirmationReason: '출고가·DC조건 원천 미확보', accountingPostedAt: null, dcAmount: null,
    sourceStatus: 'CONFIRMED', modelName: null, categoryKey: null, deliveryPrice: null, expectedRate: null,
  },
  {
    dcCondition: '홈45%', slipDate: '2026-08-14', seqNo: 17, warehouseName: '본사창고',
    productName: '확보 품목', quantity: 1, unitPriceWithVat: '520300', supplyAmount: '473000',
    vatAmount: '47300', total: '520300', partnerName: '거래처', partnerCode: 'P-2026-0017',
    productPrice: '520300', discountRate: '0', grandTotal: '520300', confirmation: 'CONFIRMED',
    confirmationReason: null, accountingPostedAt: '2026-08-14T11:47:00.896163', dcAmount: '0',
    sourceStatus: 'CONFIRMED', modelName: 'MODEL-17', categoryKey: 'homemulti',
    deliveryPrice: '400000', expectedRate: '45',
  },
]

const parityRows = [
  {
    dcCondition: null, slipDate: '2026-08-14', seqNo: 47, warehouseName: null,
    productName: '병합 라인 1', quantity: 1, unitPriceWithVat: 100, supplyAmount: 91,
    vatAmount: 9, total: 100, partnerName: '병합 거래처', partnerCode: 'P-MERGE',
    productPrice: 200, discountRate: 47, grandTotal: 100, confirmation: 'CONFIRMED',
    confirmationReason: null, accountingPostedAt: '2026-08-14T10:00:00', dcAmount: 0,
    sourceStatus: 'CONFIRMED', modelName: null, categoryKey: null, deliveryPrice: null, expectedRate: null,
  },
  {
    dcCondition: null, slipDate: '2026-08-14', seqNo: 47, warehouseName: null,
    productName: '병합 라인 2', quantity: 2, unitPriceWithVat: 200, supplyAmount: 182,
    vatAmount: 18, total: 200, partnerName: '병합 거래처', partnerCode: 'P-MERGE',
    productPrice: 300, discountRate: 47, grandTotal: 200, confirmation: 'CONFIRMED',
    confirmationReason: null, accountingPostedAt: '2026-08-14T10:00:00', dcAmount: 0,
    sourceStatus: 'CONFIRMED', modelName: null, categoryKey: null, deliveryPrice: null, expectedRate: null,
  },
]

const editableRows = [
  {
    dcCondition: '홈45%', slipDate: '2026-08-14', seqNo: 81, warehouseName: '본사창고',
    productName: '편집 품목', quantity: 2, unitPriceWithVat: 8000, supplyAmount: 7273,
    vatAmount: 727, total: 16000, partnerName: '거래처', partnerCode: 'P-EDIT',
    productPrice: 10000, discountRate: 20, grandTotal: 16000, confirmation: 'CONFIRMED',
    confirmationReason: null, accountingPostedAt: null, dcAmount: 0, sourceStatus: 'CONFIRMED',
    modelName: 'MODEL-81', categoryKey: 'home', deliveryPrice: 10000, expectedRate: 45,
    slipId: 'slip-81', lineId: 'line-81', updatedAt: '2026-08-14T10:00:00', amountEditable: true,
  },
  {
    dcCondition: '홈45%', slipDate: '2026-08-14', seqNo: 82, warehouseName: '본사창고',
    productName: '회계 반영 품목', quantity: 1, unitPriceWithVat: 8000, supplyAmount: 7273,
    vatAmount: 727, total: 8000, partnerName: '거래처', partnerCode: 'P-EDIT',
    productPrice: 10000, discountRate: 20, grandTotal: 8000, confirmation: 'CONFIRMED',
    confirmationReason: null, accountingPostedAt: '2026-08-14T11:00:00', dcAmount: 0,
    sourceStatus: 'CONFIRMED', modelName: null, categoryKey: null, deliveryPrice: null,
    expectedRate: null, slipId: 'slip-82', lineId: 'line-82', updatedAt: '2026-08-14T10:00:00',
    amountEditable: false, amountEditBlockReason: '회계전표가 이미 반영되었습니다.',
  },
]

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><DailyClosingPage /></QueryClientProvider>)
}

afterEach(() => {
  cleanup()
  getDailyClosingRowsMock.mockReset()
})

describe('DailyClosingPage S3 레거시 단일표', () => {
  it('출고일로 조회하고 레거시 17열을 지정 순서로 표시한다', async () => {
    getDailyClosingRowsMock.mockResolvedValue(rows)
    renderPage()

    expect(await screen.findByTestId('daily-closing-table')).toBeTruthy()
    expect(getDailyClosingRowsMock).toHaveBeenCalledWith('2026-08-14')
    expect(Array.from(screen.getByTestId('daily-closing-columns').children).map((node) => node.textContent))
      .toEqual([...DAILY_CLOSING_HEADERS])
    expect(screen.getByRole('tab', { name: /^결과/ })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /^선발행/ })).toBeTruthy()
    expect(screen.getByText('확보 품목')).toBeTruthy()
  })

  it('posted_at 유무로 결과와 선발행을 분리한다', async () => {
    getDailyClosingRowsMock.mockResolvedValue(rows)
    renderPage()

    await screen.findByText('확보 품목')
    expect(screen.queryByText('미확보 품목')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: /^선발행/ }))
    expect(screen.getByText('미확보 품목')).toBeTruthy()
    expect(screen.getByText('출고가·DC조건 원천 미확보')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: /^결과/ }))
    expect(screen.getByText('확보 품목')).toBeTruthy()
    expect(screen.queryByText('미확보 품목')).toBeNull()
  })

  it('null과 빈 원천값을 레거시처럼 0으로 표시한다', async () => {
    getDailyClosingRowsMock.mockResolvedValue(rows)
    renderPage()
    await screen.findByText('확보 품목')
    fireEvent.click(screen.getByRole('tab', { name: /^선발행/ }))
    const table = screen.getByTestId('daily-closing-table')
    expect(table.textContent).toContain('0')
  })

  it('확장행에서 현대 검증값과 DC액을 표시한다', async () => {
    getDailyClosingRowsMock.mockResolvedValue(rows)
    renderPage()
    await screen.findByText('확보 품목')
    fireEvent.click(screen.getByRole('button', { name: '상세 펼치기 17' }))
    expect(await screen.findByTestId('daily-closing-expanded-17')).toBeTruthy()
    expect(screen.getByText('모델')).toBeTruthy()
    expect(screen.getByText('MODEL-17')).toBeTruthy()
    expect(screen.getByText('기준 납품가')).toBeTruthy()
    expect(screen.getByText('DC액')).toBeTruthy()
  })

  it('문자열 열의 빈 창고명은 0이 아니라 빈칸으로 표시한다', async () => {
    getDailyClosingRowsMock.mockResolvedValue(parityRows)
    renderPage()

    const productCell = await screen.findByText('병합 라인 1')
    const row = productCell.closest('tr')
    expect(row?.children[3].textContent).toBe('')
  })

  it('같은 일자와 번호의 여러 라인은 거래처명을 하나의 셀로 병합한다', async () => {
    getDailyClosingRowsMock.mockResolvedValue(parityRows)
    renderPage()

    await screen.findByText('병합 라인 2')
    expect(screen.getAllByText('병합 거래처')).toHaveLength(1)
    expect(screen.getByText('병합 거래처').closest('td')?.getAttribute('rowspan')).toBe('2')
  })

  it('할인율 47은 47%와 dc-47 색상 클래스로 표시한다', async () => {
    getDailyClosingRowsMock.mockResolvedValue(parityRows)
    renderPage()

    const rate = (await screen.findAllByTestId('daily-closing-rate-47'))[0]!
    expect((rate as HTMLInputElement).value).toBe('47')
    expect(rate.closest('td')?.className).toContain('dc-47')
  })

  it('단가 변경 시 할인율과 공급가액·부가세·합계·총계가 화면에서 바뀐다', async () => {
    getDailyClosingRowsMock.mockResolvedValue(editableRows)
    renderPage()
    fireEvent.click(await screen.findByRole('tab', { name: /^선발행/ }))

    fireEvent.change(screen.getByTestId('daily-closing-unit-81'), { target: { value: '8,000' } })

    expect((screen.getByTestId('daily-closing-rate-81') as HTMLInputElement).value).toBe('20')
    const row = screen.getByTestId('daily-closing-unit-81').closest('tr')
    expect(row?.textContent).toContain('7,273')
    expect(row?.textContent).toContain('727')
    expect(row?.textContent).toContain('16,000')
  })

  it('할인율 변경 시 출고가 기준으로 단가가 화면에서 바뀐다', async () => {
    getDailyClosingRowsMock.mockResolvedValue(editableRows)
    renderPage()
    fireEvent.click(await screen.findByRole('tab', { name: /^선발행/ }))

    fireEvent.change(screen.getByTestId('daily-closing-rate-81'), { target: { value: '47' } })

    expect((screen.getByTestId('daily-closing-unit-81') as HTMLInputElement).value).toBe('5,300')
  })

  it('출고가 변경 시 단가는 유지하고 할인율을 다시 계산한다', async () => {
    getDailyClosingRowsMock.mockResolvedValue(editableRows)
    renderPage()
    fireEvent.click(await screen.findByRole('tab', { name: /^선발행/ }))

    fireEvent.change(screen.getByTestId('daily-closing-price-81'), { target: { value: '20,000' } })

    expect((screen.getByTestId('daily-closing-unit-81') as HTMLInputElement).value).toBe('8,000')
    expect((screen.getByTestId('daily-closing-rate-81') as HTMLInputElement).value).toBe('60')
  })

  it('회계전표가 있는 행은 금액 입력이 비활성이다', async () => {
    getDailyClosingRowsMock.mockResolvedValue(editableRows)
    renderPage()
    await screen.findByText('회계 반영 품목')

    expect((screen.getByTestId('daily-closing-unit-82') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByTestId('daily-closing-rate-82') as HTMLInputElement).disabled).toBe(true)
    expect(screen.getByText('수정 불가')).toBeTruthy()
  })
})
