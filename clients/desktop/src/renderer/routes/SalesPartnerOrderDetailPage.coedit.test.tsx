// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { PartnerOrderDetail } from '../api/sales'

const mocks = vi.hoisted(() => ({
  getPartnerOrder: vi.fn(),
  updatePartnerOrder: vi.fn(),
  createDocCoeditProvider: vi.fn(),
}))

vi.mock('@samhan/design-system', () => ({
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
  WarehouseAutocomplete: () => <div data-testid="warehouse-autocomplete" />,
}))

vi.mock('../components/collab/CollaborativeSlipInput', () => ({
  CollaborativeSlipInput: (props: {
    provider: unknown
    fieldPath: string
    value: string
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
      readOnly
    />
  ),
}))

vi.mock('../realtime/createCoeditProvider', () => ({
  createDocCoeditProvider: mocks.createDocCoeditProvider,
}))

vi.mock('../api/sales', () => ({
  PARTNER_ORDER_STATUS_LABEL: {
    DRAFT: '진행중',
    ON_HOLD: '보류',
    CONFIRMING: '확인중',
    CONFIRMED: '완료',
    CANCELED: '취소',
    CONVERTED: '전환완료',
  },
  getPartnerOrder: mocks.getPartnerOrder,
  updatePartnerOrder: mocks.updatePartnerOrder,
  convertPartnerOrderToSlip: vi.fn(),
  deletePartnerOrder: vi.fn(),
  holdPartnerOrder: vi.fn(),
  releasePartnerOrder: vi.fn(),
}))

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
vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('../components/sales/sales.module.css', () => ({ default: new Proxy({}, { get: (_target, key) => String(key) }) }))

import { SalesPartnerOrderDetailPage } from './SalesPartnerOrderDetailPage'

function makeOrder(): PartnerOrderDetail {
  return {
    orderNumber: 'PO/2099-1',
    partnerCode: 'PT-001',
    partnerName: '테스트 거래처',
    submittedAt: '2099-07-01T00:00:00',
    status: 'DRAFT',
    totalAmount: 20000,
    linkedSlipNo: null,
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
        remark: '라인 비고',
        convertedQuantity: 0,
        bundleMode: null,
        productType: null,
        expandedComponents: [],
      },
    ],
  }
}

function makeProvider() {
  const header = new Map<string, string>()
  let rows: Record<string, string>[] = []
  const subscribers = new Set<() => void>()
  return {
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
    isEmpty: vi.fn(() => true),
    subscribeDoc: vi.fn((listener: () => void) => {
      subscribers.add(listener)
      return () => subscribers.delete(listener)
    }),
    destroy: vi.fn(),
  }
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/sales/partner-orders/PO%2F2099-1']}>
        <Routes>
          <Route path="/sales/partner-orders/:id" element={<SalesPartnerOrderDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SalesPartnerOrderDetailPage 주문 수정모달 full-form coedit 배선', () => {
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
})
