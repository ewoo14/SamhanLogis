// @vitest-environment jsdom

import React, { useEffect, useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PartnerOrderSummary } from '../../api/sales'

const mocks = vi.hoisted(() => ({
  searchPartners: vi.fn(),
  listPartnerOrders: vi.fn(),
  getPartnerOrder: vi.fn(),
  listWarehouses: vi.fn(),
  mergeConvertToSlip: vi.fn(),
}))

const PARTNER_A = {
  id: '11111111-1111-4111-8111-111111111111',
  partnerCode: 'PARTNER-A',
  name: '거래처 A',
}
const PARTNER_B = {
  id: '22222222-2222-4222-8222-222222222222',
  partnerCode: 'PARTNER-B',
  name: '거래처 B',
}
const PARTNER_C = {
  id: '33333333-3333-4333-8333-333333333333',
  partnerCode: PARTNER_A.partnerCode,
  name: '거래처 A',
}

const order = (overrides: Partial<PartnerOrderSummary>): PartnerOrderSummary => ({
  orderNumber: '2026/07/23-1',
  partnerCode: PARTNER_A.partnerCode,
  partnerName: PARTNER_A.name,
  submittedAt: '2026-07-23T09:00:00',
  status: 'DRAFT',
  slipPublishStatus: 'NOT_REQUIRED',
  totalAmount: 1000,
  linkedSlipNo: null,
  ...overrides,
})

const ORDER_A = order({ orderNumber: '2026/07/23-A', partnerCode: PARTNER_A.partnerCode, partnerName: PARTNER_A.name })
const ORDER_B = order({ orderNumber: '2026/07/23-B', partnerCode: PARTNER_B.partnerCode, partnerName: PARTNER_B.name })
const ORDER_C = order({ orderNumber: '2026/07/23-C', partnerCode: PARTNER_C.partnerCode, partnerName: PARTNER_C.name })

vi.mock('@samhan/design-system', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  Badge: ({ children, ...props }: { children: React.ReactNode } & Record<string, unknown>) => (
    <span {...props}>{children}</span>
  ),
  OrderStatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
  Button: ({ children, ...props }: { children: React.ReactNode } & Record<string, unknown>) => (
    <button {...props}>{children}</button>
  ),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Modal: ({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) => (
    <div>{children}{footer}</div>
  ),
  Spinner: () => <span>loading</span>,
  WarehouseAutocomplete: ({ onChange }: { onChange: (id: string, warehouse: { id: string; code: string; name: string }) => void }) => (
    <button
      type="button"
      data-testid="merge-convert-warehouse-choice"
      onClick={() => onChange('warehouse-1', { id: 'warehouse-1', code: 'WH-1', name: '창고 1' })}
    >
      창고 선택
    </button>
  ),
  PartnerAutocomplete: ({ value, onChange }: {
    value: typeof PARTNER_A | typeof PARTNER_B | null
    onChange: (value: typeof PARTNER_A | typeof PARTNER_B | null) => void
  }) => (
    <div data-testid="merge-convert-partner">
      <span data-testid="merge-convert-partner-input-value">{value?.name ?? '거래처 미선택'}</span>
      <button type="button" data-testid="merge-convert-partner-a" onClick={() => onChange(PARTNER_A)}>A 선택</button>
      <button type="button" data-testid="merge-convert-partner-b" onClick={() => onChange(PARTNER_B)}>B 선택</button>
    </div>
  ),
  MultiSelectAutocomplete: ({ selected, onAdd, search }: {
    selected: PartnerOrderSummary[]
    onAdd: (order: PartnerOrderSummary) => void
    search: (query: string) => Promise<PartnerOrderSummary[]>
  }) => {
    const [candidates, setCandidates] = useState<PartnerOrderSummary[]>([])
    useEffect(() => {
      void search('').then(setCandidates)
    }, [search])
    return (
      <div data-testid="merge-convert-order-candidates">
        <span data-testid="merge-convert-mock-selected-order-count">{selected.length}개 선택됨</span>
        {candidates.map((candidate) => (
          <button
            type="button"
            key={candidate.orderNumber}
            data-testid={`merge-convert-order-candidate-${candidate.orderNumber}`}
            onClick={() => onAdd(candidate)}
          >
            {candidate.orderNumber} · {candidate.partnerName}
          </button>
        ))}
      </div>
    )
  },
}))

