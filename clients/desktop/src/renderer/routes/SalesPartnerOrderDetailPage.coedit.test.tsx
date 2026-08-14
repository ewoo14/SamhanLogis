// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import type { PartnerOrderDetail } from '../api/sales'

const mocks = vi.hoisted(() => ({
  getPartnerOrder: vi.fn(),
  updatePartnerOrder: vi.fn(),
  createDocCoeditProvider: vi.fn(),
  convertPartnerOrderToSlip: vi.fn(),
  // #854 R5 LOW-3 — 기본은 데스크톱(false). 모바일 branch 커버 테스트에서만 true 로 override.
  useIsMobile: vi.fn(() => false),
}))

vi.mock('@samhan/design-system', () => ({
  Badge: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  Card: ({ children, ...props }: any) => <section {...props}>{children}</section>,
  CopyButton: ({ label }: any) => <button type="button">{label}</button>,
  OrderNumberDisplay: ({ orderNumber, ...props }: any) => <span {...props}>{orderNumber}</span>,
  OrderStatusBadge: ({ status, ...props }: any) => <span {...props} data-status={status}>{status}</span>,
  Spinner: ({ label }: any) => <span>{label}</span>,
  Button: ({ children, variant: _variant, size: _size, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
  Input: React.forwardRef<HTMLInputElement, any>(function Input(
    { label, inputSize: _inputSize, ...props },
    ref,
  ) {
    return (
      <label>
        {label ? <span>{label}</span> : null}
        <input ref={ref} {...props} />
      </label>
    )
  }),
  Modal: ({
    open,
    children,
    footer,
    title,
  }: {
    open: boolean
    children: React.ReactNode
    footer?: React.ReactNode
    title?: React.ReactNode
  }) => (open ? (
    <section>
      <h2>{title}</h2>
      {children}
      {footer}
    </section>
  ) : null),
  Select: ({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <select {...props}>{children}</select>
  ),
  WarehouseAutocomplete: ({ onChange }: { onChange?: (id: string, warehouse: { id: string; code: string; name: string }) => void }) => (
    <button
      type="button"
      data-testid="warehouse-autocomplete"
      onClick={() => onChange?.('warehouse-1', { id: 'warehouse-1', code: 'WH-1', name: '창고 1' })}
    >
      창고 선택
    </button>
  ),
}))

vi.mock('../components/collab/CollaborativeSlipInput', () => ({
  CollaborativeSlipInput: (props: {
    provider: unknown
    fieldPath: string
    value: string
    onValueChange?: (value: string) => void
    coeditPending?: boolean
    'aria-label': string
  }) => (
    <input
      aria-label={props['aria-label']}
      data-testid={`partner-order-coedit-${props.fieldPath.replace(/\./g, '-')}`}
      data-field-path={props.fieldPath}
      data-provider-present={String(!!props.provider)}
      data-coedit-pending={String(!!props.coeditPending)}
      value={props.value}
      disabled={!!props.coeditPending}
      onChange={(event) => props.onValueChange?.(event.target.value)}
    />
  ),
}))

vi.mock('../realtime/createCoeditProvider', () => ({
  createDocCoeditProvider: mocks.createDocCoeditProvider,
}))

vi.mock('../api/sales', async () => {
  const actual = await vi.importActual<typeof import('../api/sales')>('../api/sales')
  return {
    ...actual,
    getPartnerOrder: mocks.getPartnerOrder,
    updatePartnerOrder: mocks.updatePartnerOrder,
    convertPartnerOrderToSlip: mocks.convertPartnerOrderToSlip,
    deletePartnerOrder: vi.fn(),
    holdPartnerOrder: vi.fn(),
    releasePartnerOrder: vi.fn(),
  }
})

vi.mock('../api/inventory', () => ({ listWarehouses: vi.fn(() => Promise.resolve([])) }))
vi.mock('../api/client', () => ({ apiClient: { get: vi.fn() } }))
vi.mock('../api/createAuditApi', () => ({
  partnerOrderAuditApi: { listAuditLogs: vi.fn(() => Promise.resolve([])) },
}))
vi.mock('../components/collab/PartnerOrderCollaborationPanel', () => ({
  PartnerOrderCollaborationPanel: () => <div data-testid="partner-order-collab-panel" />,
}))
vi.mock('../components/audit/PartnerOrderVersionHistoryPanel', () => ({
  PartnerOrderVersionHistoryPanel: () => <div data-testid="partner-order-version-history" />,
}))
vi.mock('./components/InventoryLookupModal', () => ({
  InventoryLookupModal: () => <div data-testid="inventory-lookup-modal" />,
}))
vi.mock('./components/LineLookupReferenceModal', () => ({
  LineLookupReferenceModal: () => <div data-testid="line-lookup-reference-modal" />,
}))
vi.mock('../components/common/MobileActionSheet', () => ({ MobileActionSheet: () => null }))
vi.mock('../components/common/MobileCollapsible', () => ({
  MobileCollapsible: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('../components/sales/SalesSubNav', () => ({ SalesSubNav: () => <nav /> }))
vi.mock('../stores/pageTitle', () => ({
  usePageTitleStore: () => vi.fn(),
}))
vi.mock('../hooks/usePermissions', () => ({
  usePermissions: () => ({ canAccess: () => true }),
}))
vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: mocks.useIsMobile }))
vi.mock('../components/sales/sales.module.css', () => ({ default: new Proxy({}, { get: (_target, key) => String(key) }) }))

import { SalesPartnerOrderDetailPage } from './SalesPartnerOrderDetailPage'
import { flushZeroDelayTasks } from '../test-utils/flush'

function makeOrder(overrides: Partial<PartnerOrderDetail> = {}): PartnerOrderDetail {
  const order: PartnerOrderDetail = {
    orderNumber: 'PO/2099-1',
    partnerCode: 'PT-001',
    partnerName: '테스트 거래처',
    submittedAt: '2099-07-01T00:00:00',
    status: 'DRAFT',
    totalAmount: 20000,
    linkedSlipNo: null,
    slipPublishStatus: 'NOT_REQUIRED',
    bizCode: 'BIZ-1',
    updatedAt: '2099-07-01T00:00:00',
    deliveryAddress: null,
    siteAddress: null,
    contactPhone: null,
    dueDate: '2099-07-10',
    memo: '초기 요청',
    lines: [
      {
        productId: 'product-1',
        lineId: 'line-1',
        modelCode: 'MODEL-1',
        productName: '제품 1',
        categoryKey: 'homemulti',
        quantity: 2,
        deliveryPrice: 10000,
        subtotal: 20000,
        supplyAmount: 10005,
        vatAmount: 999,
        lineTotal: 11004,
        authority: 'TOTAL',
        remark: '라인 비고',
        convertedQuantity: 0,
        bundleMode: null,
        productType: null,
        expandedComponents: [],
      },
    ],
  }
  return { ...order, ...overrides }
}

function makeProvider() {
  const header = new Map<string, string>()
  let rows: Record<string, string>[] = []
  const subscribers = new Set<() => void>()
  const provider = {
    items: {
      toArray: () => rows,
    },
    setHeaderValue: vi.fn((fieldName: string, value: string) => {
      header.set(fieldName, value)
    }),
    getHeaderValue: vi.fn((fieldName: string) => header.get(fieldName) ?? ''),
    replaceItems: vi.fn((nextRows: Record<string, string>[]) => {
      rows = nextRows.map((row) => ({ ...row }))
    }),
    getItemValue: vi.fn((index: number, cellName: string) => rows[index]?.[cellName] ?? ''),
    setItemValue: vi.fn((index: number, cellName: string, value: string) => {
      if (!rows[index]) rows[index] = {}
      rows[index][cellName] = value
    }),
    isEmpty: vi.fn(() => true),
    subscribeDoc: vi.fn((listener: () => void) => {
      subscribers.add(listener)
      return () => subscribers.delete(listener)
    }),
    destroy: vi.fn(),
    __setRows: (nextRows: Record<string, string>[]) => {
      rows = nextRows.map((row) => ({ ...row }))
    },
    __emit: () => {
      for (const subscriber of subscribers) subscriber()
    },
  }
  return provider
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/sales/partner-orders/PO%2F2099-1']}>
          <Routes>
            <Route path="/sales/partner-orders/:id" element={<SalesPartnerOrderDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  }
}

function BrowserBackProbe() {
  const navigate = useNavigate()
  const location = useLocation()
  return (
    <div data-testid="order-list-return">
      <span data-testid="order-list-search">{location.search}</span>
      <button type="button" onClick={() => navigate(-1)}>브라우저 뒤로가기</button>
    </div>
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  // vi.clearAllMocks() 는 mock.calls 만 비우고 mockReturnValue 로 지정한 구현은 유지한다
  // (mockReset 이 아님) — 모바일 override 테스트가 이후 테스트로 새어나가지 않게 명시 복원.
  mocks.useIsMobile.mockReturnValue(false)
})

describe('SalesPartnerOrderDetailPage 출고전표 전환 오류 안내', () => {
  it('RED-LUNA-2/3: 주문 목록 복귀는 검색어를 유지하고 브라우저 뒤로 상세로 재진입하지 않는다', async () => {
    mocks.getPartnerOrder.mockResolvedValue(makeOrder())
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={[
          { pathname: '/sales/partner-orders', search: '?status=DRAFT&keyword=2026%2F06%2F08' },
          {
            pathname: '/sales/partner-orders/PO%2F2099-1',
            state: {
              returnTo: { pathname: '/sales/partner-orders', search: '?status=DRAFT&keyword=2026%2F06%2F08' },
              returnEntryKey: 'order-list-entry',
            },
          },
        ]} initialIndex={1}>
          <Routes>
            <Route path="/sales/partner-orders" element={<BrowserBackProbe />} />
            <Route path="/sales/partner-orders/:id" element={<SalesPartnerOrderDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await screen.findByText('주문서 상세')
    fireEvent.click(screen.getByRole('button', { name: '← 목록' }))
    expect(await screen.findByTestId('order-list-return')).toBeTruthy()
    expect(screen.getByTestId('order-list-search').textContent).toBe('?status=DRAFT&keyword=2026%2F06%2F08')

    fireEvent.click(screen.getByRole('button', { name: '브라우저 뒤로가기' }))
    expect(screen.queryByText('주문서 상세')).toBeNull()
    expect(screen.getByTestId('order-list-return')).toBeTruthy()
  })

  it('BUNDLE 전환 400의 구성품 전개 안내를 단건 alert에 표시한다', async () => {
    mocks.getPartnerOrder.mockResolvedValue(makeOrder({
      lines: [{ ...makeOrder().lines[0], productType: 'BUNDLE' }],
    }))
    mocks.convertPartnerOrderToSlip.mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { message: '세트 품목은 출고전표 라인으로 저장할 수 없습니다. 구성품으로 전개해 주세요.' } },
    })

    renderPage()
    await screen.findByText('PO/2099-1')
    fireEvent.click(screen.getByRole('button', { name: '출고전표 전환' }))
    fireEvent.click(screen.getByTestId('warehouse-autocomplete'))
    fireEvent.change(await screen.findByLabelText('제품 1 전환수량'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: '출고전표로 전환' }))

    const alert = await screen.findByTestId('partner-order-convert-modal-error')
    expect(alert.getAttribute('role')).toBe('alert')
    expect(alert.textContent).toContain('구성품으로 전개해 주세요.')
  })
})

