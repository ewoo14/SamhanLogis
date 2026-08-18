// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }))

const canAccessMock = vi.hoisted(() => vi.fn(() => true))
vi.mock('../hooks/usePermissions', () => ({
  usePermissions: () => ({ canAccess: canAccessMock }),
}))

const getDailyClosingRowsMock = vi.fn()
const updateDailyClosingAmountMock = vi.fn()
vi.mock('../api/closingApi', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getDailyClosingRows: (...args: unknown[]) => getDailyClosingRowsMock(...args),
    updateDailyClosingAmount: (...args: unknown[]) => updateDailyClosingAmountMock(...args),
  }
})

const createSalesSlipDraftMock = vi.fn()
const createPurchaseSlipDraftMock = vi.fn()
const listAccountingSlipLinkEligibilityMock = vi.fn()
vi.mock('../api/salesAccountingSlipApi', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, createSalesSlipDraft: (...args: unknown[]) => createSalesSlipDraftMock(...args) }
})
vi.mock('../api/purchaseAccountingSlipApi', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, createPurchaseSlipDraft: (...args: unknown[]) => createPurchaseSlipDraftMock(...args) }
})
vi.mock('../api/accountingSlipLinkApi', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, listAccountingSlipLinkEligibility: (...args: unknown[]) => listAccountingSlipLinkEligibilityMock(...args) }
})

import { DAILY_CLOSING_HEADERS, DailyClosingPage, recalculateLegacyAmounts } from './DailyClosingPage'

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
    confirmationReason: null, accountingPostedAt: null, dcAmount: 0,
    sourceStatus: 'CONFIRMED', modelName: null, categoryKey: null, deliveryPrice: null, expectedRate: null,
  },
  {
    dcCondition: null, slipDate: '2026-08-14', seqNo: 47, warehouseName: null,
    productName: '병합 라인 2', quantity: 2, unitPriceWithVat: 200, supplyAmount: 182,
    vatAmount: 18, total: 200, partnerName: '병합 거래처', partnerCode: 'P-MERGE',
    productPrice: 300, discountRate: 47, grandTotal: 200, confirmation: 'CONFIRMED',
    confirmationReason: null, accountingPostedAt: null, dcAmount: 0,
    sourceStatus: 'CONFIRMED', modelName: null, categoryKey: null, deliveryPrice: null, expectedRate: null,
  },
]

const editableRows = [
  {
    dcCondition: '홈45%', slipDate: '2026-08-14', seqNo: 81, warehouseName: '본사창고',
    productName: '편집 품목', quantity: 2, unitPriceWithVat: 8000, supplyAmount: 14546,
    vatAmount: 1454, total: 16000, partnerName: '거래처', partnerCode: 'P-EDIT',
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
  canAccessMock.mockReset()
  canAccessMock.mockReturnValue(true)
  getDailyClosingRowsMock.mockReset()
  updateDailyClosingAmountMock.mockReset()
  createSalesSlipDraftMock.mockReset()
  createPurchaseSlipDraftMock.mockReset()
  listAccountingSlipLinkEligibilityMock.mockReset()
})

