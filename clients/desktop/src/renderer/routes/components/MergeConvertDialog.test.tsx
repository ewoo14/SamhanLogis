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

vi.mock('@samhan/design-system', () => ({
  Badge: ({ children, ...props }: { children: React.ReactNode } & Record<string, unknown>) => (
    <span {...props}>{children}</span>
  ),
  Button: ({ children, ...props }: { children: React.ReactNode } & Record<string, unknown>) => (
    <button {...props}>{children}</button>
  ),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Modal: ({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) => (
    <div>{children}{footer}</div>
  ),
  Spinner: () => <span>loading</span>,
  WarehouseAutocomplete: () => <div data-testid="merge-convert-warehouse" />,
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

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MergeConvertDialog onClose={vi.fn()} onSuccess={vi.fn()} selectedOrders={[]} />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('MergeConvertDialog 거래처 우선 주문 칩', () => {
  it('거래처 A를 먼저 양성 확인하면 A 주문만 후보에 보이고 B 주문은 0건이며 거래처 변경 시 칩 선택이 초기화된다', async () => {
    mocks.searchPartners.mockResolvedValue([PARTNER_A, PARTNER_B])
    mocks.listPartnerOrders.mockImplementation(async (_page: number, _size: number, filters: { partnerId?: string }) => {
      if (filters.partnerId === PARTNER_A.partnerCode) return { content: [ORDER_A], totalElements: 1 }
      if (filters.partnerId === PARTNER_B.partnerCode) return { content: [ORDER_B], totalElements: 1 }
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
      expect.objectContaining({ partnerId: PARTNER_A.partnerCode }),
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
})