describe('SalesPartnerOrderDetailPage 주문 수정모달 full-form coedit 배선', () => {
  it.each([
    ['PENDING_RETRY', '전표 발행 재시도 중', 'warning'],
    ['FAILED_PERMANENT', '전표 발행 실패', 'danger'],
  ])('전표 발행 상태 %s 를 한국어 배지(variant=%s)로 표시한다', async (slipPublishStatus, label, variant) => {
    mocks.getPartnerOrder.mockResolvedValue(makeOrder({ slipPublishStatus } as Partial<PartnerOrderDetail>))

    renderPage()

    const badge = await screen.findByTestId('partner-order-slip-publish-status')
    expect(badge.textContent).toContain(label)
    // #854 R5 LOW-2 — variant 단언 추가(warning↔danger 스왑 뮤테이션이 라벨만 보면 생존했다).
    expect(badge.getAttribute('variant')).toBe(variant)
  })

  it.each(['PUBLISHED', 'NOT_REQUIRED'] as const)(
    '전표 발행 상태 %s 는 배지를 렌더하지 않는다(정상 흐름 침묵) — #854 R5 LOW-2 음성 케이스',
    async (slipPublishStatus) => {
      mocks.getPartnerOrder.mockResolvedValue(makeOrder({ slipPublishStatus } as Partial<PartnerOrderDetail>))

      renderPage()

      // 로딩 완료 대기(주문번호는 상태와 무관하게 항상 렌더되는 안정적 신호).
      await screen.findByText('PO/2099-1')
      expect(screen.queryByTestId('partner-order-slip-publish-status')).toBeNull()
    },
  )

  it('모바일(useIsMobile=true) 요약 카드에도 전표 발행 배지를 표시한다 — #854 R5 LOW-3', async () => {
    mocks.useIsMobile.mockReturnValue(true)
    mocks.getPartnerOrder.mockResolvedValue(
      makeOrder({ slipPublishStatus: 'FAILED_PERMANENT' } as Partial<PartnerOrderDetail>),
    )

    renderPage()

    const badge = await screen.findByTestId('partner-order-slip-publish-status')
    expect(badge.textContent).toContain('전표 발행 실패')
    expect(badge.getAttribute('variant')).toBe('danger')
  })

  it('provider 생성 옵션과 헤더/라인 CollaborativeSlipInput fieldPath 를 slip 패턴으로 배선한다', async () => {
    const provider = makeProvider()
    mocks.getPartnerOrder.mockResolvedValue(makeOrder())
    mocks.createDocCoeditProvider.mockResolvedValue(provider)

    renderPage()
    fireEvent.click(await screen.findByTestId('partner-order-edit-open'))

    await waitFor(() => expect(mocks.createDocCoeditProvider).toHaveBeenCalledTimes(1))
    expect(mocks.createDocCoeditProvider).toHaveBeenCalledWith({
      documentId: 'PO/2099-1',
      basePath: '/partner-orders/PO%2F2099-1',
      headerTextFields: new Set(['memo']),
    })
    expect(provider.setHeaderValue).toHaveBeenCalledWith('partnerCode', 'PT-001')
    expect(provider.setHeaderValue).toHaveBeenCalledWith('dueDate', '2099-07-10')
    expect(provider.setHeaderValue).toHaveBeenCalledWith('memo', '초기 요청')
    expect(provider.replaceItems).toHaveBeenCalledWith([
      expect.objectContaining({
        productName: '제품 1',
        modelCode: 'MODEL-1',
        quantity: 2,
        deliveryPrice: 10000,
        remark: '라인 비고',
      }),
    ])

    for (const fieldPath of [
      'header.partnerCode',
      'header.dueDate',
      'header.memo',
      'items.0.productName',
      'items.0.modelCode',
      'items.0.quantity',
      'items.0.deliveryPrice',
      'items.0.remark',
    ]) {
      const field = await screen.findByTestId(`partner-order-coedit-${fieldPath.replace(/\./g, '-')}`)
      expect(field.getAttribute('data-field-path')).toBe(fieldPath)
      expect(field.getAttribute('data-provider-present')).toBe('true')
    }

    expect(screen.getByTestId('partner-order-edit-line-0-category')).not.toBeNull()
    expect(screen.queryByTestId('partner-order-coedit-items-0-categoryKey')).toBeNull()
  })

  it('주문 수정 PUT도 hydrate된 S/V/T/authority를 보존한다', async () => {
    const provider = makeProvider()
    mocks.getPartnerOrder.mockResolvedValue(makeOrder())
    mocks.createDocCoeditProvider.mockResolvedValue(provider)
    mocks.updatePartnerOrder.mockResolvedValue(makeOrder())

    renderPage()
    fireEvent.click(await screen.findByTestId('partner-order-edit-open'))
    await waitFor(() => expect(mocks.createDocCoeditProvider).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByTestId('partner-order-edit-submit'))

    await waitFor(() => expect(mocks.updatePartnerOrder).toHaveBeenCalledTimes(1))
    expect(mocks.updatePartnerOrder.mock.calls[0][1].lines[0]).toMatchObject({
      supplyAmount: 10005,
      vatAmount: 999,
      lineTotal: 11004,
      authority: 'TOTAL',
    })
  })

  it('provider 라인 수가 서버 라인 수와 다르면 stale 스냅샷으로 보고 서버 라인을 재시드한다', async () => {
    const provider = makeProvider()
    const order = makeOrder({
      lines: [
        ...makeOrder().lines,
        {
          ...makeOrder().lines[0],
          productId: 'product-2',
          lineId: 'line-2',
          modelCode: 'MODEL-2',
          productName: '제품 2',
          quantity: 3,
          subtotal: 30000,
          remark: '추가 라인',
        },
      ],
    })
    provider.isEmpty.mockReturnValue(false)
    provider.__setRows([
      {
        productName: 'stale 제품',
        modelCode: 'STALE',
        quantity: '1',
        deliveryPrice: '1',
        remark: 'stale',
      },
    ])
    mocks.getPartnerOrder.mockResolvedValue(order)
    mocks.createDocCoeditProvider.mockResolvedValue(provider)

    renderPage()
    fireEvent.click(await screen.findByTestId('partner-order-edit-open'))

    await waitFor(() => expect(provider.replaceItems).toHaveBeenCalledTimes(1))
    expect(provider.replaceItems).toHaveBeenCalledWith([
      expect.objectContaining({ productName: '제품 1', modelCode: 'MODEL-1' }),
      expect.objectContaining({ productName: '제품 2', modelCode: 'MODEL-2' }),
    ])
  })

  it('provider 라인 수가 서버와 다르면(슬1=라인추가 UI 없음→stale) server-wins 로 재시드한다', async () => {
    // 슬1은 coedit 라인 추가/삭제가 없어 provider 라인수 ≠ 서버 라인수 = stale 스냅샷.
    // 양방향 모두 server-wins re-seed 로 categoryKey 오염·라인 유실/재저장을 차단한다.
    const provider = makeProvider()
    provider.isEmpty.mockReturnValue(false)
    provider.__setRows([
      {
        productName: '제품 1',
        modelCode: 'MODEL-1',
        quantity: '2',
        deliveryPrice: '10000',
        remark: '라인 비고',
      },
      {
        productName: '스테일 잔여(서버에서 제거됨)',
        modelCode: 'STALE-EXTRA',
        quantity: '4',
        deliveryPrice: '12000',
        remark: '스테일',
      },
    ])
    mocks.getPartnerOrder.mockResolvedValue(makeOrder())
    mocks.createDocCoeditProvider.mockResolvedValue(provider)

    renderPage()
    fireEvent.click(await screen.findByTestId('partner-order-edit-open'))

    // provider(2) ≠ 서버(makeOrder) 라인수 → re-seed(server-wins)
    await waitFor(() => expect(provider.replaceItems).toHaveBeenCalledTimes(1))
  })

  it('editOpen 유지 중 query.data 참조만 바뀌어도 provider 를 재생성하지 않는다', async () => {
    const provider = makeProvider()
    mocks.getPartnerOrder.mockResolvedValue(makeOrder())
    mocks.createDocCoeditProvider.mockResolvedValue(provider)

    const { client } = renderPage()
    fireEvent.click(await screen.findByTestId('partner-order-edit-open'))
    await waitFor(() => expect(mocks.createDocCoeditProvider).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(provider.subscribeDoc).toHaveBeenCalledTimes(1))

    await act(async () => {
      // React Query invalidate/refetch 후 새 객체 참조가 들어와도 편집 세션은 유지되어야 한다.
      client.setQueryData(['partner-order', 'PO/2099-1'], makeOrder({ memo: '리페치 요청' }))
      await flushZeroDelayTasks()
    })

    expect(mocks.createDocCoeditProvider).toHaveBeenCalledTimes(1)
    expect(provider.destroy).not.toHaveBeenCalled()
  })

  it('provider 생성 대기 중 query.data 가 바뀌면 resolve 시점 최신 주문 데이터로 seed 한다', async () => {
    let resolveProvider!: (provider: ReturnType<typeof makeProvider>) => void
    const provider = makeProvider()
    mocks.getPartnerOrder.mockResolvedValue(makeOrder({ memo: '초기 요청' }))
    mocks.createDocCoeditProvider.mockReturnValue(
      new Promise((resolve) => {
        resolveProvider = resolve
      }),
    )
    mocks.updatePartnerOrder.mockResolvedValue(makeOrder())

    const { client } = renderPage()
    fireEvent.click(await screen.findByTestId('partner-order-edit-open'))
    await waitFor(() => expect(mocks.createDocCoeditProvider).toHaveBeenCalledTimes(1))

    await act(async () => {
      client.setQueryData(
        ['partner-order', 'PO/2099-1'],
        makeOrder({
          memo: '리페치 최신 요청',
          lines: [
            { ...makeOrder().lines[0], categoryKey: 'commercialMulti' },
            {
              ...makeOrder().lines[0],
              productId: 'product-2',
              lineId: 'line-2',
              modelCode: 'MODEL-2',
              productName: '제품 2',
              quantity: 3,
              subtotal: 30000,
              remark: '최신 추가 라인',
            },
          ],
        }),
      )
      await flushZeroDelayTasks()
    })

    resolveProvider(provider)

    await waitFor(() => expect(provider.setHeaderValue).toHaveBeenCalledWith('memo', '리페치 최신 요청'))
    expect(provider.replaceItems).toHaveBeenCalledWith([
      expect.objectContaining({ productName: '제품 1', modelCode: 'MODEL-1', categoryKey: 'commercialMulti' }),
      expect.objectContaining({ productName: '제품 2', modelCode: 'MODEL-2' }),
    ])
    await waitFor(() =>
      expect((screen.getByTestId('partner-order-edit-line-0-category') as HTMLSelectElement).value).toBe(
        'commercialMulti',
      ),
    )

    fireEvent.click(screen.getByTestId('partner-order-edit-submit'))

    await waitFor(() => expect(mocks.updatePartnerOrder).toHaveBeenCalledTimes(1))
    expect(mocks.updatePartnerOrder.mock.calls[0][1].lines[0].categoryKey).toBe('commercialMulti')
  })

  it('수정모달이 열린 뒤 query.data updatedAt 만 바뀌어도 저장은 편집 세션 기준 updatedAt 을 보낸다', async () => {
    const provider = makeProvider()
    mocks.getPartnerOrder.mockResolvedValue(makeOrder({ updatedAt: '2099-07-01T00:00:00' }))
    mocks.createDocCoeditProvider.mockResolvedValue(provider)
    mocks.updatePartnerOrder.mockResolvedValue(makeOrder({ updatedAt: '2099-07-03T00:00:00' }))

    const { client } = renderPage()
    fireEvent.click(await screen.findByTestId('partner-order-edit-open'))
    await waitFor(() => expect(mocks.createDocCoeditProvider).toHaveBeenCalledTimes(1))

    await act(async () => {
      client.setQueryData(
        ['partner-order', 'PO/2099-1'],
        makeOrder({ updatedAt: '2099-07-02T00:00:00', memo: '다른 세션 최신 요청' }),
      )
      await flushZeroDelayTasks()
    })

    fireEvent.click(screen.getByTestId('partner-order-edit-submit'))

    await waitFor(() => expect(mocks.updatePartnerOrder).toHaveBeenCalledTimes(1))
    expect(mocks.updatePartnerOrder.mock.calls[0][1].updatedAt).toBe('2099-07-01T00:00:00')
  })

  it('409 conflict reload 는 form state 와 provider 문서를 모두 최신 주문 데이터로 재시드한다', async () => {
    const provider = makeProvider()
    const conflictError = Object.assign(new Error('conflict'), {
      isAxiosError: true,
      response: { status: 409 },
    })
    mocks.getPartnerOrder
      .mockResolvedValueOnce(makeOrder({ memo: '초기 요청', updatedAt: '2099-07-01T00:00:00' }))
      .mockResolvedValueOnce(
        makeOrder({
          memo: '충돌 후 최신 요청',
          updatedAt: '2099-07-02T00:00:00',
          lines: [{ ...makeOrder().lines[0], categoryKey: 'commercialMulti', remark: '최신 라인 비고' }],
        }),
      )
    mocks.createDocCoeditProvider.mockResolvedValue(provider)
    mocks.updatePartnerOrder.mockRejectedValue(conflictError)

    renderPage()
    fireEvent.click(await screen.findByTestId('partner-order-edit-open'))
    await waitFor(() => expect(mocks.createDocCoeditProvider).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByTestId('partner-order-edit-submit'))
    await screen.findByTestId('partner-order-edit-conflict-banner')

    fireEvent.click(screen.getByTestId('partner-order-edit-reload'))

    await waitFor(() => expect(provider.setHeaderValue).toHaveBeenCalledWith('memo', '충돌 후 최신 요청'))
    expect(provider.replaceItems).toHaveBeenCalledWith([
      expect.objectContaining({ categoryKey: 'commercialMulti', remark: '최신 라인 비고' }),
    ])
    await waitFor(() =>
      expect((screen.getByTestId('partner-order-edit-line-0-category') as HTMLSelectElement).value).toBe(
        'commercialMulti',
      ),
    )

    act(() => {
      provider.__emit()
    })

    await waitFor(() =>
      expect((screen.getByTestId('partner-order-coedit-header-memo') as HTMLInputElement).value).toBe(
        '충돌 후 최신 요청',
      ),
    )
  })

  it('수정모달을 닫으면 provider 구독을 정리하고 destroy 를 호출한다', async () => {
    const provider = makeProvider()
    mocks.getPartnerOrder.mockResolvedValue(makeOrder())
    mocks.createDocCoeditProvider.mockResolvedValue(provider)

    renderPage()
    fireEvent.click(await screen.findByTestId('partner-order-edit-open'))
    await waitFor(() => expect(mocks.createDocCoeditProvider).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: '닫기' }))

    await waitFor(() => expect(provider.destroy).toHaveBeenCalledTimes(1))
  })

  it('provider 생성 실패 시 pending 을 해제하고 평문 입력 가능한 수정모달로 폴백한다', async () => {
    mocks.getPartnerOrder.mockResolvedValue(makeOrder())
    mocks.createDocCoeditProvider.mockRejectedValue(new Error('coedit unavailable'))

    renderPage()
    fireEvent.click(await screen.findByTestId('partner-order-edit-open'))

    const memoInput = await screen.findByTestId('partner-order-coedit-header-memo')
    await waitFor(() => expect(memoInput.getAttribute('data-provider-present')).toBe('false'))
    await waitFor(() => expect(memoInput.getAttribute('data-coedit-pending')).toBe('false'))
    expect((screen.getByTestId('partner-order-edit-submit') as HTMLButtonElement).disabled).toBe(false)

    fireEvent.change(memoInput, { target: { value: '평문 수정' } })
    expect((memoInput as HTMLInputElement).value).toBe('평문 수정')
  })

  it('coedit 연결 중에는 안내 문구를 표시하고 저장/구분 입력을 잠근다', async () => {
    let resolveProvider!: (provider: ReturnType<typeof makeProvider>) => void
    mocks.getPartnerOrder.mockResolvedValue(makeOrder())
    mocks.createDocCoeditProvider.mockReturnValue(
      new Promise((resolve) => {
        resolveProvider = resolve
      }),
    )

    renderPage()
    fireEvent.click(await screen.findByTestId('partner-order-edit-open'))

    expect(await screen.findByText('협업 연결 중…')).not.toBeNull()
    expect((screen.getByTestId('partner-order-edit-submit') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('partner-order-edit-line-0-category') as HTMLSelectElement).disabled).toBe(true)

    resolveProvider(makeProvider())
  })

  it('status 가 CONFIRMING 이면 수정 버튼을 노출하지 않는다', async () => {
    mocks.getPartnerOrder.mockResolvedValue(makeOrder({ status: 'CONFIRMING' }))

    renderPage()

    await screen.findByText('PO/2099-1')
    expect(screen.queryByTestId('partner-order-collab-edit-open')).toBeNull()
    expect(screen.queryByTestId('partner-order-edit-open')).toBeNull()
  })

  it('subscribeDoc 원격 업데이트를 React form state 에 반영한다', async () => {
    const provider = makeProvider()
    mocks.getPartnerOrder.mockResolvedValue(makeOrder())
    mocks.createDocCoeditProvider.mockResolvedValue(provider)

    renderPage()
    fireEvent.click(await screen.findByTestId('partner-order-edit-open'))
    await waitFor(() => expect(provider.subscribeDoc).toHaveBeenCalledTimes(1))

    provider.setHeaderValue('memo', '원격 요청')
    provider.__setRows([
      {
        productName: '원격 제품',
        modelCode: 'REMOTE-1',
        quantity: '5',
        deliveryPrice: '7000',
        remark: '원격 비고',
      },
    ])
    act(() => {
      provider.__emit()
    })

    await waitFor(() => expect((screen.getByTestId('partner-order-coedit-header-memo') as HTMLInputElement).value).toBe('원격 요청'))
    expect((screen.getByTestId('partner-order-coedit-items-0-productName') as HTMLInputElement).value).toBe('원격 제품')
    expect((screen.getByTestId('partner-order-coedit-items-0-quantity') as HTMLInputElement).value).toBe('5')
    expect((screen.getByTestId('partner-order-coedit-items-0-remark') as HTMLInputElement).value).toBe('원격 비고')
  })

  it('빈 비고를 저장할 때 null 로 복원해 BE null 보존 계약을 유지한다', async () => {
    const provider = makeProvider()
    mocks.getPartnerOrder.mockResolvedValue(makeOrder())
    mocks.createDocCoeditProvider.mockResolvedValue(provider)
    mocks.updatePartnerOrder.mockResolvedValue(makeOrder())

    renderPage()
    fireEvent.click(await screen.findByTestId('partner-order-edit-open'))
    const remarkInput = await screen.findByTestId('partner-order-coedit-items-0-remark')
    fireEvent.change(remarkInput, { target: { value: '' } })
    fireEvent.click(screen.getByTestId('partner-order-edit-submit'))

    await waitFor(() => expect(mocks.updatePartnerOrder).toHaveBeenCalledTimes(1))
    expect(mocks.updatePartnerOrder.mock.calls[0][1].lines[0].remark).toBeNull()
  })
})
