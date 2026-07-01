// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { EstimateDetail } from '../api/estimateApi'

const mocks = vi.hoisted(() => ({
  getEstimate: vi.fn(),
  updateEstimate: vi.fn(),
  createEstimate: vi.fn(),
  sendEstimate: vi.fn(),
  searchPartners: vi.fn(),
  lookupProductByModelName: vi.fn(),
  createDocCoeditProvider: vi.fn(),
}))

vi.mock('@samhan/design-system', () => ({
  Button: ({ children, variant: _variant, size: _size, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
  Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
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
  PartnerAutocomplete: ({ label, disabled }: { label?: string; disabled?: boolean }) => (
    <label>
      {label ? <span>{label}</span> : null}
      <input data-testid="estimate-partner-autocomplete" disabled={disabled} />
    </label>
  ),
  Spinner: ({ label }: { label?: string }) => <div role="status">{label}</div>,
}))

vi.mock('../components/collab/CollaborativeSlipInput', () => ({
  CollaborativeSlipInput: (props: {
    provider: any
    fieldPath: string
    value: string
    onValueChange?: (value: string) => void
    coeditPending?: boolean
    readOnly?: boolean
    onBlur?: () => void
    'aria-label': string
  }) => (
    <input
      aria-label={props['aria-label']}
      data-testid={`estimate-coedit-${props.fieldPath.replace(/\./g, '-')}`}
      data-field-path={props.fieldPath}
      data-provider-present={String(!!props.provider)}
      data-coedit-pending={String(!!props.coeditPending)}
      value={props.value}
      disabled={!!props.coeditPending || !!props.readOnly}
      onBlur={props.onBlur}
      onChange={(event) => {
        const nextValue = event.target.value
        props.onValueChange?.(nextValue)
        const [scope, rowKey, cellName] = props.fieldPath.split('.')
        if (props.provider && scope === 'header') props.provider.setHeaderValue(rowKey, nextValue)
        if (props.provider && scope === 'items') props.provider.setItemValue(Number(rowKey), cellName, nextValue)
      }}
    />
  ),
}))

vi.mock('../realtime/createCoeditProvider', () => ({
  createDocCoeditProvider: mocks.createDocCoeditProvider,
}))

vi.mock('../api/estimateApi', () => ({
  getEstimate: mocks.getEstimate,
  updateEstimate: mocks.updateEstimate,
  createEstimate: mocks.createEstimate,
  sendEstimate: mocks.sendEstimate,
}))

vi.mock('../api/createAuditApi', () => ({
  estimateAuditApi: {
    listAuditLogs: vi.fn(() => Promise.resolve([])),
    revertToRevision: vi.fn(),
  },
}))

vi.mock('../api/sales', () => ({
  searchPartners: mocks.searchPartners,
}))

vi.mock('../api/slip', () => ({
  lookupProductByModelName: mocks.lookupProductByModelName,
  emptyBundleSetOptions: () => ({
    outdoorUnits: 1,
    indoorUnits: 1,
    installationHours: 0,
    commissioningHours: 0,
  }),
  toApiBundleSetOptions: () => undefined,
}))

vi.mock('../realtime/EstimateRealtimeClient', () => ({
  EstimateRealtimeClient: {
    subscribe: vi.fn(() => ({ abort: vi.fn() })),
  },
}))

vi.mock('../components/audit/AuditOverlaySection', () => ({
  AuditRevisionBadge: () => <div data-testid="estimate-audit-badge" />,
}))

vi.mock('./components/LineLookupReferenceModal', () => ({
  LineLookupReferenceModal: () => <div data-testid="line-lookup-reference-modal" />,
}))

vi.mock('./components/BundleOptionRow', () => ({
  BundleOptionRow: () => <div data-testid="bundle-option-row" />,
}))

vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: vi.fn() }))
vi.mock('../hooks/usePermissions', () => ({
  usePermissions: () => ({ canAccess: () => true }),
}))

import { EstimateFormPage } from './EstimateFormPage'

function makeEstimate(overrides: Partial<EstimateDetail> = {}): EstimateDetail {
  const estimate: EstimateDetail = {
    id: 'estimate-1',
    estimateNo: 'Q-2099/07-001',
    estimateDate: '2099-07-01',
    seqNo: 1,
    status: 'QUOTE_DRAFT',
    partnerId: 'partner-1',
    partnerName: '테스트 거래처',
    partnerBusinessNo: '123-45-67890',
    partnerAddress: '서울시 중구',
    validUntil: '2099-07-31',
    totalSupply: '10000',
    totalVat: '1000',
    totalAmount: '11000',
    convertedSlipId: null,
    sentAt: null,
    acceptedAt: null,
    convertedAt: null,
    requesterId: null,
    version: 1,
    rejectedAt: null,
    memo: '초기 메모',
    lines: [
      {
        id: 'line-1',
        lineNo: 0,
        productId: 'product-1',
        productName: '제품 1',
        modelName: 'MODEL-1',
        specification: '스펙 1',
        quantity: 2,
        unitPrice: '10000',
        unitPriceWithVat: '11000',
        supplyAmount: '20000',
        vatAmount: '2000',
        lineTotal: '22000',
        note: '라인 메모',
      },
    ],
  }
  return { ...estimate, ...overrides }
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
      rows[index] = { ...(rows[index] ?? {}), [cellName]: value }
    }),
    isEmpty: vi.fn(() => true),
    subscribeDoc: vi.fn((listener: () => void) => {
      subscribers.add(listener)
      return () => subscribers.delete(listener)
    }),
    subscribeAwareness: vi.fn(() => () => undefined),
    getRemoteCursors: vi.fn(() => []),
    getRemoteEdits: vi.fn(() => []),
    setLocalCursor: vi.fn(),
    setLocalLastEdit: vi.fn(),
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