describe('DailyClosingPage 서버 정본 재진입 잠금', () => {
  it('매출 생성은 같은 날짜·순번의 별도 매입 원천을 잠그지 않으며 같은 매출 원천 재생성은 차단한다', async () => {
    const salesRow = {
      ...editableRows[0],
      seqNo: 6,
      slipNo: '2026/08/14-6',
      slipId: 'outbound-slip-6',
      lineId: 'outbound-line-6',
      sourceLineNo: 1,
      taxType: 'TAXABLE' as const,
      partnerId: 'partner-6',
      productCode: 'SKU-OUT-6',
      accountingPostedAt: null,
    }
    const purchaseRow = {
      ...salesRow,
      productName: '매입 별도 원천',
      slipNo: '2026/08/14-6',
      slipId: 'inbound-slip-6',
      lineId: 'inbound-line-6',
    }
    getDailyClosingRowsMock.mockImplementation(async (_date: string, slipType?: 'OUTBOUND' | 'INBOUND') =>
      slipType === 'INBOUND' ? [purchaseRow] : [salesRow])
    let salesCreated = false
    listAccountingSlipLinkEligibilityMock.mockImplementation(async (sources: Array<{ sourceSlipNo?: string }>) =>
      sources.map((source) => ({
        sourceSlipNo: source.sourceSlipNo,
        readModel: { linkedSlips: salesCreated && source.sourceSlipNo === salesRow.slipNo ? [{ slipNo: '2026/08/14-100' }] : [] },
      })))
    createSalesSlipDraftMock.mockImplementation(async () => {
      salesCreated = true
      return { slipNo: '2026/08/14-100' }
    })

    renderPage()
    fireEvent.click(await screen.findByTestId('daily-closing-tab-result'))
    const salesButton = await screen.findByTestId('daily-closing-accounting-create-6')
    await waitFor(() => expect((salesButton as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(salesButton)
    await waitFor(() => expect(createSalesSlipDraftMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect((salesButton as HTMLButtonElement).disabled).toBe(true))

    fireEvent.click(within(screen.getByTestId('closing-kind-toggle')).getByRole('radio', { name: '매입', hidden: true }))
    fireEvent.click(await screen.findByTestId('daily-closing-tab-result'))
    const purchaseButton = await screen.findByTestId('daily-closing-accounting-create-6')
    await waitFor(() => expect((purchaseButton as HTMLButtonElement).disabled).toBe(false))
    expect(createPurchaseSlipDraftMock).not.toHaveBeenCalled()
  })

  it('전표 생성 후 화면을 나갔다 다시 들어오면 생성 버튼과 금액 입력을 계속 잠근다', async () => {
    const sourceRow = {
      ...editableRows[0],
      seqNo: 91,
      slipNo: '2026/08/14-91',
      slipId: 'source-slip-91',
      lineId: 'source-line-91',
      sourceLineNo: 1,
      taxType: 'TAXABLE',
      partnerId: 'partner-91',
      productCode: 'SKU-91',
      accountingPostedAt: null,
    }
    let created = false
    getDailyClosingRowsMock.mockResolvedValue([sourceRow])
    createSalesSlipDraftMock.mockImplementation(async () => {
      created = true
      return { slipNo: '2026/08/14-191' }
    })
    listAccountingSlipLinkEligibilityMock.mockImplementation(async () => created
      ? [{ sourceSlipNo: '2026/08/14-91', readModel: { linkedSlips: [{ slipNo: '2026/08/14-191' }] } }]
      : [{ sourceSlipNo: '2026/08/14-91', readModel: { linkedSlips: [] } }])

    const first = renderPage()
    fireEvent.click(await screen.findByTestId('daily-closing-tab-result'))
    await waitFor(() => expect(listAccountingSlipLinkEligibilityMock).toHaveBeenCalledTimes(1))
    const createButton = await screen.findByTestId('daily-closing-accounting-create-91')
    expect((createButton as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(createButton)
    await waitFor(() => expect(createSalesSlipDraftMock).toHaveBeenCalledTimes(1))

    first.unmount()
    renderPage()
    fireEvent.click(await screen.findByTestId('daily-closing-tab-result'))

    await waitFor(() => expect(listAccountingSlipLinkEligibilityMock).toHaveBeenCalledTimes(2))
    expect((await screen.findByTestId('daily-closing-accounting-create-91') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('daily-closing-unit-91') as HTMLInputElement).disabled).toBe(true)
  })

  it('서버 정본에 아직 연결이 없으면 재진입 후에도 생성과 금액 편집을 허용한다', async () => {
    const sourceRow = { ...editableRows[0], seqNo: 92, slipNo: '2026/08/14-92', slipId: 'source-slip-92', lineId: 'source-line-92', sourceLineNo: 1, taxType: 'TAXABLE', partnerId: 'partner-92', productCode: 'SKU-92', accountingPostedAt: null }
    getDailyClosingRowsMock.mockResolvedValue([sourceRow])
    listAccountingSlipLinkEligibilityMock.mockResolvedValue([{ sourceSlipNo: '2026/08/14-92', readModel: { linkedSlips: [] } }])

    const first = renderPage()
    fireEvent.click(await screen.findByTestId('daily-closing-tab-result'))
    first.unmount()
    renderPage()
    fireEvent.click(await screen.findByTestId('daily-closing-tab-result'))

    const createButton = await screen.findByTestId('daily-closing-accounting-create-92')
    expect((createButton as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByTestId('daily-closing-unit-92') as HTMLInputElement).disabled).toBe(false)
  })
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
    fireEvent.click(screen.getByRole('tab', { name: /^선발행/ }))
    expect(screen.getByText('확보 품목')).toBeTruthy()
  })

  it('레거시처럼 회계반영일자 유무로 결과와 선발행을 분리한다', async () => {
    getDailyClosingRowsMock.mockResolvedValue(rows)
    renderPage()

    await screen.findByText('미확보 품목')
    expect(screen.queryByText('확보 품목')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: /^선발행/ }))
    expect(screen.getByText('확보 품목')).toBeTruthy()
    expect(screen.queryByText('미확보 품목')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: /^결과/ }))
    expect(screen.getByText('미확보 품목')).toBeTruthy()
    expect(screen.getByText('출고가·DC조건 원천 미확보')).toBeTruthy()
  })

  it('null과 빈 원천값을 레거시처럼 0으로 표시한다', async () => {
    getDailyClosingRowsMock.mockResolvedValue(rows)
    renderPage()
    await screen.findByText('미확보 품목')
    const table = screen.getByTestId('daily-closing-table')
    expect(table.textContent).toContain('0')
  })

  it('확장행에서 현대 검증값과 DC액을 표시한다', async () => {
    getDailyClosingRowsMock.mockResolvedValue(rows)
    renderPage()
    fireEvent.click(screen.getByRole('tab', { name: /^선발행/ }))
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
    await screen.findByTestId('daily-closing-table')
    fireEvent.click(await screen.findByRole('tab', { name: /^결과/ }))
    fireEvent.change(screen.getByTestId('daily-closing-unit-81'), { target: { value: '8,000' } })

    expect((screen.getByTestId('daily-closing-rate-81') as HTMLInputElement).value).toBe('20')
    const row = screen.getByTestId('daily-closing-unit-81').closest('tr')
    expect(row?.textContent).toContain('14,546')
    expect(row?.textContent).toContain('1,454')
    expect(row?.textContent).toContain('16,000')
  })

  it('수량 2에서 단가별 VAT 분리를 수량만큼 누적한다', () => {
    expect(recalculateLegacyAmounts(
      { unit: 100, price: 200, rate: 50, quantity: 2 },
      'unit',
      '105',
    )).toMatchObject({ unit: 105, supply: 190, vat: 20, total: 210 })
  })

  it('할인율 변경 시 출고가 기준으로 단가가 화면에서 바뀐다', async () => {
    getDailyClosingRowsMock.mockResolvedValue(editableRows)
    renderPage()
    await screen.findByTestId('daily-closing-table')
    fireEvent.click(await screen.findByRole('tab', { name: /^결과/ }))

    fireEvent.change(screen.getByTestId('daily-closing-rate-81'), { target: { value: '47' } })

    expect((screen.getByTestId('daily-closing-unit-81') as HTMLInputElement).value).toBe('5,300')
  })

  it('출고가 변경 시 단가는 유지하고 할인율을 다시 계산한다', async () => {
    getDailyClosingRowsMock.mockResolvedValue(editableRows)
    renderPage()
    await screen.findByTestId('daily-closing-table')
    fireEvent.click(await screen.findByRole('tab', { name: /^결과/ }))

    fireEvent.change(screen.getByTestId('daily-closing-price-81'), { target: { value: '20,000' } })

    expect((screen.getByTestId('daily-closing-unit-81') as HTMLInputElement).value).toBe('8,000')
    expect((screen.getByTestId('daily-closing-rate-81') as HTMLInputElement).value).toBe('60')
  })

  it('회계전표가 있는 행은 금액 입력이 비활성이다', async () => {
    getDailyClosingRowsMock.mockResolvedValue(editableRows)
    renderPage()
    await screen.findByTestId('daily-closing-table')
    fireEvent.click(screen.getByRole('tab', { name: /^선발행/ }))
    await screen.findByText('회계 반영 품목')

    expect((screen.getByTestId('daily-closing-unit-82') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByTestId('daily-closing-rate-82') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByTestId('daily-closing-unit-82') as HTMLInputElement).title).toContain('회계전표')
  })

  it('레거시처럼 네 개의 상단 탭과 표 위 액션 줄을 사용한다', async () => {
    getDailyClosingRowsMock.mockResolvedValue(rows)
    renderPage()

    expect(await screen.findByTestId('daily-closing-nav')).toBeTruthy()
    expect(screen.getByRole('tab', { name: '결과' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: '선발행' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: '마감이력' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: '상세' })).toBeTruthy()
    const actionRow = screen.getByTestId('daily-closing-action-row')
    expect(actionRow.querySelector('[data-testid="daily-closing-exec-button"]')).toBeTruthy()
    expect(actionRow.querySelector('[data-testid="daily-closing-filter-reset"]')).toBeTruthy()
    expect(screen.getAllByRole('table')).toHaveLength(1)
  })

  it('마감 실행 권한이 없으면 진입 버튼도 잠기고 권한 있는 사용자는 열린다', async () => {
    getDailyClosingRowsMock.mockResolvedValue(rows)
    canAccessMock.mockImplementation((pageCode: string, action: string) =>
      pageCode === 'accounting.daily-closing.run' && action === 'create',
    )
    renderPage()

    const executeButton = await screen.findByTestId('daily-closing-exec-button')
    expect((executeButton as HTMLButtonElement).disabled).toBe(false)
    expect(canAccessMock).toHaveBeenCalledWith('accounting.daily-closing.run', 'create')

    canAccessMock.mockReturnValue(false)
    cleanup()
    renderPage()
    const deniedButton = await screen.findByTestId('daily-closing-exec-button')
    expect((deniedButton as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/마감 실행 권한이 없습니다/)).toBeTruthy()
  })

  it('현재 탭의 표 하나만 보이고 원본행 표 헤더는 고정된다', async () => {
    getDailyClosingRowsMock.mockResolvedValue(rows)
    renderPage()
    await screen.findByTestId('daily-closing-table')

    const wrapper = screen.getByTestId('daily-closing-table')
    expect((wrapper as HTMLElement).style.maxHeight).toBe('calc(100vh - 250px)')
    expect((screen.getByTestId('daily-closing-columns').firstElementChild as HTMLElement).style.position).toBe('sticky')

    fireEvent.click(screen.getByRole('tab', { name: '마감이력' }))
    expect(screen.queryByTestId('daily-closing-table')).toBeNull()
    expect(await screen.findByText('마감 이력을 불러오지 못했습니다.')).toBeTruthy()
    expect(screen.queryAllByRole('table')).toHaveLength(0)

    fireEvent.click(screen.getByRole('tab', { name: '상세' }))
    expect(screen.queryByTestId('daily-closing-list-table')).toBeNull()
    expect(screen.queryByTestId('daily-closing-table')).toBeNull()
  })

  it('기본 상태에서는 실행 패널이 닫혀 있고 액션 버튼으로만 열린다', async () => {
    getDailyClosingRowsMock.mockResolvedValue(rows)
    renderPage()

    await screen.findByTestId('daily-closing-table')
    expect(screen.queryByText('일마감 실행')).toBeNull()
    fireEvent.click(screen.getByTestId('daily-closing-exec-button'))
    expect(screen.getByText('일마감 실행')).toBeTruthy()
    expect(screen.getByTestId('daily-closing-table')).toBeTruthy()
  })

  it('여러 행을 고친 뒤 상단 저장 한 번으로 모두 요청하고 일부 409 행을 표시한다', async () => {
    const secondRow = { ...editableRows[0], seqNo: 83, slipId: 'slip-83', lineId: 'line-83' }
    getDailyClosingRowsMock.mockResolvedValue([editableRows[0], secondRow])
    updateDailyClosingAmountMock.mockImplementation(async (slipId: string) => {
      if (slipId === 'slip-83') {
        const error = new Error('conflict') as Error & { response?: { status: number } }
        error.response = { status: 409 }
        throw error
      }
    })
    renderPage()
    await screen.findByTestId('daily-closing-table')
    fireEvent.click(await screen.findByRole('tab', { name: /^결과/ }))

    fireEvent.change(screen.getByTestId('daily-closing-unit-81'), { target: { value: '8,100' } })
    fireEvent.change(screen.getByTestId('daily-closing-unit-83'), { target: { value: '8,200' } })
    await waitFor(() => expect((screen.getByTestId('daily-closing-save-all') as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByTestId('daily-closing-save-all'))

    await waitFor(() => expect(updateDailyClosingAmountMock).toHaveBeenCalledTimes(2))
    expect(await screen.findByText(/83.*다른 사람이 먼저 고쳤습니다/)).toBeTruthy()
    expect((screen.getByTestId('daily-closing-unit-81') as HTMLInputElement).value).toBe('8,100')
  })

  it('같은 전표의 두 행을 고치면 전체 라인을 한 번의 전표 단위 요청으로 보낸다', async () => {
    const secondLine = { ...editableRows[0], productName: '같은 전표 둘째 라인', lineId: 'line-81-2', unitPriceWithVat: 5000, productPrice: 6000, total: 5000, grandTotal: 5000 }
    getDailyClosingRowsMock.mockResolvedValue([editableRows[0], secondLine])
    updateDailyClosingAmountMock.mockResolvedValue(undefined)
    renderPage()
    await screen.findByTestId('daily-closing-table')
    fireEvent.click(await screen.findByRole('tab', { name: /^결과/ }))

    fireEvent.change(screen.getAllByTestId('daily-closing-unit-81')[0]!, { target: { value: '8,100' } })
    fireEvent.change(screen.getAllByLabelText('단가(VAT포함) 81')[1]!, { target: { value: '5,100' } })
    fireEvent.click(screen.getByTestId('daily-closing-save-all'))

    await waitFor(() => expect(updateDailyClosingAmountMock).toHaveBeenCalledTimes(1))
    expect(updateDailyClosingAmountMock).toHaveBeenCalledWith('slip-81', '2026-08-14T10:00:00', [
      expect.objectContaining({ lineId: 'line-81', unitPriceWithVat: 8100 }),
      expect.objectContaining({ lineId: 'line-81-2', unitPriceWithVat: 5100 }),
    ])
  })

  it('저장 메타데이터가 없는 편집행은 저장 버튼이 비활성이고 이유를 표시한다', async () => {
    getDailyClosingRowsMock.mockResolvedValue([{ ...editableRows[0], slipId: null, lineId: null, updatedAt: null }])
    renderPage()
    await screen.findByTestId('daily-closing-table')
    fireEvent.click(await screen.findByRole('tab', { name: /^결과/ }))

    fireEvent.change(screen.getByTestId('daily-closing-unit-81'), { target: { value: '8,100' } })

    await waitFor(() => expect((screen.getByTestId('daily-closing-save-all') as HTMLButtonElement).disabled).toBe(true))
    expect(screen.getByText(/저장할 식별자|최신 조회/)).toBeTruthy()
    expect(updateDailyClosingAmountMock).not.toHaveBeenCalled()
  })

  it('편집 입력 높이는 같고 할인율 접미사는 입력 옆 inline-flex로 배치된다', async () => {
    getDailyClosingRowsMock.mockResolvedValue(editableRows)
    renderPage()
    await screen.findByTestId('daily-closing-table')
    fireEvent.click(await screen.findByRole('tab', { name: /^결과/ }))

    const unit = screen.getByTestId('daily-closing-unit-81') as HTMLInputElement
    const price = screen.getByTestId('daily-closing-price-81') as HTMLInputElement
    const rate = screen.getByTestId('daily-closing-rate-81') as HTMLInputElement

    expect(unit.style.height).toBe(price.style.height)
    expect(rate.style.height).toBe(unit.style.height)
    expect(rate.parentElement?.style.display).toBe('inline-flex')
    expect(rate.nextElementSibling?.textContent).toBe('%')
  })

  it('전표별 소계와 전체 합계가 서로 다른 실제 배경색으로 표시된다', async () => {
    getDailyClosingRowsMock.mockResolvedValue([
      ...parityRows,
      { ...parityRows[0], seqNo: 48, productName: '두 번째 전표' },
    ])
    renderPage()

    const table = await screen.findByTestId('daily-closing-table')
    const subtotals = Array.from(table.querySelectorAll('[data-testid="daily-closing-subtotal-row"]')) as HTMLElement[]
    const total = table.querySelector('[data-testid="daily-closing-total-row"]') as HTMLElement

    expect(subtotals).toHaveLength(2)
    expect(getComputedStyle(subtotals[0]!).backgroundColor).toBe('rgb(235, 248, 255)')
    expect(getComputedStyle(total).backgroundColor).toBe('rgb(226, 232, 240)')
  })

  it('같은 전표의 lineId 없는 4행도 첫 행 편집·상세 상태가 서로 오염되지 않지만 저장은 막는다', async () => {
    const fourLineSlip = [
      { ...editableRows[0], seqNo: 6, slipId: 'slip-6', lineId: null, productName: '첫 행', quantity: 1, unitPriceWithVat: 16000, productPrice: 16000, supplyAmount: 14545, vatAmount: 1455, total: 16000, grandTotal: 16000 },
      { ...editableRows[0], seqNo: 6, slipId: 'slip-6', lineId: null, productName: '둘째 행', quantity: 1, unitPriceWithVat: 963040, productPrice: 963040, supplyAmount: 875491, vatAmount: 87549, total: 963040, grandTotal: 963040 },
      { ...editableRows[0], seqNo: 6, slipId: 'slip-6', lineId: null, productName: '셋째 행', quantity: 1, unitPriceWithVat: 641480, productPrice: 641480, supplyAmount: 583164, vatAmount: 58316, total: 641480, grandTotal: 641480 },
      { ...editableRows[0], seqNo: 6, slipId: 'slip-6', lineId: null, productName: '넷째 행', quantity: 1, unitPriceWithVat: 118580, productPrice: 118580, supplyAmount: 107800, vatAmount: 10780, total: 118580, grandTotal: 118580 },
    ]
    getDailyClosingRowsMock.mockResolvedValue(fourLineSlip)
    updateDailyClosingAmountMock.mockResolvedValue(undefined)
    renderPage()
    await screen.findByTestId('daily-closing-table')
    fireEvent.click(await screen.findByRole('tab', { name: /^결과/ }))

    const firstRow = screen.getByText('첫 행').closest('tr')!
    fireEvent.change(within(firstRow).getByLabelText('단가(VAT포함) 6'), { target: { value: '17,000' } })

    expect(within(firstRow).getByDisplayValue('17,000')).toBeTruthy()
    expect(screen.getAllByText('963,040')).toHaveLength(2)
    expect(screen.getAllByText('641,480')).toHaveLength(2)
    expect(screen.getAllByText('118,580')).toHaveLength(2)
    expect(screen.getByTestId('daily-closing-total-row').textContent).toContain('1,740,100')
    expect(screen.getByText(/저장되지 않은 금액 수정 1건/)).toBeTruthy()
    expect(screen.getAllByRole('button', { name: '상세 펼치기 6' })).toHaveLength(4)

    fireEvent.click(within(firstRow.parentElement!.querySelector('tr')!.nextElementSibling?.nextElementSibling ?? firstRow).getByRole('button', { name: '상세 펼치기 6' }))
    expect(screen.queryAllByTestId(/^daily-closing-expanded-/)).toHaveLength(1)
    expect(screen.getAllByTestId(/^daily-closing-expanded-/)[0]!.querySelectorAll('td')).toHaveLength(2)
    expect(firstRow.querySelector('td')?.getAttribute('rowspan')).toBe('5')
    expect(screen.getAllByRole('button', { name: '상세 펼치기 6' })).toHaveLength(3)
    const bodyRows = Array.from(screen.getByTestId('daily-closing-table').querySelectorAll('tbody > tr'))
    expect(bodyRows).toHaveLength(6) // 데이터 4 + 확장 1 + 소계 1; 별도 버튼행 없음
    expect(Array.from(firstRow.cells).reduce((sum, cell) => sum + (cell.colSpan || 1), 0)).toBe(17)
    expect(Array.from(bodyRows[1]!.cells).reduce((sum, cell) => sum + (cell.colSpan || 1), 0)).toBe(10)

    expect((screen.getByTestId('daily-closing-save-all') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/저장할 식별자|최신 조회/)).toBeTruthy()
    expect(updateDailyClosingAmountMock).not.toHaveBeenCalled()
  })

  it('레거시처럼 셀을 다중 선택하면 선택 숫자 합계와 TSV 복사를 제공한다', async () => {
    getDailyClosingRowsMock.mockResolvedValue(parityRows)
    renderPage()

    const table = await screen.findByTestId('daily-closing-table')
    const firstUnit = within(table).getByTestId('daily-closing-cell-0-단가(VAT포함)')
    const secondUnit = within(table).getByTestId('daily-closing-cell-1-단가(VAT포함)')
    fireEvent.mouseDown(firstUnit)
    fireEvent.mouseDown(secondUnit, { ctrlKey: true })

    expect(screen.getByTestId('daily-closing-selection-summary').textContent).toContain('합계: 300')

    const setData = vi.fn()
    fireEvent.copy(table, { clipboardData: { setData } })
    expect(setData).toHaveBeenCalledWith('text/plain', expect.stringContaining('100'))
    expect(setData).toHaveBeenCalledWith('text/plain', expect.stringContaining('200'))
  })

  it('레거시처럼 통합검색·열 정렬을 적용하고 삭제행은 결과에서 제외한다', async () => {
    getDailyClosingRowsMock.mockResolvedValue([
      ...parityRows,
      { ...parityRows[0], seqNo: 1, productName: '삭제되어야 함', isDeleted: true },
    ])
    renderPage()

    const table = await screen.findByTestId('daily-closing-table')
    expect(screen.queryByText('삭제되어야 함')).toBeNull()

    fireEvent.click(screen.getByTestId('daily-closing-sort-asc-번호'))
    const dataRows = Array.from(table.querySelectorAll('[data-testid^="daily-closing-data-row-"]'))
    expect(dataRows[0]?.textContent).toContain('병합 라인 1')

    fireEvent.change(screen.getByTestId('daily-closing-global-search'), { target: { value: '라인 2' } })
    expect(screen.queryByText('병합 라인 1')).toBeNull()
    expect(screen.getByText('병합 라인 2')).toBeTruthy()
  })

  it('정렬·필터 버튼은 마우스로 클릭할 수 있는 실제 크기를 가진다', async () => {
    getDailyClosingRowsMock.mockResolvedValue(parityRows)
    renderPage()

    await screen.findByTestId('daily-closing-table')
    const sortButton = screen.getByTestId('daily-closing-sort-asc-번호') as HTMLButtonElement
    const filterButton = screen.getByTestId('daily-closing-filter-button-번호') as HTMLButtonElement
    expect(sortButton.style.width).toBe('18px')
    expect(sortButton.style.height).toBe('18px')
    expect(filterButton.style.width).toBe('18px')
    expect(filterButton.style.height).toBe('18px')
  })

  it('내림차순에서도 정렬값이 같은 행의 기존 순서를 유지한다', async () => {
    getDailyClosingRowsMock.mockResolvedValue([
      { ...parityRows[0], productName: '동률 1' },
      { ...parityRows[1], productName: '동률 2' },
      { ...parityRows[0], productName: '동률 3' },
    ])
    renderPage()

    const table = await screen.findByTestId('daily-closing-table')
    fireEvent.click(screen.getByRole('button', { name: 'DC 내림차순' }))
    const dataRows = Array.from(table.querySelectorAll('[data-testid^="daily-closing-data-row-"]'))
    expect(dataRows.map((row) => row.textContent)).toEqual(expect.arrayContaining([
      expect.stringContaining('동률 1'),
      expect.stringContaining('동률 2'),
      expect.stringContaining('동률 3'),
    ]))
    expect(dataRows.findIndex((row) => row.textContent?.includes('동률 1')))
      .toBeLessThan(dataRows.findIndex((row) => row.textContent?.includes('동률 2')))
    expect(dataRows.findIndex((row) => row.textContent?.includes('동률 2')))
      .toBeLessThan(dataRows.findIndex((row) => row.textContent?.includes('동률 3')))
  })

  it('TSV 복사는 일반 숫자 셀도 화면의 콤마 표시를 유지한다', async () => {
    getDailyClosingRowsMock.mockResolvedValue([
      { ...parityRows[0], supplyAmount: 9091 },
      { ...parityRows[1], supplyAmount: 9091 },
    ])
    renderPage()

    const table = await screen.findByTestId('daily-closing-table')
    fireEvent.mouseDown(within(table).getByTestId('daily-closing-cell-0-공급가액'))
    fireEvent.mouseDown(within(table).getByTestId('daily-closing-cell-1-공급가액'), { ctrlKey: true })
    const setData = vi.fn()
    fireEvent.copy(table, { clipboardData: { setData } })
    expect(setData).toHaveBeenCalledWith('text/plain', '9,091\n9,091')
  })
})