vi.mock('../../api/sales', async () => {
  const actual = await vi.importActual<typeof import('../../api/sales')>('../../api/sales')
  return {
    ...actual,
    listPartnerOrders: mocks.listPartnerOrders,
    getPartnerOrder: mocks.getPartnerOrder,
    mergeConvertToSlip: mocks.mergeConvertToSlip,
  }
})
vi.mock('../../api/partnerApi', () => ({ searchPartners: mocks.searchPartners }))
vi.mock('../../api/inventory', () => ({ listWarehouses: mocks.listWarehouses }))
vi.mock('../../components/sales/sales.module.css', () => ({ default: new Proxy({}, { get: (_target, key) => String(key) }) }))

import { MergeConvertDialog } from './MergeConvertDialog'

function renderDialog(
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  selectedOrders: PartnerOrderSummary[] = [],
) {
  return render(
    <QueryClientProvider client={client}>
      <MergeConvertDialog onClose={vi.fn()} onSuccess={vi.fn()} selectedOrders={selectedOrders} />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

it('restores list-selected orders after resolving their partner', async () => {
  mocks.searchPartners.mockResolvedValue([PARTNER_A])
  mocks.listPartnerOrders.mockResolvedValue({ content: [ORDER_A, ORDER_C], totalElements: 2 })
  mocks.listWarehouses.mockResolvedValue([])
  mocks.getPartnerOrder.mockImplementation(async (orderNumber: string) => ({
    orderNumber,
    partnerName: PARTNER_A.name,
    deliveryAddress: null,
    contactPhone: null,
    dueDate: null,
    memo: null,
    totalAmount: 1000,
    lines: [{ lineId: `line-${orderNumber}`, productId: 'product-1', productName: '품목', modelCode: 'MODEL-1', quantity: 1, convertedQuantity: 0 }],
  } as never))

  renderDialog(undefined, [ORDER_A, ORDER_C])

  expect((await screen.findByTestId('merge-convert-partner-input-value')).textContent).toContain(PARTNER_A.name)
  await waitFor(() => {
    expect(screen.getByTestId('merge-convert-mock-selected-order-count').textContent).toContain('2')
  })
})

it('상세 조회 실패 시 실패 사실을 표시하고 승인을 막는다', async () => {
  mocks.searchPartners.mockResolvedValue([PARTNER_A])
  mocks.listPartnerOrders.mockResolvedValue({ content: [ORDER_A, ORDER_C], totalElements: 2 })
  mocks.listWarehouses.mockResolvedValue([])
  mocks.getPartnerOrder.mockRejectedValue(new Error('detail unavailable'))

  renderDialog(undefined, [ORDER_A, ORDER_C])

  const error = await screen.findByRole('alert', {}, { timeout: 3000 })
  expect(error.textContent).toContain('주문 상세를 불러오지 못했습니다')
  expect(screen.getByTestId('merge-convert-submit').hasAttribute('disabled')).toBe(true)
})

it('승인 전 병합 미리보기는 합쳐진 모든 라인과 출처 주문번호를 보여주고 접수 라벨을 쓴다', async () => {
  mocks.searchPartners.mockResolvedValue([PARTNER_A])
  mocks.listPartnerOrders.mockResolvedValue({ content: [ORDER_A, ORDER_C], totalElements: 2 })
  mocks.listWarehouses.mockResolvedValue([])
  mocks.getPartnerOrder.mockImplementation(async (orderNumber: string) => ({
    orderNumber,
    partnerName: PARTNER_A.name,
    partnerCode: PARTNER_A.partnerCode,
    status: 'DRAFT',
    deliveryAddress: null,
    contactPhone: null,
    dueDate: null,
    memo: null,
    totalAmount: 1000,
    lines: [
      { lineId: `${orderNumber}-1`, productId: 'p-1', productName: '품목 1', modelCode: `MODEL-${orderNumber}-1`, quantity: 1, deliveryPrice: 100 },
      { lineId: `${orderNumber}-2`, productId: 'p-2', productName: '품목 2', modelCode: `MODEL-${orderNumber}-2`, quantity: 2, deliveryPrice: 200 },
    ],
  } as never))

  renderDialog(undefined, [ORDER_A, ORDER_C])

  expect(await screen.findByText('MODEL-2026-07-23-A-1')).toBeTruthy()
  expect(screen.getByText('MODEL-2026-07-23-A-2')).toBeTruthy()
  expect(screen.getByText('MODEL-2026-07-23-C-1')).toBeTruthy()
  expect(screen.getByText('MODEL-2026-07-23-C-2')).toBeTruthy()
  expect(screen.getAllByText('접수').length).toBeGreaterThan(0)
  expect(screen.getByText('출처')).toBeTruthy()
  expect(screen.getAllByText('2026/07/23-A')).toHaveLength(2)
})

it('선택 주문 거래처와 선택 건수 사이에 시각적 간격을 둔다', async () => {
  mocks.searchPartners.mockResolvedValue([PARTNER_A])
  mocks.listPartnerOrders.mockResolvedValue({ content: [ORDER_A, ORDER_C], totalElements: 2 })
  mocks.listWarehouses.mockResolvedValue([])
  mocks.getPartnerOrder.mockResolvedValue({
    orderNumber: ORDER_A.orderNumber,
    partnerName: PARTNER_A.name,
    lines: [],
  } as never)

  renderDialog(undefined, [ORDER_A, ORDER_C])

  const count = await screen.findByTestId('merge-convert-mock-selected-order-count')
  expect(count.previousElementSibling?.textContent).toContain(PARTNER_A.name)
  expect(count.getAttribute('style')).toContain('margin')
})

describe('MergeConvertDialog 거래처 우선 주문 칩', () => {
  it('거래처 A를 먼저 양성 확인하면 A 주문만 후보에 보이고 B 주문은 0건이며 거래처 변경 시 칩 선택이 초기화된다', async () => {
    mocks.searchPartners.mockResolvedValue([PARTNER_A, PARTNER_B])
    mocks.listPartnerOrders.mockImplementation(async (_page: number, _size: number, filters: { partnerCode?: string }) => {
      if (filters.partnerCode === PARTNER_A.partnerCode) {
        return { content: [ORDER_A], totalElements: 1 }
      }
      if (filters.partnerCode === PARTNER_B.partnerCode) {
        return { content: [ORDER_B], totalElements: 1 }
      }
      return { content: [ORDER_A, ORDER_B], totalElements: 2 }
    })
    mocks.listWarehouses.mockResolvedValue([])
    mocks.getPartnerOrder.mockResolvedValue({
      orderNumber: ORDER_A.orderNumber,
      partnerName: PARTNER_A.name,
      deliveryAddress: null,
      contactPhone: null,
      dueDate: null,
      memo: null,
      totalAmount: 1000,
      lines: [],
    } as never)

    renderDialog()

    fireEvent.click(screen.getByTestId('merge-convert-partner-a'))
    expect(screen.getByTestId('merge-convert-selected-partner').textContent).toContain('거래처 A')

    const candidateA = await screen.findByTestId('merge-convert-order-candidate-2026/07/23-A')
    expect(candidateA.textContent).toContain('거래처 A')
    expect(screen.queryByTestId('merge-convert-order-candidate-2026/07/23-B')).toBeNull()
    expect(mocks.listPartnerOrders).toHaveBeenCalledWith(
      0,
      50,
      expect.objectContaining({
        partnerCode: PARTNER_A.partnerCode,
        partnerIdExact: PARTNER_A.id,
      }),
    )

    fireEvent.click(candidateA)
    expect(screen.getByTestId('merge-convert-selected-order-count').textContent).toContain('1건 선택됨')

    fireEvent.click(screen.getByTestId('merge-convert-partner-b'))
    expect(screen.getByTestId('merge-convert-selected-partner').textContent).toContain('거래처 B')
    await waitFor(() => {
      expect(screen.getByTestId('merge-convert-order-candidate-2026/07/23-B').textContent).toContain('거래처 B')
    })
    expect(screen.queryByTestId('merge-convert-order-candidate-2026/07/23-A')).toBeNull()
    expect(screen.getByTestId('merge-convert-selected-order-count').textContent).toContain('0건 선택됨')
  })

  it('legacy 주문은 병합 후보에서 제외하고 단건 발행 안내 사유를 한국어로 표시한다', async () => {
    mocks.searchPartners.mockResolvedValue([PARTNER_A])
    mocks.listPartnerOrders.mockResolvedValue({
      content: [order({
        orderNumber: '2026/07/23-LEGACY',
        mergeEligible: false,
        mergeIneligibilityReason:
          '기존 주문은 거래처 정체성을 확인할 수 없어 병합할 수 없습니다. 단건 전표 발행은 계속할 수 있습니다.',
      })],
      totalElements: 1,
    })
    mocks.listWarehouses.mockResolvedValue([])

    renderDialog()
    fireEvent.click(screen.getByTestId('merge-convert-partner-a'))

    expect((await screen.findByTestId('merge-convert-order-candidates-empty')).textContent).toContain(
      '병합 가능한 진행중·보류 주문이 없습니다',
    )
    expect(screen.getByTestId('merge-convert-order-ineligible-reason').textContent).toContain(
      '기존 주문은 거래처 정체성을 확인할 수 없어 병합할 수 없습니다',
    )
    expect(screen.getByTestId('merge-convert-order-ineligible-reason').textContent).toContain('단건 전표 발행')
    expect(screen.queryByTestId('merge-convert-order-option-2026/07/23-LEGACY')).toBeNull()
  })

  it('후보가 50건을 넘으면 다음 페이지까지 모두 주문 후보에 포함한다', async () => {
    mocks.searchPartners.mockResolvedValue([PARTNER_A])
    mocks.listPartnerOrders.mockImplementation(async (page: number) => ({
      content: page === 0 ? [ORDER_A, ORDER_B] : [ORDER_C],
      totalElements: 3,
      totalPages: 2,
      number: page,
      size: 2,
      first: page === 0,
      last: page === 1,
    }))
    mocks.listWarehouses.mockResolvedValue([])

    renderDialog()
    fireEvent.click(screen.getByTestId('merge-convert-partner-a'))

    expect(await screen.findByTestId('merge-convert-order-candidate-2026/07/23-C')).toBeTruthy()
    expect(mocks.listPartnerOrders).toHaveBeenCalledWith(
      1,
      50,
      expect.objectContaining({ partnerCode: PARTNER_A.partnerCode, partnerIdExact: PARTNER_A.id }),
    )
  })

  it('주문을 추가해도 사용자가 조정한 기존 주문 수량을 유지한다', async () => {
    mocks.searchPartners.mockResolvedValue([PARTNER_A])
    mocks.listPartnerOrders.mockResolvedValue({ content: [ORDER_A, ORDER_C], totalElements: 2 })
    mocks.listWarehouses.mockResolvedValue([])
    mocks.getPartnerOrder.mockImplementation(async (orderNumber: string) => ({
      orderNumber,
      partnerName: PARTNER_A.name,
      deliveryAddress: null,
      contactPhone: null,
      dueDate: null,
      memo: null,
      totalAmount: 1000,
      lines: [{ lineId: `line-${orderNumber}`, productId: 'product-1', productName: '품목', modelCode: 'MODEL-1', quantity: 10, convertedQuantity: 0 }],
    } as never))

    renderDialog()
    fireEvent.click(screen.getByTestId('merge-convert-partner-a'))
    fireEvent.click(await screen.findByTestId('merge-convert-order-candidate-2026/07/23-A'))
    const quantity = await screen.findByTestId('merge-convert-qty-2026-07-23-A-0') as HTMLInputElement
    fireEvent.change(quantity, { target: { value: '3' } })
    fireEvent.click(screen.getByTestId('merge-convert-order-candidate-2026/07/23-C'))

    await waitFor(() => expect((screen.getByTestId('merge-convert-qty-2026-07-23-A-0') as HTMLInputElement).value).toBe('3'))
  })

  it('상세 주문 query는 5분 캐시를 재사용하지 않고 재마운트 시 최신 잔여수량을 조회한다', async () => {
    mocks.searchPartners.mockResolvedValue([PARTNER_A])
    mocks.listPartnerOrders.mockResolvedValue({ content: [ORDER_A], totalElements: 1 })
    mocks.listWarehouses.mockResolvedValue([])
    mocks.getPartnerOrder.mockResolvedValue({
      orderNumber: ORDER_A.orderNumber,
      partnerName: PARTNER_A.name,
      deliveryAddress: null,
      contactPhone: null,
      dueDate: null,
      memo: null,
      totalAmount: 1000,
      lines: [{ lineId: 'line-a', productId: 'product-1', productName: '품목', modelCode: 'MODEL-1', quantity: 4, convertedQuantity: 0 }],
    } as never)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 5 * 60 * 1000 } } })
    client.setQueryData(['partner-order', '2026-07-23-A'], {
      orderNumber: ORDER_A.orderNumber,
      partnerName: PARTNER_A.name,
      deliveryAddress: null,
      contactPhone: null,
      dueDate: null,
      memo: null,
      totalAmount: 1000,
      lines: [{ lineId: 'line-a', productId: 'product-1', productName: '품목', modelCode: 'MODEL-1', quantity: 10, convertedQuantity: 0 }],
    })

    renderDialog(client)
    fireEvent.click(screen.getByTestId('merge-convert-partner-a'))
    fireEvent.click(await screen.findByTestId('merge-convert-order-candidate-2026/07/23-A'))

    await waitFor(() => expect(mocks.getPartnerOrder).toHaveBeenCalledWith('2026-07-23-A'))
    expect((await screen.findByTestId('merge-convert-qty-2026/07/23-A-0') as HTMLInputElement).value).toBe('4')
  })

  it('같은 거래처를 다시 선택해도 선택 주문과 수량 입력을 초기화하지 않는다', async () => {
    mocks.searchPartners.mockResolvedValue([PARTNER_A])
    mocks.listPartnerOrders.mockResolvedValue({ content: [ORDER_A], totalElements: 1 })
    mocks.listWarehouses.mockResolvedValue([])
    mocks.getPartnerOrder.mockResolvedValue({
      orderNumber: ORDER_A.orderNumber,
      partnerName: PARTNER_A.name,
      deliveryAddress: null,
      contactPhone: null,
      dueDate: null,
      memo: null,
      totalAmount: 1000,
      lines: [{ lineId: 'line-a', productId: 'product-1', productName: '품목', modelCode: 'MODEL-1', quantity: 10, convertedQuantity: 0 }],
    } as never)

    renderDialog()
    fireEvent.click(screen.getByTestId('merge-convert-partner-a'))
    fireEvent.click(await screen.findByTestId('merge-convert-order-candidate-2026/07/23-A'))
    fireEvent.change(await screen.findByTestId('merge-convert-qty-2026/07/23-A-0'), { target: { value: '3' } })
    fireEvent.click(screen.getByTestId('merge-convert-partner-a'))

    expect(screen.getByTestId('merge-convert-selected-order-count').textContent).toContain('1건 선택됨')
    expect((screen.getByTestId('merge-convert-qty-2026/07/23-A-0') as HTMLInputElement).value).toBe('3')
  })

  it('409 병합 실패 시 화면의 주문 상세를 즉시 재조회한다', async () => {
    mocks.searchPartners.mockResolvedValue([PARTNER_A])
    mocks.listPartnerOrders.mockResolvedValue({ content: [ORDER_A, ORDER_C], totalElements: 2 })
    mocks.listWarehouses.mockResolvedValue([])
    mocks.getPartnerOrder.mockImplementation(async (orderNumber: string) => ({
      orderNumber,
      partnerName: PARTNER_A.name,
      deliveryAddress: '부산 사상구',
      contactPhone: '010-0000-0000',
      dueDate: null,
      memo: null,
      totalAmount: 1000,
      lines: [{ lineId: `line-${orderNumber}`, productId: 'product-1', productName: '품목', modelCode: 'MODEL-1', quantity: 10, convertedQuantity: 0 }],
    } as never))
    mocks.mergeConvertToSlip.mockRejectedValue(Object.assign(new Error('잔여수량 변경'), {
      isAxiosError: true,
      response: { status: 409, data: { message: '전환 수량이 잔여 수량을 초과합니다.' } },
    }))

    renderDialog()
    fireEvent.click(screen.getByTestId('merge-convert-partner-a'))
    fireEvent.click(await screen.findByTestId('merge-convert-order-candidate-2026/07/23-A'))
    fireEvent.click(await screen.findByTestId('merge-convert-order-candidate-2026/07/23-C'))
    await waitFor(() => expect(mocks.getPartnerOrder.mock.calls.length).toBeGreaterThanOrEqual(2))
    const initialDetailCallCount = mocks.getPartnerOrder.mock.calls.length

    fireEvent.click(screen.getByTestId('merge-convert-warehouse-choice'))
    fireEvent.click(screen.getByTestId('merge-convert-submit'))

    await waitFor(() => expect(mocks.getPartnerOrder.mock.calls.length).toBeGreaterThanOrEqual(initialDetailCallCount + 2))
  })

  it('배송지 값의 출처 라벨은 빈 값을 제거한 뒤에도 실제 주문번호를 유지한다', async () => {
    mocks.searchPartners.mockResolvedValue([PARTNER_A])
    mocks.listPartnerOrders.mockResolvedValue({ content: [ORDER_A, ORDER_C, order({ orderNumber: '2026/07/23-D' })], totalElements: 3 })
    mocks.listWarehouses.mockResolvedValue([])
    mocks.getPartnerOrder.mockImplementation(async (orderNumber: string) => ({
      orderNumber,
      partnerName: PARTNER_A.name,
      deliveryAddress: orderNumber.endsWith('A') ? '' : orderNumber.endsWith('C') ? '부산 사상구' : '서울 강남구',
      contactPhone: null,
      dueDate: null,
      memo: null,
      totalAmount: 1000,
      lines: [],
    } as never))

    renderDialog()
    fireEvent.click(screen.getByTestId('merge-convert-partner-a'))
    for (const orderNo of ['2026/07/23-A', '2026/07/23-C', '2026/07/23-D']) {
      fireEvent.click(await screen.findByTestId(`merge-convert-order-candidate-${orderNo}`))
    }

    expect(await screen.findByTestId('merge-convert-conflict-shippingAddress-radio-2026-07-23-C')).toBeTruthy()
    expect(screen.queryByTestId('merge-convert-conflict-shippingAddress-radio-2026-07-23-A')).toBeNull()
  })

  it('한 주문에만 있는 배송지는 조용히 버리지 않고 충돌 선택으로 요청한다', async () => {
    mocks.searchPartners.mockResolvedValue([PARTNER_A])
    mocks.listPartnerOrders.mockResolvedValue({ content: [ORDER_A, ORDER_C], totalElements: 2 })
    mocks.listWarehouses.mockResolvedValue([])
    mocks.getPartnerOrder.mockImplementation(async (orderNumber: string) => ({
      orderNumber,
      partnerName: PARTNER_A.name,
      deliveryAddress: orderNumber.endsWith('A') ? '' : '부산 사상구',
      contactPhone: null,
      dueDate: null,
      memo: null,
      totalAmount: 1000,
      lines: [{ lineId: `line-${orderNumber}`, productId: 'product-1', productName: '품목', modelCode: 'MODEL-1', quantity: 1, convertedQuantity: 0 }],
    } as never))

    renderDialog()
    fireEvent.click(screen.getByTestId('merge-convert-partner-a'))
    fireEvent.click(await screen.findByTestId('merge-convert-order-candidate-2026/07/23-A'))
    fireEvent.click(await screen.findByTestId('merge-convert-order-candidate-2026/07/23-C'))

    expect(await screen.findByTestId('merge-convert-conflict-shippingAddress-radio-2026-07-23-C')).toBeTruthy()
  })
})