function renderPage(initialPath = '/sales/estimates/estimate-1/edit') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/sales/estimates/:id/edit" element={<EstimateFormPage />} />
          <Route path="/sales/estimates/new" element={<EstimateFormPage />} />
          <Route path="/sales/estimates/:id" element={<div data-testid="estimate-detail" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('EstimateFormPage 견적 편집 full-form coedit 배선', () => {
  it('provider 생성 옵션과 헤더/라인 CollaborativeSlipInput fieldPath 를 slip 패턴으로 배선한다', async () => {
    const provider = makeProvider()
    mocks.getEstimate.mockResolvedValue(makeEstimate())
    mocks.createDocCoeditProvider.mockResolvedValue(provider)

    renderPage()

    await waitFor(() => expect(mocks.createDocCoeditProvider).toHaveBeenCalledTimes(1))
    expect(mocks.createDocCoeditProvider).toHaveBeenCalledWith({
      documentId: 'estimate-1',
      basePath: '/slips/estimates/estimate-1',
      headerTextFields: new Set(['memo']),
    })
    expect(provider.setHeaderValue).toHaveBeenCalledWith('partnerName', '테스트 거래처')
    expect(provider.setHeaderValue).toHaveBeenCalledWith('partnerBusinessNo', '123-45-67890')
    expect(provider.setHeaderValue).toHaveBeenCalledWith('partnerAddress', '서울시 중구')
    expect(provider.setHeaderValue).toHaveBeenCalledWith('estimateDate', '2099-07-01')
    expect(provider.setHeaderValue).toHaveBeenCalledWith('validUntil', '2099-07-31')
    expect(provider.setHeaderValue).toHaveBeenCalledWith('memo', '초기 메모')
    expect(provider.replaceItems).toHaveBeenCalledWith([
      expect.objectContaining({
        modelName: 'MODEL-1',
        productName: '제품 1',
        specification: '스펙 1',
        quantity: '2',
        unitPrice: '11000',
        productId: 'product-1',
      }),
    ])

    for (const fieldPath of [
      'header.partnerName',
      'header.partnerBusinessNo',
      'header.partnerAddress',
      'header.estimateDate',
      'header.validUntil',
      'header.memo',
      'items.0.modelName',
      'items.0.productName',
      'items.0.specification',
      'items.0.quantity',
      'items.0.unitPrice',
    ]) {
      const field = await screen.findByTestId(`estimate-coedit-${fieldPath.replace(/\./g, '-')}`)
      expect(field.getAttribute('data-field-path')).toBe(fieldPath)
      expect(field.getAttribute('data-provider-present')).toBe('true')
    }
    expect((screen.getByTestId('estimate-partner-autocomplete') as HTMLInputElement).disabled).toBe(true)
  })

  it('subscribeDoc 원격 업데이트를 React form state 에 반영한다', async () => {
    const provider = makeProvider()
    mocks.getEstimate.mockResolvedValue(makeEstimate())
    mocks.createDocCoeditProvider.mockResolvedValue(provider)

    renderPage()
    await waitFor(() => expect(provider.subscribeDoc).toHaveBeenCalledTimes(1))

    provider.setHeaderValue('partnerName', '원격 거래처')
    provider.setHeaderValue('partnerBusinessNo', '999-88-77777')
    provider.setHeaderValue('partnerAddress', '원격 주소')
    provider.setHeaderValue('estimateDate', '2099-08-01')
    provider.setHeaderValue('validUntil', '2099-08-31')
    provider.setHeaderValue('memo', '원격 메모')
    provider.__setRows([
      {
        modelName: 'REMOTE-1',
        productName: '원격 제품',
        specification: '원격 스펙',
        quantity: '5',
        unitPrice: '7000',
        productId: 'product-remote',
      },
    ])
    act(() => {
      provider.__emit()
    })

    await waitFor(() => expect((screen.getByTestId('estimate-coedit-header-memo') as HTMLInputElement).value).toBe('원격 메모'))
    expect((screen.getByTestId('estimate-coedit-header-partnerName') as HTMLInputElement).value).toBe('원격 거래처')
    expect((screen.getByTestId('estimate-coedit-items-0-modelName') as HTMLInputElement).value).toBe('REMOTE-1')
    expect((screen.getByTestId('estimate-coedit-items-0-productName') as HTMLInputElement).value).toBe('원격 제품')
    expect((screen.getByTestId('estimate-coedit-items-0-quantity') as HTMLInputElement).value).toBe('5')
  })

  it('provider 생성 실패 시 pending 을 해제하고 평문 입력 가능한 폼으로 폴백한다', async () => {
    mocks.getEstimate.mockResolvedValue(makeEstimate())
    mocks.createDocCoeditProvider.mockRejectedValue(new Error('coedit unavailable'))

    renderPage()

    const memoInput = await screen.findByTestId('estimate-coedit-header-memo')
    await waitFor(() => expect(memoInput.getAttribute('data-provider-present')).toBe('false'))
    await waitFor(() => expect(memoInput.getAttribute('data-coedit-pending')).toBe('false'))
    expect((screen.getByTestId('estimate-form-save-button') as HTMLButtonElement).disabled).toBe(false)

    fireEvent.change(memoInput, { target: { value: '평문 수정' } })
    expect((memoInput as HTMLInputElement).value).toBe('평문 수정')
  })

  it('coedit 연결 중에는 안내 문구를 표시하고 입력/저장을 잠근다', async () => {
    let resolveProvider!: (provider: ReturnType<typeof makeProvider>) => void
    mocks.getEstimate.mockResolvedValue(makeEstimate())
    mocks.createDocCoeditProvider.mockReturnValue(
      new Promise((resolve) => {
        resolveProvider = resolve
      }),
    )

    renderPage()

    expect(await screen.findByText('협업 연결 중…')).not.toBeNull()
    expect((screen.getByTestId('estimate-form-save-button') as HTMLButtonElement).disabled).toBe(true)
    expect((await screen.findByTestId('estimate-coedit-header-memo')).getAttribute('data-coedit-pending')).toBe('true')

    resolveProvider(makeProvider())
  })

  it('편집불가 status 에서는 coedit provider 를 생성하지 않는다', async () => {
    mocks.getEstimate.mockResolvedValue(makeEstimate({ status: 'QUOTE_CONVERTED' }))

    renderPage()

    await screen.findByText('이 견적서는 수락/거절/변환되어 더 이상 수정할 수 없습니다.')
    expect(mocks.createDocCoeditProvider).not.toHaveBeenCalled()
  })

  it('모델 lookup 성공 시 productName/unitPrice/productId 를 provider 에도 동기화한다', async () => {
    const provider = makeProvider()
    mocks.getEstimate.mockResolvedValue(makeEstimate())
    mocks.createDocCoeditProvider.mockResolvedValue(provider)
    mocks.lookupProductByModelName.mockResolvedValue({
      productId: 'product-lookup',
      productName: '조회 제품',
      productType: 'SINGLE',
      sellingPrice: '33000',
    })

    renderPage()
    await screen.findByTestId('estimate-coedit-items-0-modelName')
    provider.setItemValue(0, 'modelName', 'LOOKUP-1')
    act(() => {
      provider.__emit()
    })
    await waitFor(() => expect((screen.getByTestId('estimate-coedit-items-0-modelName') as HTMLInputElement).value).toBe('LOOKUP-1'))
    fireEvent.blur(screen.getByTestId('estimate-coedit-items-0-modelName'))

    await waitFor(() => expect(mocks.lookupProductByModelName).toHaveBeenCalledWith('LOOKUP-1'))
    expect(provider.setItemValue).toHaveBeenCalledWith(0, 'productName', '조회 제품')
    expect(provider.setItemValue).toHaveBeenCalledWith(0, 'unitPrice', '11000')
    expect(provider.setItemValue).toHaveBeenCalledWith(0, 'productId', 'product-lookup')
  })

  it('provider 라인 수가 서버 라인 수와 다르면 server-wins 로 재시드한다', async () => {
    const provider = makeProvider()
    provider.isEmpty.mockReturnValue(false)
    provider.__setRows([
      {
        modelName: 'STALE',
        productName: '스테일 제품',
        specification: '스테일',
        quantity: '1',
        unitPrice: '1',
        productId: 'stale-product',
      },
    ])
    mocks.getEstimate.mockResolvedValue(makeEstimate({
      lines: [
        ...makeEstimate().lines,
        {
          ...makeEstimate().lines[0],
          id: 'line-2',
          productId: 'product-2',
          modelName: 'MODEL-2',
          productName: '제품 2',
          quantity: 3,
          unitPriceWithVat: '12000',
        },
      ],
    }))
    mocks.createDocCoeditProvider.mockResolvedValue(provider)

    renderPage()

    await waitFor(() => expect(provider.replaceItems).toHaveBeenCalledTimes(1))
    expect(provider.replaceItems).toHaveBeenCalledWith([
      expect.objectContaining({ modelName: 'MODEL-1', productName: '제품 1' }),
      expect.objectContaining({ modelName: 'MODEL-2', productName: '제품 2' }),
    ])
  })
})
