// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { EstimateDetail } from '../api/estimateApi'
import { markEstimateRestoreFence } from '../utils/estimateRestoreFence'

const mocks = vi.hoisted(() => ({
  getEstimate: vi.fn(),
  updateEstimate: vi.fn(),
  createEstimate: vi.fn(),
  sendEstimate: vi.fn(),
  searchPartners: vi.fn(),
  lookupProductByModelName: vi.fn(),
  searchProducts: vi.fn(),
  getPriceMemory: vi.fn(),
  getPriceMemories: vi.fn(),
  lookupProducts: vi.fn(),
  createDocCoeditProvider: vi.fn(),
  selectPartnerOnMount: false,
  partnerA: {
    id: '11111111-1111-1111-1111-111111111111',
    partnerCode: 'P-A',
    name: 'Partner A',
    bizNo: '111-11-11111',
  },
  partnerB: {
    id: '22222222-2222-2222-2222-222222222222',
    partnerCode: 'P-B',
    name: 'Partner B',
    bizNo: '222-22-22222',
  },
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
  // 실 FormField 는 render-prop 으로 id/aria 배선을 내려준다 — mock 도 같은 계약을 지켜야
  // '거래처명 read-only 강등'(R8-DESIGN-1) 이 mock gate 를 실제로 통과한다.
  FormField: ({ label, required, hint, error, render }: any) => (
    <div>
      <label>{label}{required ? ' *' : ''}</label>
      {render({ id: undefined, ariaDescribedBy: undefined, invalid: Boolean(error), required })}
      {hint && !error ? <span>{hint}</span> : null}
      {error ? <span role="alert">{error}</span> : null}
    </div>
  ),
  // 실 PartnerAutocomplete 은 controlled value 를 getInputLabel(partner)=partner.name 으로 입력창에
  // 표시한다. mock 도 value 를 렌더해야 "원격 거래처 변경이 자동완성에 반영되는가" 를 검증할 수 있다.
  PartnerAutocomplete: ({ label, disabled, onChange, error, value }: { label?: string; disabled?: boolean; onChange: (value: unknown) => void; error?: string; value?: { name?: string } | null }) => {
    const selectedOnMountRef = React.useRef(false)
    React.useLayoutEffect(() => {
      if (!mocks.selectPartnerOnMount || selectedOnMountRef.current || disabled) return
      selectedOnMountRef.current = true
      onChange(mocks.partnerB)
    }, [disabled, onChange])
    return (
      <label>
        {label ? <span>{label}</span> : null}
        <input
          data-testid="estimate-partner-autocomplete"
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          value={value?.name ?? ''}
          readOnly
        />
        {error ? <span role="alert">{error}</span> : null}
        <button type="button" data-testid="estimate-select-partner-a" disabled={disabled} onClick={() => onChange(mocks.partnerA)}>
          partner-a
        </button>
        <button type="button" data-testid="estimate-select-partner-b" disabled={disabled} onClick={() => onChange(mocks.partnerB)}>
          partner-b
        </button>
        <button type="button" data-testid="estimate-clear-partner" disabled={disabled} onClick={() => onChange(null)}>
          clear-partner
        </button>
      </label>
    )
  },
  Spinner: ({ label }: { label?: string }) => <div role="status">{label}</div>,
  ProductAutocomplete: ({
    value,
    onChange,
    onInputCommitChange,
    onInputBlur,
    searchProducts,
    resultSelectionMode,
    ariaLabel,
    disabled,
  }: any) => {
    const [draft, setDraft] = React.useState(value?.modelName ?? '')
    const [candidates, setCandidates] = React.useState<any[]>([])
    const lineNumber = Number(/라인 (\d+)/.exec(ariaLabel)?.[1] ?? 1)
    const search = async () => {
      const next = await searchProducts(draft)
      if (next.length === 1) {
        onChange(next[0])
        return next
      }
      setCandidates(next)
      return next
    }
    return (
      <div>
        <input
          aria-label={ariaLabel}
          disabled={disabled}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value)
            onInputCommitChange?.(false)
          }}
          onBlur={async () => {
            const next = await search()
            if (next?.length !== 1) onInputBlur?.(draft)
          }}
        />
        {candidates.length > 1 ? (
          <div role="dialog" aria-label="품목 검색 결과">
            {candidates.map((candidate) => (
              <div key={candidate.id}>
                <span>{candidate.modelName}</span>
                <span>{candidate.productName}</span>
                <span>{candidate.specification}</span>
                <span>{candidate.sellingPrice?.toLocaleString('ko-KR')}원</span>
                <button type="button" onClick={() => onChange(candidate)}>선택</button>
              </div>
            ))}
          </div>
        ) : null}
        <span data-testid="estimate-product-result-selection-mode">{resultSelectionMode}</span>
      </div>
    )
  },
}))

vi.mock('../components/collab/CollaborativeSlipInput', () => ({
  CollaborativeSlipInput: (props: {
    provider: any
    fieldPath: string
    value: string
    onValueChange?: (value: string) => void
    onDocSyncValueChange?: (value: string) => void
    coeditPending?: boolean
    readOnly?: boolean
    onBlur?: () => void
    'aria-label': string
    'aria-describedby'?: string
    inputStyle?: React.CSSProperties
  }) => (
    <input
      aria-label={props['aria-label']}
      aria-describedby={props['aria-describedby']}
      style={props.inputStyle}
      data-testid={`estimate-coedit-${props.fieldPath.replace(/\./g, '-')}`}
      data-field-path={props.fieldPath}
      data-provider-present={String(!!props.provider)}
      data-coedit-pending={String(!!props.coeditPending)}
      data-doc-sync={String(!!props.onDocSyncValueChange)}
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

vi.mock('../api/sales', () => ({
  searchPartners: mocks.searchPartners,
}))

vi.mock('../api/slip', () => ({
  lookupProductByModelName: mocks.lookupProductByModelName,
  getPriceMemories: mocks.getPriceMemories,
  getPriceMemory: mocks.getPriceMemory,
  emptyBundleSetOptions: () => ({
    outdoorUnits: 1,
    indoorUnits: 1,
    installationHours: 0,
    commissioningHours: 0,
  }),
  toApiBundleSetOptions: () => undefined,
}))

vi.mock('../api/productApi', () => ({
  lookupProducts: mocks.lookupProducts,
  searchProducts: mocks.searchProducts,
}))

vi.mock('./components/LineLookupReferenceModal', () => ({
  LineLookupReferenceModal: () => <div data-testid="line-lookup-reference-modal" />,
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
    estimateNo: '2099/07/01-1',
    estimateDate: '2099-07-01',
    seqNo: 1,
    status: 'QUOTE_DRAFT',
    partnerId: '11111111-1111-1111-1111-111111111111',
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
    isDeleted: false,
    deletedAt: null,
    deletedByName: null,
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
        unitPrice: 10000 as unknown as string,
        unitPriceWithVat: '11000',
        supplyAmount: '20000',
        vatAmount: '2000',
        lineTotal: '22000',
        note: '라인 메모',
        setHead: false,
        parentSetModel: null,
      },
    ],
  }
  return { ...estimate, ...overrides }
}

function makeProvider(options: { requireUnitPriceTransaction?: boolean } = {}) {
  const header = new Map<string, string>()
  let rows: Record<string, string>[] = []
  const subscribers = new Set<() => void>()
  let transactionDepth = 0
  const provider = {
    items: {
      toArray: () => rows,
    },
    // D-R8-7: 거래처 4필드는 CRDT 트랜잭션 1회로 원자 전파한다(중간 상태 관측 창 차단).
    doc: { transact: vi.fn((fn: () => void) => {
      transactionDepth += 1
      try {
        fn()
      } finally {
        transactionDepth -= 1
      }
    }) },
    setHeaderValue: vi.fn((fieldName: string, value: string) => {
      header.set(fieldName, value)
    }),
    getHeaderValue: vi.fn((fieldName: string) => header.get(fieldName) ?? ''),
    replaceItems: vi.fn((nextRows: Record<string, string>[]) => {
      rows = nextRows.map((row) => ({ ...row }))
    }),
    getItemValue: vi.fn((index: number, cellName: string) => rows[index]?.[cellName] ?? ''),
    setItemValue: vi.fn((index: number, cellName: string, value: string) => {
      if (options.requireUnitPriceTransaction && cellName === 'unitPrice' && transactionDepth === 0) {
        throw new Error('unitPrice write must be transactional')
      }
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

function renderTwoCoeditConsumers() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/sales/estimates/consumer-a/edit']}>
        <Routes>
          <Route path="/sales/estimates/:id/edit" element={<EstimateFormPage />} />
        </Routes>
      </MemoryRouter>
      <MemoryRouter initialEntries={['/sales/estimates/consumer-b/edit']}>
        <Routes>
          <Route path="/sales/estimates/:id/edit" element={<EstimateFormPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function estimateUnitPrice(index = 0): HTMLInputElement {
  return screen.getByTestId(`estimate-coedit-items-${index}-unitPrice`) as HTMLInputElement
}

function estimateQuantity(index = 0): HTMLInputElement {
  return screen.getByTestId(`estimate-coedit-items-${index}-quantity`) as HTMLInputElement
}

function estimateModel(index = 0): HTMLInputElement {
  return screen.getByTestId(`estimate-coedit-items-${index}-modelName`) as HTMLInputElement
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  window.sessionStorage.clear()
})

beforeEach(() => {
  mocks.selectPartnerOnMount = false
  mocks.lookupProductByModelName.mockReset()
  mocks.searchProducts.mockReset()
  mocks.getPriceMemory.mockResolvedValue(null)
  mocks.getPriceMemories.mockResolvedValue({ hits: [], failedProductIds: [] })
  mocks.lookupProducts.mockResolvedValue([])
  mocks.searchProducts.mockResolvedValue([])
  mocks.createEstimate.mockResolvedValue({ id: 'estimate-created' })
  mocks.updateEstimate.mockResolvedValue({ id: 'estimate-1' })
})

describe('EstimateFormPage 견적 편집 full-form coedit 배선', () => {
  it('S7 RED-B: coedit 중 기존 행 품목은 열고 trailing 빈행 품목 선택은 잠근다', async () => {
    const provider = makeProvider()
    mocks.getEstimate.mockResolvedValue(makeEstimate())
    mocks.createDocCoeditProvider.mockResolvedValue(provider)
    mocks.searchProducts.mockResolvedValue([
      { id: 'product-a', modelName: 'AJ052RXH5BC1', productName: 'AJ 제품', sellingPrice: 22000 },
      { id: 'product-b', modelName: 'AJ060RXH5BC1', productName: 'AJ 제품 2', sellingPrice: 33000 },
    ])

    renderPage()

    await waitFor(() => expect(provider.subscribeDoc).toHaveBeenCalledTimes(1))
    const existingLineModel = await screen.findByLabelText('라인 1 모델명')
    const trailingLineModel = await screen.findByLabelText('라인 2 모델명')

    expect(existingLineModel.disabled).toBe(false)
    expect(trailingLineModel.disabled).toBe(true)
  })

  it('RED-A: 공용 ProductOption 확정은 id·모델명·품목명·규격·단가를 저장 라인에 보존한다', async () => {
    const catalogSpecification = '가'.repeat(50)
    const created = makeEstimate({
      id: 'estimate-created',
      lines: [{
        ...makeEstimate().lines[0],
        productId: '44444444-4444-4444-4444-444444444444',
        modelName: 'AJ040RXH4BC1',
        productName: '시스템에어컨 4Way 4HP',
        specification: catalogSpecification,
        specificationSource: 'CATALOG',
        unitPrice: 1850000 as unknown as string,
      }],
    })
    mocks.getEstimate.mockResolvedValue(makeEstimate({ lines: [] }))
    mocks.createDocCoeditProvider.mockRejectedValue(new Error('coedit unavailable'))
    mocks.createEstimate.mockResolvedValue(created)
    mocks.searchProducts.mockResolvedValue([{
      id: '44444444-4444-4444-4444-444444444444',
      modelName: 'AJ040RXH4BC1',
      productName: '시스템에어컨 4Way 4HP',
      specification: catalogSpecification,
      sellingPrice: 1850000,
    }])

    renderPage('/sales/estimates/new')
    const model = await screen.findByLabelText('라인 1 모델명')
    fireEvent.change(model, { target: { value: 'AJ040' } })
    fireEvent.blur(model)

    await waitFor(() => expect((screen.getByTestId('estimate-coedit-items-0-modelName') as HTMLInputElement).value).toBe('AJ040RXH4BC1'))
    expect((screen.getByTestId('estimate-coedit-items-0-productName') as HTMLInputElement).value).toBe('시스템에어컨 4Way 4HP')
    expect((screen.getByTestId('estimate-coedit-items-0-specification') as HTMLInputElement).value).toBe(catalogSpecification)
    expect((screen.getByTestId('estimate-coedit-items-0-unitPrice') as HTMLInputElement).value).toBe('1850000')
    fireEvent.click(screen.getByTestId('estimate-select-partner-a'))
    const saveButton = screen.getByTestId('estimate-form-save-button') as HTMLButtonElement
    await waitFor(() => expect(saveButton.disabled).toBe(false))
    fireEvent.click(saveButton)

    await waitFor(() => expect(mocks.createEstimate).toHaveBeenCalledWith(expect.objectContaining({
      lines: [expect.objectContaining({
        productId: '44444444-4444-4444-4444-444444444444',
        modelName: 'AJ040RXH4BC1',
        specification: catalogSpecification,
        specificationSource: 'CATALOG',
        unitPrice: '1850000',
      })],
    })))
    const createdResponse = await mocks.createEstimate.mock.results[0].value
    expect(createdResponse.lines[0]).toEqual(expect.objectContaining({
      specification: catalogSpecification,
      specificationSource: 'CATALOG',
    }))

    cleanup()
    mocks.getEstimate.mockResolvedValue(createdResponse)
    mocks.createDocCoeditProvider.mockRejectedValue(new Error('coedit unavailable'))
    renderPage('/sales/estimates/estimate-created/edit')
    await waitFor(() => expect((screen.getByTestId('estimate-coedit-items-0-specification') as HTMLInputElement).value)
      .toBe(catalogSpecification))
  })

  it('S28 RED-A: 품목 확정 후 규격 없는 blur와 POST 저장·재조회도 자동 규격/source를 보존한다', async () => {
    const catalogSpecification = '9평형 / R32 / 인버터 / 윈드프리'
    const saved = makeEstimate({
      lines: [{ ...makeEstimate().lines[0], specification: catalogSpecification, specificationSource: 'CATALOG' }],
    })
    mocks.getEstimate.mockResolvedValue(makeEstimate({
      lines: [{ ...makeEstimate().lines[0], specification: catalogSpecification, specificationSource: 'CATALOG' }],
    }))
    mocks.createDocCoeditProvider.mockRejectedValue(new Error('coedit unavailable'))
    mocks.searchProducts.mockResolvedValue([])
    mocks.lookupProductByModelName.mockResolvedValue({
      productId: 'product-1',
      modelName: 'MODEL-1',
      productName: '제품 1',
      sellingPrice: '1080000',
      productType: 'SINGLE',
      specification: undefined,
    })

    renderPage()
    const model = await screen.findByLabelText('라인 1 모델명')
    expect((screen.getByTestId('estimate-coedit-items-0-specification') as HTMLInputElement).value)
      .toBe(catalogSpecification)
    fireEvent.blur(model)
    await waitFor(() => expect(mocks.lookupProductByModelName).toHaveBeenCalledWith('MODEL-1'))
    await waitFor(() => expect((screen.getByTestId('estimate-coedit-items-0-specification') as HTMLInputElement).value)
      .toBe(catalogSpecification))

    mocks.updateEstimate.mockResolvedValue(saved)
    fireEvent.click(screen.getByTestId('estimate-form-save-button'))
    await waitFor(() => expect(mocks.updateEstimate).toHaveBeenCalledTimes(1))
    const body = mocks.updateEstimate.mock.calls[0][1]
    expect(body.lines[0]).toEqual(expect.objectContaining({
      specification: catalogSpecification,
      specificationSource: 'CATALOG',
    }))
    expect(saved.lines[0]).toEqual(expect.objectContaining({
      specification: catalogSpecification,
      specificationSource: 'CATALOG',
    }))

    cleanup()
    mocks.getEstimate.mockResolvedValue(saved)
    mocks.createDocCoeditProvider.mockRejectedValue(new Error('coedit unavailable'))
    renderPage()
    await waitFor(() => expect((screen.getByTestId('estimate-coedit-items-0-specification') as HTMLInputElement).value)
      .toBe(catalogSpecification))
  })

  it('S14 RED-A: 자동 반영 규격은 품목 해제 시 로컬·coedit에서 함께 회수한다', async () => {
    const provider = makeProvider()
    mocks.getEstimate.mockResolvedValue(makeEstimate())
    mocks.createDocCoeditProvider.mockResolvedValue(provider)
    mocks.searchProducts.mockResolvedValue([{
      id: '44444444-4444-4444-4444-444444444444',
      modelName: 'AJ040RXH4BC1',
      productName: '시스템에어컨 4Way 4HP',
      specification: '4HP',
      sellingPrice: 1850000,
    }])
    mocks.lookupProductByModelName.mockResolvedValue({
      productId: '44444444-4444-4444-4444-444444444444',
      modelName: 'AJ040RXH4BC1',
      productName: '시스템에어컨 4Way 4HP',
      specification: '4HP',
      sellingPrice: '1850000',
      productType: 'SINGLE',
    })

    renderPage()
    await waitFor(() => expect(provider.replaceItems).toHaveBeenCalledTimes(1))
    const coeditModel = await screen.findByTestId('estimate-coedit-items-0-modelName')
    provider.setItemValue(0, 'modelName', 'AJ040RXH4BC1')
    act(() => provider.__emit())
    fireEvent.blur(coeditModel)

    await waitFor(() => expect((screen.getByTestId('estimate-coedit-items-0-specification') as HTMLInputElement).value).toBe('4HP'))
    const model = await screen.findByLabelText('라인 1 모델명')
    fireEvent.change(model, { target: { value: '' } })
    fireEvent.blur(model)

    await waitFor(() => expect((screen.getByTestId('estimate-coedit-items-0-modelName') as HTMLInputElement).value).toBe(''))
    expect((screen.getByTestId('estimate-coedit-items-0-productName') as HTMLInputElement).value).toBe('')
    expect((screen.getByTestId('estimate-coedit-items-0-specification') as HTMLInputElement).value).toBe('')
    expect((screen.getByTestId('estimate-coedit-items-0-unitPrice') as HTMLInputElement).value).toBe('11000')
    expect(provider.getItemValue(0, 'productId')).toBe('')
    expect(provider.getItemValue(0, 'specification')).toBe('')
    expect(provider.setItemValue).toHaveBeenCalledWith(0, 'specification', '')
  })

  it('S14 RED-B: 사용자 입력 규격·단가는 품목 해제만으로 지우지 않는다', async () => {
    const provider = makeProvider()
    mocks.getEstimate.mockResolvedValue(makeEstimate())
    mocks.createDocCoeditProvider.mockResolvedValue(provider)

    renderPage()
    const model = await screen.findByLabelText('라인 1 모델명')
    const specification = await screen.findByLabelText('라인 1 규격')
    const unitPrice = await screen.findByLabelText('라인 1 단가')
    fireEvent.change(specification, { target: { value: '사용자 규격' } })
    fireEvent.change(unitPrice, { target: { value: '12345' } })
    fireEvent.change(model, { target: { value: '' } })
    fireEvent.blur(model)

    await waitFor(() => expect((screen.getByTestId('estimate-coedit-items-0-modelName') as HTMLInputElement).value).toBe(''))
    expect((screen.getByTestId('estimate-coedit-items-0-specification') as HTMLInputElement).value).toBe('사용자 규격')
    expect((screen.getByTestId('estimate-coedit-items-0-unitPrice') as HTMLInputElement).value).toBe('12345')
    expect(provider.getItemValue(0, 'specification')).toBe('사용자 규격')
    expect(provider.getItemValue(0, 'unitPrice')).toBe('12345')
  })

  it('S16 RED-A: preserves user specification across save and reopen before product clear', async () => {
    const provider = makeProvider()
    const initial = makeEstimate()
    let savedBody: any
    mocks.getEstimate.mockResolvedValueOnce(initial)
    mocks.createDocCoeditProvider.mockResolvedValue(provider)
    mocks.updateEstimate.mockImplementationOnce(async (_id: string, body: any) => {
      savedBody = body
      return { id: 'estimate-1' }
    })

    renderPage()
    const specification = await screen.findByTestId('estimate-coedit-items-0-specification')
    const unitPrice = await screen.findByTestId('estimate-coedit-items-0-unitPrice')
    fireEvent.change(specification, { target: { value: 'USER-SAVED-SPEC' } })
    fireEvent.change(unitPrice, { target: { value: '12345' } })
    fireEvent.click(screen.getByTestId('estimate-form-save-button'))

    await waitFor(() => expect(mocks.updateEstimate).toHaveBeenCalledTimes(1))
    expect(savedBody.lines[0]).toEqual(expect.objectContaining({
      specification: 'USER-SAVED-SPEC',
      unitPrice: '12345',
    }))

    cleanup()
    const reopened = makeEstimate({
      lines: [{
        ...initial.lines[0],
        specification: savedBody.lines[0].specification,
        unitPrice: savedBody.lines[0].unitPrice,
        unitPriceWithVat: savedBody.lines[0].unitPrice,
      }],
    })
    mocks.getEstimate.mockResolvedValueOnce(reopened)
    const reopenedProvider = makeProvider()
    mocks.createDocCoeditProvider.mockResolvedValueOnce(reopenedProvider)
    renderPage()

    const model = (await screen.findAllByRole('textbox'))
      .find((input) => (input as HTMLInputElement).value === 'MODEL-1') as HTMLInputElement
    fireEvent.change(model, { target: { value: '' } })
    fireEvent.blur(model)

    await waitFor(() => expect(model.value).toBe(''))
    expect((screen.getByTestId('estimate-coedit-items-0-specification') as HTMLInputElement).value)
      .toBe('USER-SAVED-SPEC')
    expect((screen.getByTestId('estimate-coedit-items-0-unitPrice') as HTMLInputElement).value)
      .toBe('12345')
    expect(reopenedProvider.getItemValue(0, 'specification')).toBe('USER-SAVED-SPEC')
  })

  it('S16 RED-A: preserves a catalog-original value after the user edits it back before save', async () => {
    const provider = makeProvider()
    const initial = makeEstimate()
    const catalogOriginal = initial.lines[0].specification!
    let savedBody: any
    mocks.getEstimate.mockResolvedValueOnce(initial)
    mocks.createDocCoeditProvider.mockResolvedValue(provider)
    mocks.updateEstimate.mockImplementationOnce(async (_id: string, body: any) => {
      savedBody = body
      return { id: 'estimate-1' }
    })

    renderPage()
    const specification = await screen.findByTestId('estimate-coedit-items-0-specification')
    fireEvent.change(specification, { target: { value: `${catalogOriginal}-EDITED` } })
    fireEvent.change(specification, { target: { value: catalogOriginal } })
    fireEvent.click(screen.getByTestId('estimate-form-save-button'))
    await waitFor(() => expect(mocks.updateEstimate).toHaveBeenCalledTimes(1))
    expect(savedBody.lines[0].specification).toBe(catalogOriginal)

    cleanup()
    mocks.getEstimate.mockResolvedValueOnce(makeEstimate({
      lines: [{ ...initial.lines[0], specification: savedBody.lines[0].specification, specificationSource: 'USER' }],
    }))
    const reopenedProvider = makeProvider()
    mocks.createDocCoeditProvider.mockResolvedValueOnce(reopenedProvider)
    renderPage()
    const model = (await screen.findAllByRole('textbox'))
      .find((input) => (input as HTMLInputElement).value === 'MODEL-1') as HTMLInputElement
    fireEvent.change(model, { target: { value: '' } })
    fireEvent.blur(model)

    await waitFor(() => expect(model.value).toBe(''))
    expect((screen.getByTestId('estimate-coedit-items-0-specification') as HTMLInputElement).value)
      .toBe(catalogOriginal)
    expect(reopenedProvider.getItemValue(0, 'specification')).toBe(catalogOriginal)
  })

  it('S16 RED-B: removes a persisted catalog specification after product clear', async () => {
    const provider = makeProvider()
    const persistedCatalogSpecification = '\u2060CATALOG-SPEC'
    const initial = makeEstimate({
      lines: [{ ...makeEstimate().lines[0], specification: persistedCatalogSpecification }],
    })
    let savedBody: any
    mocks.getEstimate.mockResolvedValueOnce(initial)
    mocks.createDocCoeditProvider.mockResolvedValue(provider)
    mocks.updateEstimate.mockImplementationOnce(async (_id: string, body: any) => {
      savedBody = body
      return { id: 'estimate-1' }
    })

    renderPage()
    await screen.findByTestId('estimate-form-save-button')
    fireEvent.click(screen.getByTestId('estimate-form-save-button'))
    await waitFor(() => expect(mocks.updateEstimate).toHaveBeenCalledTimes(1))
    expect(savedBody.lines[0].specification).toBe('CATALOG-SPEC')
    expect(savedBody.lines[0].specificationSource).toBe('CATALOG')

    cleanup()
    mocks.getEstimate.mockResolvedValueOnce(makeEstimate({
      lines: [{ ...initial.lines[0], specification: savedBody.lines[0].specification, specificationSource: 'CATALOG' }],
    }))
    const reopenedProvider = makeProvider()
    mocks.createDocCoeditProvider.mockResolvedValueOnce(reopenedProvider)
    renderPage()

    const model = (await screen.findAllByRole('textbox'))
      .find((input) => (input as HTMLInputElement).value === 'MODEL-1') as HTMLInputElement
    fireEvent.change(model, { target: { value: '' } })
    fireEvent.blur(model)

    await waitFor(() => expect(model.value).toBe(''))
    expect((screen.getByTestId('estimate-coedit-items-0-specification') as HTMLInputElement).value).toBe('')
    expect(reopenedProvider.getItemValue(0, 'specification')).toBe('')
  })

  it('S31 RED: 유일한 품목을 해제한 편집 견적도 빈 lines로 PUT 저장한다', async () => {
    mocks.getEstimate.mockResolvedValue(makeEstimate())
    mocks.createDocCoeditProvider.mockRejectedValue(new Error('coedit unavailable'))
    mocks.updateEstimate.mockResolvedValue({ id: 'estimate-1' })

    renderPage()
    await waitFor(() => expect(screen.queryByTestId('estimate-form-coedit-pending')).toBeNull())
    const model = await screen.findByLabelText('라인 1 모델명')
    fireEvent.change(model, { target: { value: '' } })
    await waitFor(() => expect((model as HTMLInputElement).value).toBe(''))
    fireEvent.blur(model)

    await waitFor(() => expect(model.value).toBe(''))
    fireEvent.click(screen.getByTestId('estimate-form-save-button'))

    await waitFor(() => expect(mocks.updateEstimate).toHaveBeenCalledTimes(1))
    expect(mocks.updateEstimate).toHaveBeenCalledWith('estimate-1', expect.objectContaining({
      lines: [],
    }))
  })

  it('S32 RED-A: 여러 기존 품목을 모두 해제하면 편집 견적은 빈 lines로 PUT 저장한다', async () => {
    const firstLine = makeEstimate().lines[0]
    mocks.getEstimate.mockResolvedValue(makeEstimate({
      lines: [
        firstLine,
        { ...firstLine, id: 'line-2', productId: 'product-2', modelName: 'MODEL-2', productName: '제품 2' },
      ],
    }))
    mocks.createDocCoeditProvider.mockRejectedValue(new Error('coedit unavailable'))
    mocks.updateEstimate.mockResolvedValue({ id: 'estimate-1' })

    renderPage()
    await waitFor(() => expect(screen.queryByTestId('estimate-form-coedit-pending')).toBeNull())
    const firstModel = await screen.findByLabelText('라인 1 모델명')
    const secondModel = await screen.findByLabelText('라인 2 모델명')
    fireEvent.change(firstModel, { target: { value: '' } })
    await waitFor(() => expect((firstModel as HTMLInputElement).value).toBe(''))
    fireEvent.blur(firstModel)
    fireEvent.change(secondModel, { target: { value: '' } })
    await waitFor(() => expect((secondModel as HTMLInputElement).value).toBe(''))
    fireEvent.blur(secondModel)

    await waitFor(() => expect((firstModel as HTMLInputElement).value).toBe(''))
    await waitFor(() => expect((secondModel as HTMLInputElement).value).toBe(''))
    fireEvent.click(screen.getByTestId('estimate-form-save-button'))

    await waitFor(() => expect(mocks.updateEstimate).toHaveBeenCalledTimes(1))
    expect(mocks.updateEstimate).toHaveBeenCalledWith('estimate-1', expect.objectContaining({ lines: [] }))
  })

  it('S32 RED-A: 일부 품목만 해제하면 남은 유효 라인으로 기존 저장을 유지한다', async () => {
    const firstLine = makeEstimate().lines[0]
    mocks.getEstimate.mockResolvedValue(makeEstimate({
      lines: [
        firstLine,
        { ...firstLine, id: 'line-2', productId: 'product-2', modelName: 'MODEL-2', productName: '제품 2' },
      ],
    }))
    mocks.createDocCoeditProvider.mockRejectedValue(new Error('coedit unavailable'))
    mocks.updateEstimate.mockResolvedValue({ id: 'estimate-1' })

    renderPage()
    await waitFor(() => expect(screen.queryByTestId('estimate-form-coedit-pending')).toBeNull())
    const firstModel = await screen.findByLabelText('라인 1 모델명')
    fireEvent.change(firstModel, { target: { value: '' } })
    await waitFor(() => expect((firstModel as HTMLInputElement).value).toBe(''))
    fireEvent.blur(firstModel)

    await waitFor(() => expect((firstModel as HTMLInputElement).value).toBe(''))
    fireEvent.click(screen.getByTestId('estimate-form-save-button'))

    await waitFor(() => expect(mocks.updateEstimate).toHaveBeenCalledTimes(1))
    expect(mocks.updateEstimate.mock.calls[0][1].lines).toEqual([
      expect.objectContaining({ productId: 'product-2', modelName: 'MODEL-2' }),
    ])
  })

  it('S32 RED-B: 신규 작성의 빈 라인은 계속 저장하지 않고 실행 가능한 문구를 표시한다', async () => {
    renderPage('/sales/estimates/new')
    fireEvent.click(screen.getByTestId('estimate-select-partner-a'))
    fireEvent.click(screen.getByTestId('estimate-form-save-button'))

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(
      '신규 견적은 모델명 lookup 성공 + 수량 > 0인 품목 1개 이상을 입력하세요.',
    ))
    expect(mocks.createEstimate).not.toHaveBeenCalled()
  })

  it('S32 RED-B: 원래 0라인인 편집 견적은 명시적 전체 삭제 근거가 없어 저장하지 않는다', async () => {
    mocks.getEstimate.mockResolvedValue(makeEstimate({ lines: [] }))
    mocks.createDocCoeditProvider.mockRejectedValue(new Error('coedit unavailable'))

    renderPage()
    fireEvent.click(await screen.findByTestId('estimate-form-save-button'))

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(
      '유효한 라인이 없습니다. 품목을 입력하거나, 전체 삭제하려면 기존 품목을 모두 해제한 뒤 저장하세요.',
    ))
    expect(mocks.updateEstimate).not.toHaveBeenCalled()
  })

  it('S32 RED-B: 수량만 0으로 만들어진 편집 견적은 품목 전체 삭제로 간주하지 않는다', async () => {
    mocks.getEstimate.mockResolvedValue(makeEstimate())
    mocks.createDocCoeditProvider.mockRejectedValue(new Error('coedit unavailable'))

    renderPage()
    await waitFor(() => expect(screen.queryByTestId('estimate-form-coedit-pending')).toBeNull())
    const quantity = await screen.findByLabelText('라인 1 수량')
    fireEvent.change(quantity, { target: { value: '0' } })
    fireEvent.click(screen.getByTestId('estimate-form-save-button'))

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(
      '유효한 라인이 없습니다. 품목을 입력하거나, 전체 삭제하려면 기존 품목을 모두 해제한 뒤 저장하세요.',
    ))
    expect(mocks.updateEstimate).not.toHaveBeenCalled()
  })

  it('S32 RED-B: 협업 상대가 원격으로 품목을 비운 상태는 로컬 명시적 삭제 없이 저장하지 않는다', async () => {
    const provider = makeProvider()
    mocks.getEstimate.mockResolvedValue(makeEstimate())
    mocks.createDocCoeditProvider.mockResolvedValue(provider)

    renderPage()
    await waitFor(() => expect(provider.subscribeDoc).toHaveBeenCalledTimes(1))
    provider.__setRows([{
      modelName: '',
      productName: '',
      specification: '',
      quantity: '2',
      unitPrice: '10000',
      productId: '',
    }])
    act(() => provider.__emit())
    await waitFor(() => expect(estimateModel().value).toBe(''))

    fireEvent.click(screen.getByTestId('estimate-form-save-button'))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(
      '유효한 라인이 없습니다. 품목을 입력하거나, 전체 삭제하려면 기존 품목을 모두 해제한 뒤 저장하세요.',
    ))
    expect(mocks.updateEstimate).not.toHaveBeenCalled()
  })

  it('S32 RED-A: 협업 편집 중 현재 사용자가 기존 품목을 모두 해제하면 빈 lines 저장을 허용한다', async () => {
    const provider = makeProvider()
    mocks.getEstimate.mockResolvedValue(makeEstimate())
    mocks.createDocCoeditProvider.mockResolvedValue(provider)
    mocks.updateEstimate.mockResolvedValue({ id: 'estimate-1' })

    renderPage()
    await waitFor(() => expect(provider.subscribeDoc).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByTestId('estimate-form-coedit-pending')).toBeNull())
    const model = await screen.findByLabelText('라인 1 모델명')
    fireEvent.change(model, { target: { value: '' } })
    await waitFor(() => expect((model as HTMLInputElement).value).toBe(''))
    fireEvent.blur(model)

    await waitFor(() => expect((model as HTMLInputElement).value).toBe(''))
    fireEvent.click(screen.getByTestId('estimate-form-save-button'))

    await waitFor(() => expect(mocks.updateEstimate).toHaveBeenCalledTimes(1))
    expect(mocks.updateEstimate).toHaveBeenCalledWith('estimate-1', expect.objectContaining({ lines: [] }))
  })

  it('S32 RED-A: 협업 편집 중 여러 기존 품목을 모두 해제하면 빈 lines 저장을 허용한다', async () => {
    const firstLine = makeEstimate().lines[0]
    const provider = makeProvider()
    mocks.getEstimate.mockResolvedValue(makeEstimate({
      lines: [
        firstLine,
        { ...firstLine, id: 'line-2', productId: 'product-2', modelName: 'MODEL-2', productName: '제품 2' },
      ],
    }))
    mocks.createDocCoeditProvider.mockResolvedValue(provider)
    mocks.updateEstimate.mockResolvedValue({ id: 'estimate-1' })

    renderPage()
    await waitFor(() => expect(provider.subscribeDoc).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByTestId('estimate-form-coedit-pending')).toBeNull())
    const firstModel = await screen.findByLabelText('라인 1 모델명')
    const secondModel = await screen.findByLabelText('라인 2 모델명')
    fireEvent.change(firstModel, { target: { value: '' } })
    await waitFor(() => expect((firstModel as HTMLInputElement).value).toBe(''))
    fireEvent.blur(firstModel)
    fireEvent.change(secondModel, { target: { value: '' } })
    await waitFor(() => expect((secondModel as HTMLInputElement).value).toBe(''))
    fireEvent.blur(secondModel)

    await waitFor(() => expect((firstModel as HTMLInputElement).value).toBe(''))
    await waitFor(() => expect((secondModel as HTMLInputElement).value).toBe(''))
    fireEvent.click(screen.getByTestId('estimate-form-save-button'))

    await waitFor(() => expect(mocks.updateEstimate).toHaveBeenCalledTimes(1))
    expect(mocks.updateEstimate).toHaveBeenCalledWith('estimate-1', expect.objectContaining({ lines: [] }))
  })

  it('원격 CATALOG 규격은 값이 바뀌어도 USER로 강등하지 않고 품목 해제 시 회수한다', async () => {
    const provider = makeProvider()
    mocks.getEstimate.mockResolvedValue(makeEstimate())
    mocks.createDocCoeditProvider.mockResolvedValue(provider)

    renderPage()
    await waitFor(() => expect(provider.subscribeDoc).toHaveBeenCalledTimes(1))
    provider.__setRows([{
      modelName: 'REMOTE-MODEL',
      productName: '원격 품목',
      specification: 'REMOTE-CATALOG-SPEC',
      specificationSource: 'CATALOG',
      quantity: '2',
      unitPrice: '10000',
      productId: 'product-remote',
    }])
    act(() => provider.__emit())

    await waitFor(() => expect((screen.getByTestId('estimate-coedit-items-0-specification') as HTMLInputElement).value)
      .toBe('REMOTE-CATALOG-SPEC'))
    const model = await screen.findByLabelText('라인 1 모델명')
    fireEvent.change(model, { target: { value: '' } })
    fireEvent.blur(model)

    await waitFor(() => expect((screen.getByTestId('estimate-coedit-items-0-specification') as HTMLInputElement).value).toBe(''))
    expect(provider.getItemValue(0, 'specification')).toBe('')
    expect(provider.getItemValue(0, 'specificationSource')).toBe('')
  })

  it('두 실제 EstimateFormPage 소비자가 원격 CATALOG 수신·해제를 함께 수렴한다', async () => {
    const provider = makeProvider()
    mocks.getEstimate.mockResolvedValue(makeEstimate())
    mocks.createDocCoeditProvider.mockResolvedValue(provider)

    renderTwoCoeditConsumers()
    await waitFor(() => expect(provider.subscribeDoc).toHaveBeenCalledTimes(2))
    provider.__setRows([{
      modelName: 'REMOTE-TWO-CONSUMERS',
      productName: '원격 품목',
      specification: 'REMOTE-CATALOG-SPEC',
      specificationSource: 'CATALOG',
      quantity: '2',
      unitPrice: '10000',
      productId: 'product-remote',
    }])
    act(() => provider.__emit())

    await waitFor(() => expect(screen.getAllByTestId('estimate-coedit-items-0-specification'))
      .toHaveLength(2))
    expect(screen.getAllByTestId('estimate-coedit-items-0-specification')
      .every((input) => (input as HTMLInputElement).value === 'REMOTE-CATALOG-SPEC')).toBe(true)

    const models = screen.getAllByLabelText('라인 1 모델명')
    fireEvent.change(models[1], { target: { value: '' } })
    fireEvent.blur(models[1])
    act(() => provider.__emit())

    await waitFor(() => expect(screen.getAllByTestId('estimate-coedit-items-0-specification')
      .every((input) => (input as HTMLInputElement).value === '')).toBe(true))
    expect(provider.getItemValue(0, 'specification')).toBe('')
    expect(provider.getItemValue(0, 'specificationSource')).toBe('')
  })

  it('RED-B: 부분 모델 검색은 공용 품목 결과 모달의 규격·단가 후보를 사용한다', async () => {
    mocks.getEstimate.mockResolvedValue(makeEstimate({ lines: [] }))
    mocks.createDocCoeditProvider.mockRejectedValue(new Error('coedit unavailable'))
    mocks.searchProducts.mockResolvedValue([
      {
        id: '11111111-1111-1111-1111-111111111111',
        modelName: 'AJ-ONE',
        productName: '제품 하나',
        specification: '220V',
        sellingPrice: 11000,
      },
      {
        id: '22222222-2222-2222-2222-222222222222',
        modelName: 'AJ-TWO',
        productName: '제품 둘',
        specification: '380V',
        sellingPrice: 22000,
      },
    ])

    renderPage()
    const model = await screen.findByLabelText('라인 1 모델명')
    fireEvent.change(model, { target: { value: 'AJ' } })
    fireEvent.blur(model)

    const dialog = await screen.findByRole('dialog', { name: '품목 검색 결과' })
    expect(mocks.searchProducts).toHaveBeenCalledWith('AJ')
    expect(dialog.textContent).toContain('220V')
    expect(dialog.textContent).toContain('22,000원')
    expect(dialog.textContent).not.toContain('11111111-1111-1111-1111-111111111111')
  })

  it('RED-B: 공용 품목 검색의 단일 후보는 모달 없이 자동 확정한다', async () => {
    mocks.getEstimate.mockResolvedValue(makeEstimate({ lines: [] }))
    mocks.createDocCoeditProvider.mockRejectedValue(new Error('coedit unavailable'))
    mocks.searchProducts.mockResolvedValue([{
      id: '33333333-3333-3333-3333-333333333333',
      modelName: 'AJ-ONE',
      productName: '제품 하나',
      specification: '220V',
      sellingPrice: 11000,
    }])

    renderPage()
    const model = await screen.findByLabelText('라인 1 모델명')
    fireEvent.change(model, { target: { value: 'AJ' } })
    fireEvent.blur(model)

    await waitFor(() => expect(screen.queryByRole('dialog', { name: '품목 검색 결과' })).toBeNull())
  })

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
    // D-R8-7: partnerId 도 CRDT 헤더에 실어야 상대 피어가 구 partnerId 로 저장하지 않는다.
    expect(provider.setHeaderValue).toHaveBeenCalledWith('partnerId', '11111111-1111-1111-1111-111111111111')
    expect(provider.replaceItems).toHaveBeenCalledWith([
      expect.objectContaining({
        // R8-FE-9: seed 가 lineId 를 실지 않으면 replaceItems 가 클라 랜덤 UUID 를 채워
        // Y.Doc 직독값이 서버 소유검증에서 전 라인 400 이 된다.
        lineId: 'line-1',
        modelName: 'MODEL-1',
        productName: '제품 1',
        specification: '스펙 1',
        quantity: '2',
        unitPrice: '11000',
        productId: 'product-1',
      }),
      expect.objectContaining({
        modelName: '',
        productName: '',
        quantity: '1',
        productId: '',
      }),
    ])

    for (const fieldPath of [
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
    // R8-DESIGN-1: '거래처명'·'사업자번호' 는 자유입력 coedit 필드에서 제외됐다 —
    // 거래처 입력 경로가 2개면 권위 없는 쪽으로 partnerIdSnapshot 과 괴리가 생겨 마커가 거짓말한다.
    // 이 단언은 자유입력이 되살아나면 즉시 RED 로 잡는다.
    expect(screen.queryByTestId('estimate-coedit-header-partnerName')).toBeNull()
    expect(screen.queryByTestId('estimate-coedit-header-partnerBusinessNo')).toBeNull()
    expect((screen.getByTestId('estimate-form-partner-name') as HTMLInputElement).readOnly).toBe(true)
    expect((screen.getByTestId('estimate-form-partner-business-no') as HTMLInputElement).readOnly).toBe(true)
    // D-R8-1: coedit 중에도 거래처 재선택이 가능해야 한다 — 종전 disabled 는 "거래처를 다시
    // 선택해 주세요" 안내와 결합해 저장 데드락을 만들었다.
    expect((screen.getByTestId('estimate-partner-autocomplete') as HTMLInputElement).disabled).toBe(false)
    // R4-F6: 단가 필드만 doc-sync 전용 콜백 배선 — 자동채움 provider write 의 doc-sync 가
    // pending REMEMBERED/CATALOG 분류를 USER 로 재분류하지 않게 분리한다(타 필드는 기존 경로).
    expect(screen.getByTestId('estimate-coedit-items-0-unitPrice').getAttribute('data-doc-sync')).toBe('true')
    expect(screen.getByTestId('estimate-coedit-items-0-modelName').getAttribute('data-doc-sync')).toBe('true')
  })

  it('coedit 연결 후 모델명은 활성이고 라인 구조 삭제는 잠근다', async () => {
    const provider = makeProvider()
    mocks.getEstimate.mockResolvedValue(makeEstimate())
    mocks.createDocCoeditProvider.mockResolvedValue(provider)

    renderPage()

    await waitFor(() => expect(provider.subscribeDoc).toHaveBeenCalledTimes(1))
    expect((screen.getByLabelText('라인 1 모델명') as HTMLInputElement).disabled).toBe(false)
    expect((screen.getByRole('button', { name: '라인 1 삭제' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('subscribeDoc 원격 업데이트를 React form state 에 반영한다', async () => {
    const provider = makeProvider()
    mocks.getEstimate.mockResolvedValue(makeEstimate())
    mocks.createDocCoeditProvider.mockResolvedValue(provider)

    renderPage()
    await waitFor(() => expect(provider.subscribeDoc).toHaveBeenCalledTimes(1))

    provider.setHeaderValue('partnerId', '22222222-2222-2222-2222-222222222222')
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
    // R8-DESIGN-1: 거래처명은 read-only 로 강등됐으나 원격 수신 자체는 그대로 성립해야 한다
    // (자유입력만 봉쇄한 것이지 CRDT 전파를 끊은 게 아니다).
    expect((screen.getByTestId('estimate-form-partner-name') as HTMLInputElement).value).toBe('원격 거래처')
    expect((screen.getByTestId('estimate-form-partner-business-no') as HTMLInputElement).value).toBe('999-88-77777')
    // 🔴 자동완성(controlled value)도 같은 거래처를 가리켜야 한다 — 여기가 어긋나면 한 화면이
    // 두 거래처를 동시에 주장한다(자동완성=구 거래처 / read-only 거래처명=새 거래처).
    expect((screen.getByTestId('estimate-partner-autocomplete') as HTMLInputElement).value).toBe('원격 거래처')
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

  it('R28 읽기 전용 견적은 서버 확정행만 hydrate하고 trailing 빈행을 만들지 않는다', async () => {
    const base = makeEstimate().lines[0]
    mocks.getEstimate.mockResolvedValue(makeEstimate({
      status: 'QUOTE_CONVERTED',
      lines: [
        base,
        { ...base, id: 'line-2', productId: 'product-2', modelName: 'MODEL-2', productName: '제품 2' },
      ],
    }))

    renderPage()

    await screen.findByText('이 견적서는 수락/거절/변환되어 더 이상 수정할 수 없습니다.')
    expect(screen.getByTestId('estimate-form-line-0')).not.toBeNull()
    expect(screen.getByTestId('estimate-form-line-1')).not.toBeNull()
    expect(screen.queryByTestId('estimate-form-line-2')).toBeNull()
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
    // 이미 입력된 단가는 사용자 override 로 보고 provider 에 재전송하지 않는다.
    expect(provider.setItemValue).not.toHaveBeenCalledWith(0, 'unitPrice', '11000')
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
      expect.objectContaining({ modelName: '', productName: '', productId: '' }),
    ])
  })

  it('R26 버전 복원으로 서버 version이 바뀌면 선행 stale Y.Doc을 재시드한다', async () => {
    const provider = makeProvider()
    provider.isEmpty.mockReturnValue(false)
    provider.setHeaderValue('estimateServerVersion', '1')
    provider.__setRows([
      { lineId: 'line-1', modelName: 'MODEL-1', productName: '제품 1', productId: 'product-1' },
      { lineId: 'line-old', modelName: 'MODEL-OLD', productName: '복원 전 제품', productId: 'old-product' },
      { lineId: 'draft-line', modelName: '', productName: '', productId: '' },
    ])
    provider.setHeaderValue.mockClear()
    mocks.getEstimate.mockResolvedValue(makeEstimate({ version: 2 }))
    mocks.createDocCoeditProvider.mockResolvedValue(provider)

    renderPage()

    await waitFor(() => expect(provider.replaceItems).toHaveBeenCalledTimes(1))
    expect(provider.replaceItems).toHaveBeenCalledWith([
      expect.objectContaining({ modelName: 'MODEL-1', productName: '제품 1' }),
      expect.objectContaining({ modelName: '', productName: '', productId: '' }),
    ])
    expect(provider.setHeaderValue).toHaveBeenCalledWith('estimateServerVersion', '2')
  })

  it('R23 RED-B4 다른 참가자 진입 시 Y.Doc의 미저장 입력 행을 보존한다', async () => {
    const provider = makeProvider()
    provider.isEmpty.mockReturnValue(false)
    provider.__setRows([
      {
        modelName: 'MODEL-1',
        productName: '제품 1',
        specification: '스펙 1',
        quantity: '2',
        unitPrice: '11000',
        productId: 'product-1',
      },
      {
        modelName: 'DRAFT-1',
        productName: '미저장 제품 1',
        specification: '미저장 스펙 1',
        quantity: '1',
        unitPrice: '100',
        productId: 'draft-product-1',
      },
      {
        modelName: 'DRAFT-2',
        productName: '미저장 제품 2',
        specification: '미저장 스펙 2',
        quantity: '1',
        unitPrice: '200',
        productId: 'draft-product-2',
      },
    ])
    mocks.getEstimate.mockResolvedValue(makeEstimate())
    mocks.createDocCoeditProvider.mockResolvedValue(provider)

    renderPage()

    await waitFor(() => expect(provider.subscribeDoc).toHaveBeenCalledTimes(1))
    expect(provider.replaceItems).not.toHaveBeenCalled()
    expect((screen.getByTestId('estimate-coedit-items-1-modelName') as HTMLInputElement).value).toBe('DRAFT-1')
    expect((screen.getByTestId('estimate-coedit-items-2-modelName') as HTMLInputElement).value).toBe('DRAFT-2')
  })

  it('R26 같은 서버 version 세대의 선행 Y.Doc 미저장 행을 보존한다', async () => {
    const provider = makeProvider()
    provider.isEmpty.mockReturnValue(false)
    provider.setHeaderValue('estimateServerVersion', '1')
    provider.setHeaderValue.mockClear()
    provider.__setRows([
      { modelName: 'MODEL-1', productName: '제품 1', productId: 'product-1' },
      { modelName: 'DRAFT-1', productName: '미저장 제품 1', productId: 'draft-product-1' },
      { modelName: 'DRAFT-2', productName: '미저장 제품 2', productId: 'draft-product-2' },
    ])
    mocks.getEstimate.mockResolvedValue(makeEstimate({ version: 1 }))
    mocks.createDocCoeditProvider.mockResolvedValue(provider)

    renderPage()

    await waitFor(() => expect(provider.subscribeDoc).toHaveBeenCalledTimes(1))
    expect(provider.replaceItems).not.toHaveBeenCalled()
    expect((screen.getByTestId('estimate-coedit-items-1-modelName') as HTMLInputElement).value).toBe('DRAFT-1')
    expect((screen.getByTestId('estimate-coedit-items-2-modelName') as HTMLInputElement).value).toBe('DRAFT-2')
  })

  it('R28 복원 fence가 있으면 marker 없는 stale Y.Doc도 서버 복원 결과로 재시드한다', async () => {
    const provider = makeProvider()
    provider.isEmpty.mockReturnValue(false)
    provider.__setRows([
      { lineId: 'line-1', modelName: 'MODEL-STALE', productName: '복원 전 제품', productId: 'stale-product' },
      { lineId: 'line-old', modelName: 'MODEL-OLD', productName: '삭제된 제품', productId: 'old-product' },
    ])
    markEstimateRestoreFence('estimate-1', 2)
    mocks.getEstimate.mockResolvedValue(makeEstimate({ version: 2 }))
    mocks.createDocCoeditProvider.mockResolvedValue(provider)

    renderPage()

    await waitFor(() => expect(provider.replaceItems).toHaveBeenCalledTimes(1))
    expect(provider.replaceItems).toHaveBeenCalledWith([
      expect.objectContaining({ modelName: 'MODEL-1', productName: '제품 1' }),
      expect.objectContaining({ modelName: '', productName: '', productId: '' }),
    ])
    expect(window.sessionStorage.getItem('samhan:estimate-restore-version:estimate-1')).toBeNull()
  })

  it('newEstimate_autofillsRememberedPrice', async () => {
    mocks.lookupProductByModelName.mockResolvedValue({
      productId: 'product-new',
      productName: '신규 제품',
      productType: 'SINGLE',
      sellingPrice: '33000',
    })
    mocks.getPriceMemory.mockResolvedValue({
      unitPrice: 88000,
      source: 'LINE_SAVE',
      updatedAt: '2026-07-10T09:00:00',
    })
    renderPage('/sales/estimates/new')
    const status = screen.getByTestId('estimate-price-refresh-banner')
    expect(status.textContent).toBe('')

    fireEvent.click(screen.getByTestId('estimate-select-partner-a'))
    fireEvent.change(estimateModel(), { target: { value: 'MODEL-NEW' } })
    fireEvent.blur(estimateModel())

    await waitFor(() => expect(mocks.getPriceMemory).toHaveBeenCalledWith(mocks.partnerA.id, 'product-new'))
    await waitFor(() => expect(estimateUnitPrice().value).toBe('88000'))
    expect(screen.getByTestId('estimate-form-line-0').getAttribute('data-price-source')).toBe('REMEMBERED')
    const note = screen.getByRole('note', { name: /이 거래처에 마지막으로 저장된 단가/ })
    expect(note.textContent).toBe('거래처 최근단가')
    expect(estimateUnitPrice().getAttribute('aria-describedby')).toBe(note.id)
    // R4-D2: 라인 칩에 aria-live 금지 — 라인 N개 flip 시 N회 낭독 폭주(전역 고지는 배너 1곳).
    expect(note.hasAttribute('aria-live')).toBe(false)
    // R5-M4: 최초 lookup 결과도 기존 페이지 status 한 곳에서 1회 묶어 고지한다.
    expect(status.textContent).toBe('라인 1 거래처 최근단가 적용')
  })

  it('edit hydrate 일반 라인은 거래처 변경 시 공용 bulk 재조회로 새 거래처 최근단가를 적용한다', async () => {
    mocks.getEstimate.mockResolvedValue(makeEstimate())
    mocks.createDocCoeditProvider.mockRejectedValue(new Error('coedit unavailable'))
    mocks.lookupProducts.mockResolvedValue([{ id: 'product-1', sellingPrice: 33000 }])
    mocks.getPriceMemories.mockResolvedValue({
      hits: [{
        productId: 'product-1',
        unitPrice: 99000,
        source: 'LINE_SAVE',
        updatedAt: '2026-07-16T10:00:00',
      }],
      failedProductIds: [],
    })
    renderPage()

    await waitFor(() => expect((screen.getByTestId('estimate-select-partner-b') as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByTestId('estimate-select-partner-b'))

    await waitFor(() => expect(mocks.lookupProducts).toHaveBeenCalledWith(['product-1']))
    await waitFor(() => expect(mocks.getPriceMemories).toHaveBeenCalledWith(mocks.partnerB.id, ['product-1']))
    await waitFor(() => expect(estimateUnitPrice().value).toBe('99000'))
    expect(screen.getByTestId('estimate-form-line-0').getAttribute('data-price-source')).toBe('REMEMBERED')
    expect(screen.getByRole('note', { name: /마지막으로 저장된 단가/ }).textContent).toBe('거래처 최근단가')
    expect(screen.getByText('단가 변경')).not.toBeNull()
  })

  it('상세 hydrate 전 거래처 선택이 들어와도 최신 거래처 기준 재조회를 유실하지 않는다', async () => {
    mocks.selectPartnerOnMount = true
    mocks.getEstimate.mockResolvedValue(makeEstimate())
    mocks.createDocCoeditProvider.mockRejectedValue(new Error('coedit unavailable'))
    mocks.lookupProducts.mockResolvedValue([{ id: 'product-1', sellingPrice: 11000 }])
    mocks.getPriceMemories.mockResolvedValue({
      hits: [{
        productId: 'product-1',
        unitPrice: 99000,
        source: 'LINE_SAVE',
        updatedAt: '2026-07-16T10:00:00',
      }],
      failedProductIds: [],
    })

    renderPage()

    await waitFor(() => expect(mocks.getPriceMemories).toHaveBeenCalledWith(
      mocks.partnerB.id,
      ['product-1'],
    ))
    await waitFor(() => expect(estimateUnitPrice().value).toBe('99000'))
    expect(screen.getByTestId('estimate-form-line-0').getAttribute('data-price-source')).toBe('REMEMBERED')
  })

  it('거래처 재조회 provider write를 한 CRDT transaction으로 적용한다', async () => {
    const provider = makeProvider({ requireUnitPriceTransaction: true })
    mocks.getEstimate.mockResolvedValue(makeEstimate())
    mocks.createDocCoeditProvider.mockResolvedValue(provider)
    mocks.lookupProducts.mockResolvedValue([{ id: 'product-1', sellingPrice: 11000 }])
    mocks.getPriceMemories.mockResolvedValue({
      hits: [{
        productId: 'product-1',
        unitPrice: 99000,
        source: 'LINE_SAVE',
        updatedAt: '2026-07-16T10:00:00',
      }],
      failedProductIds: [],
    })
    renderPage()

    await waitFor(() => expect(screen.getByTestId('estimate-coedit-items-0-unitPrice').getAttribute('data-provider-present')).toBe('true'))
    fireEvent.click(screen.getByTestId('estimate-select-partner-b'))

    await waitFor(() => expect(estimateUnitPrice().value).toBe('99000'))
    expect(provider.getItemValue(0, 'unitPrice')).toBe('99000')
  })

  it('edit hydrate 세트 구성품은 거래처 변경 재조회 후보에서 제외한다', async () => {
    mocks.getEstimate.mockResolvedValue(makeEstimate({
      lines: [{
        ...makeEstimate().lines[0],
        setHead: true,
        parentSetModel: 'SET-01',
      }],
    }))
    mocks.createDocCoeditProvider.mockRejectedValue(new Error('coedit unavailable'))
    renderPage()

    await waitFor(() => expect((screen.getByTestId('estimate-select-partner-b') as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByTestId('estimate-select-partner-b'))

    expect(estimateUnitPrice().value).toBe('11000')
    expect(mocks.lookupProducts).not.toHaveBeenCalled()
    expect(mocks.getPriceMemories).not.toHaveBeenCalled()
  })

  it('edit hydrate 카탈로그 미확보 miss는 옛 거래처 단가를 비우고 저장을 막는다', async () => {
    mocks.getEstimate.mockResolvedValue(makeEstimate())
    mocks.createDocCoeditProvider.mockRejectedValue(new Error('coedit unavailable'))
    mocks.lookupProducts.mockResolvedValue([])
    mocks.getPriceMemories.mockResolvedValue({ hits: [], failedProductIds: [] })
    renderPage()

    await waitFor(() => expect((screen.getByTestId('estimate-select-partner-b') as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByTestId('estimate-select-partner-b'))

    await waitFor(() => expect(estimateUnitPrice().value).toBe(''))
    expect(screen.getByTestId('estimate-form-line-0').getAttribute('data-price-source')).toBe('')
    expect((screen.getByTestId('estimate-form-save-button') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByTestId('estimate-price-refresh-banner').textContent).toContain('단가 확인 필요 1건')
  })

  it('editEstimate_refreshesRememberedPriceForSelectedPartner_forHydratedAndSessionAutoLines', async () => {
    mocks.getEstimate.mockResolvedValue(makeEstimate())
    mocks.createDocCoeditProvider.mockRejectedValue(new Error('coedit unavailable'))
    mocks.lookupProductByModelName.mockResolvedValue({
      productId: 'product-session',
      productName: '세션 제품',
      productType: 'SINGLE',
      sellingPrice: '33000',
    })
    mocks.getPriceMemory.mockResolvedValue({
      unitPrice: 44000,
      source: 'LINE_SAVE',
      updatedAt: '2026-07-10T09:00:00',
    })
    mocks.lookupProducts.mockResolvedValue([{ id: 'product-1', sellingPrice: 11000 }])
    mocks.getPriceMemories.mockResolvedValue({ hits: [{
      productId: 'product-session',
      unitPrice: 99000,
      source: 'LINE_SAVE',
      updatedAt: '2026-07-11T09:00:00',
    }], failedProductIds: [] })
    renderPage()

    await waitFor(() => expect(estimateQuantity()).toBeTruthy())
    fireEvent.change(estimateQuantity(), { target: { value: '3' } })
    await waitFor(() => expect(estimateModel(1)).toBeTruthy())
    fireEvent.change(estimateModel(1), { target: { value: 'MODEL-SESSION' } })
    fireEvent.blur(estimateModel(1))
    await waitFor(() => expect(estimateUnitPrice(1).value).toBe('44000'))

    // R4-D9: 배너 live region 은 활성 전에도 빈 컨테이너로 선존재해야 SR 낭독이 신뢰된다.
    const banner = screen.getByTestId('estimate-price-refresh-banner')
    expect(banner.getAttribute('role')).toBe('status')
    expect(banner.textContent).toBe('라인 2 거래처 최근단가 적용')

    fireEvent.click(screen.getByTestId('estimate-select-partner-b'))

    await waitFor(() => expect(mocks.getPriceMemories).toHaveBeenCalledWith(
      mocks.partnerB.id,
      ['product-1', 'product-session'],
    ))
    await waitFor(() => expect(estimateUnitPrice(1).value).toBe('99000'))
    expect(estimateUnitPrice(0).value).toBe('11000')
    expect(screen.getByTestId('estimate-form-line-0').getAttribute('data-price-source')).toBe('CATALOG')
    expect(screen.getByText(/거래처 변경 단가 확인 완료/)).not.toBeNull()
    // R4-D9: 동일 DOM 노드 유지(재마운트 아님) + 텍스트만 토글.
    expect(screen.getByTestId('estimate-price-refresh-banner')).toBe(banner)
    expect(banner.textContent).toBe('거래처 변경 단가 확인 완료 · 최근단가 1건 · 판매가 1건 · 변경 1행')
    const changedRow = screen.getByTestId('estimate-form-line-1')
    const changedStatus = screen.getByText('단가 변경')
    expect(changedStatus.querySelector('svg')).not.toBeNull()
    expect(changedStatus.hasAttribute('aria-live')).toBe(false)
    expect(changedRow.getAttribute('aria-describedby')).toBe(changedStatus.id)
  })

  it('사용자가 재조회 단가를 직접 확정하면 해당 행만 배너 집계에서 제거한다', async () => {
    const baseEstimate = makeEstimate()
    mocks.getEstimate.mockResolvedValue(makeEstimate({
      lines: [
        baseEstimate.lines[0],
        {
          ...baseEstimate.lines[0],
          id: 'line-2',
          lineNo: 1,
          productId: 'product-2',
          productName: '제품 2',
          modelName: 'MODEL-2',
          unitPrice: 20000 as unknown as string,
          unitPriceWithVat: '22000',
        },
      ],
    }))
    mocks.createDocCoeditProvider.mockRejectedValue(new Error('coedit unavailable'))
    mocks.lookupProducts.mockResolvedValue([
      { id: 'product-1', sellingPrice: 11000 },
      { id: 'product-2', sellingPrice: 22000 },
    ])
    mocks.getPriceMemories.mockResolvedValue({
      hits: [
        {
          productId: 'product-1',
          unitPrice: 99000,
          source: 'LINE_SAVE',
          updatedAt: '2026-07-11T09:00:00',
        },
        {
          productId: 'product-2',
          unitPrice: 88000,
          source: 'LINE_SAVE',
          updatedAt: '2026-07-11T09:00:00',
        },
      ],
      failedProductIds: [],
    })
    renderPage()

    await waitFor(() => expect((screen.getByTestId('estimate-select-partner-b') as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByTestId('estimate-select-partner-b'))

    await waitFor(() => expect(estimateUnitPrice(0).value).toBe('99000'))
    await waitFor(() => expect(estimateUnitPrice(1).value).toBe('88000'))
    const banner = screen.getByTestId('estimate-price-refresh-banner')
    expect(banner.textContent).toBe('거래처 변경 단가 확인 완료 · 최근단가 2건 · 변경 2행')

    fireEvent.change(estimateUnitPrice(0), { target: { value: '77777' } })

    const firstRow = screen.getByTestId('estimate-form-line-0')
    const secondRow = screen.getByTestId('estimate-form-line-1')
    expect(firstRow.getAttribute('data-price-source')).toBe('USER')
    expect(firstRow.textContent).not.toContain('거래처 최근단가')
    expect(firstRow.textContent).not.toContain('단가 변경')
    expect(secondRow.getAttribute('data-price-source')).toBe('REMEMBERED')
    expect(secondRow.textContent).toContain('거래처 최근단가')
    expect(secondRow.textContent).toContain('단가 변경')
    expect(banner.textContent).toBe('거래처 변경 단가 확인 완료 · 최근단가 1건 · 변경 1행')

    fireEvent.change(estimateUnitPrice(1), { target: { value: '66666' } })

    expect(secondRow.getAttribute('data-price-source')).toBe('USER')
    expect(secondRow.textContent).not.toContain('거래처 최근단가')
    expect(secondRow.textContent).not.toContain('단가 변경')
    expect(banner.textContent).toBe('')
    expect(banner.getAttribute('class')).toBeNull()
  })

  it('estimate_ignoresStaleMemoryResponse', async () => {
    const pending = deferred<{ unitPrice: number; source: string; updatedAt: string } | null>()
    mocks.lookupProductByModelName.mockResolvedValue({
      productId: 'product-stale',
      productName: '스테일 제품',
      productType: 'SINGLE',
      sellingPrice: '33000',
    })
    mocks.getPriceMemory
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce({
        unitPrice: 66000,
        source: 'LINE_SAVE',
        updatedAt: '2026-07-11T09:00:00',
      })
    renderPage('/sales/estimates/new')

    fireEvent.click(screen.getByTestId('estimate-select-partner-a'))
    fireEvent.change(estimateModel(), { target: { value: 'MODEL-STALE' } })
    fireEvent.blur(estimateModel())
    await waitFor(() => expect(mocks.getPriceMemory).toHaveBeenCalledWith(mocks.partnerA.id, 'product-stale'))
    fireEvent.click(screen.getByTestId('estimate-select-partner-b'))
    await act(async () => {
      pending.resolve({ unitPrice: 77000, source: 'LINE_SAVE', updatedAt: '2026-07-10T09:00:00' })
      await pending.promise
    })

    // R5-H3: A 가격 응답은 폐기하되 품목을 바인딩한 뒤 현재 거래처 B로 가격을 다시 resolve한다.
    await waitFor(() => expect(mocks.getPriceMemory).toHaveBeenCalledWith(mocks.partnerB.id, 'product-stale'))
    await waitFor(() => expect(estimateUnitPrice().value).toBe('66000'))
    expect(screen.getByTestId('estimate-form-line-0').getAttribute('data-price-source')).toBe('REMEMBERED')
    expect((screen.getByTestId('estimate-coedit-items-0-productName') as HTMLInputElement).value).toBe('스테일 제품')

    fireEvent.click(screen.getByTestId('estimate-form-save-button'))
    await waitFor(() => expect(mocks.createEstimate).toHaveBeenCalledTimes(1))
    expect(mocks.createEstimate).toHaveBeenCalledWith(expect.objectContaining({
      partnerId: mocks.partnerB.id,
      lines: [expect.objectContaining({ productId: 'product-stale', unitPrice: '66000' })],
    }))
  })

  // R4-F1: 견적도 전표와 동일 semantics — 자동채움(REMEMBERED/CATALOG) 라인의 품목 교체 시
  // 이전 품목 단가·마커를 승계하지 않고 새 품목 기준 재채움(판매가 + 가격기억 재조회).
  it('estimate_productSwap_refillsAutoPriceAndMarker', async () => {
    mocks.lookupProductByModelName
      .mockResolvedValueOnce({
        productId: 'product-x',
        productName: '제품 X',
        productType: 'SINGLE',
        sellingPrice: '30000',
      })
      .mockResolvedValueOnce({
        productId: 'product-y',
        productName: '제품 Y',
        productType: 'SINGLE',
        sellingPrice: '55000',
      })
    mocks.getPriceMemory
      .mockResolvedValueOnce({ unitPrice: 88000, source: 'LINE_SAVE', updatedAt: '2026-07-01T09:00:00' })
      .mockResolvedValueOnce(null)
    renderPage('/sales/estimates/new')

    fireEvent.click(screen.getByTestId('estimate-select-partner-a'))
    fireEvent.change(estimateModel(), { target: { value: 'MODEL-X' } })
    fireEvent.blur(estimateModel())
    await waitFor(() => expect(estimateUnitPrice().value).toBe('88000'))
    expect(screen.getByTestId('estimate-form-line-0').getAttribute('data-price-source')).toBe('REMEMBERED')

    fireEvent.change(estimateModel(), { target: { value: 'MODEL-Y' } })
    fireEvent.blur(estimateModel())

    // 품목 교체 시 새 품목으로 가격기억 재조회 — X의 88000/저장일이 Y로 승계되지 않는다.
    await waitFor(() => expect(mocks.getPriceMemory).toHaveBeenCalledWith(mocks.partnerA.id, 'product-y'))
    await waitFor(() => expect(estimateUnitPrice().value).toBe('55000'))
    expect(screen.getByTestId('estimate-form-line-0').getAttribute('data-price-source')).toBe('CATALOG')
    expect((screen.getByTestId('estimate-coedit-items-0-productName') as HTMLInputElement).value).toBe('제품 Y')
    // D-R4-1: miss 마커 라벨 = '판매가'(제품 등록 화면 sellingPrice 라벨) — '정가' 금지.
    expect(screen.getByRole('note', { name: /판매가를 적용했습니다/ }).textContent).toBe('판매가')
    expect(screen.queryByRole('note', { name: /마지막으로 저장된 단가/ })).toBeNull()
  })

  // R4-D4(a): 거래처 미선택 CATALOG 마커는 거래처를 단정하지 않는 카피로 분기 —
  // "이 거래처에 저장된 최근단가가 없어 …" 는 거래처 선택 상태 전용.
  it('estimate_noPartner_catalogMarkerDoesNotClaimPartnerCopy', async () => {
    mocks.lookupProductByModelName.mockResolvedValue({
      productId: 'product-new',
      productName: '신규 제품',
      productType: 'SINGLE',
      sellingPrice: '33000',
    })
    renderPage('/sales/estimates/new')

    fireEvent.change(estimateModel(), { target: { value: 'MODEL-NEW' } })
    fireEvent.blur(estimateModel())

    await waitFor(() => expect(estimateUnitPrice().value).toBe('33000'))
    expect(mocks.getPriceMemory).not.toHaveBeenCalled()
    expect(screen.getByTestId('estimate-form-line-0').getAttribute('data-price-source')).toBe('CATALOG')
    // getByRole name(string) = 접근명 전체 일치 — 거래처 단정 카피였다면 매칭되지 않는다.
    const note = screen.getByRole('note', { name: '판매가를 적용했습니다' })
    expect(note.textContent).toBe('판매가')
    expect(note.getAttribute('aria-label')).not.toContain('거래처')
    expect(estimateUnitPrice().getAttribute('aria-describedby')).toBe(note.id)
  })

  // R4-D4(b)·D-R4-4: 거래처 해제 시 단가값 유지 + 마커(저장일 포함)만 해제. priceSource state 는
  // 유지해 거래처 재선택 시 재조회 대상 자격을 보존한다.
  it('estimate_partnerCleared_keepsPriceAndReleasesMarkerOnly', async () => {
    mocks.lookupProductByModelName.mockResolvedValue({
      productId: 'product-new',
      productName: '신규 제품',
      productType: 'SINGLE',
      sellingPrice: '33000',
    })
    mocks.getPriceMemory.mockResolvedValue({
      unitPrice: 88000,
      source: 'LINE_SAVE',
      updatedAt: '2026-07-10T09:00:00',
    })
    renderPage('/sales/estimates/new')

    fireEvent.click(screen.getByTestId('estimate-select-partner-a'))
    fireEvent.change(estimateModel(), { target: { value: 'MODEL-NEW' } })
    fireEvent.blur(estimateModel())
    await waitFor(() => expect(estimateUnitPrice().value).toBe('88000'))
    expect(screen.getByRole('note', { name: /이 거래처에 마지막으로 저장된 단가/ })).not.toBeNull()

    fireEvent.click(screen.getByTestId('estimate-clear-partner'))

    // 단가값 유지(판매가 33000 으로 되돌리지 않음) + 마커/저장일 해제 + 상태 보존
    expect(estimateUnitPrice().value).toBe('88000')
    expect(screen.queryByRole('note')).toBeNull()
    expect(estimateUnitPrice().hasAttribute('aria-describedby')).toBe(false)
    expect(screen.getByTestId('estimate-form-line-0').getAttribute('data-price-source')).toBe('REMEMBERED')

    // 거래처 재선택 시 자동 라인 재조회 자격 보존 — miss 면 판매가 마커로 격리
    mocks.getPriceMemories.mockResolvedValueOnce({ hits: [], failedProductIds: [] })
    fireEvent.click(screen.getByTestId('estimate-select-partner-b'))
    await waitFor(() => expect(mocks.getPriceMemories).toHaveBeenCalledWith(mocks.partnerB.id, ['product-new']))
    await waitFor(() => expect(estimateUnitPrice().value).toBe('33000'))
    expect(screen.getByTestId('estimate-form-line-0').getAttribute('data-price-source')).toBe('CATALOG')
    expect(screen.getByRole('note', { name: '이 거래처에 저장된 최근단가가 없어 판매가를 적용했습니다' }).textContent).toBe('판매가')
  })

  // R4-F2: legacy(unitPriceWithVat=null) 라인 편집-저장 시 원 공급단가 + priceVatInclusive=false —
  // BE 의 /1.1 재분리로 인한 약 9.1% 단가 하락·가격기억 오염 방지(전표 복사와 동일 semantics).
  it('estimate_legacyLine_unmodifiedSave_keepsSupplyPriceVatExclusive', async () => {
    const provider = makeProvider()
    mocks.getEstimate.mockResolvedValue(makeEstimate({
      lines: [{
        ...makeEstimate().lines[0],
        unitPriceWithVat: null,
        // BE BigDecimal JSON runtime 은 number — string DTO fixture 로 결함을 우회하지 않는다.
        // (R6-M4: R5 커밋이 주석만 남기고 string 을 유지해 가짜 회귀 테스트였던 것을 교정 —
        //  runtime number 라야 hydrate String() 정규화가 무력화되면 저장 body 의
        //  unitPrice: '10000' 문자열 단언이 실제 RED 가 된다.)
        unitPrice: 10000 as unknown as string,
      }],
    }))
    mocks.createDocCoeditProvider.mockResolvedValue(provider)
    renderPage()
    // R5-B1: 버튼 활성은 hydration 완료 증거가 아니다. 실 데이터 값/coedit seed 완료를 기다린다.
    await waitFor(() => expect(mocks.getEstimate).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(provider.subscribeDoc).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(estimateUnitPrice().value).toBe('10000'))

    fireEvent.click(screen.getByTestId('estimate-form-save-button'))

    await waitFor(() => expect(mocks.updateEstimate).toHaveBeenCalledTimes(1))
    expect(mocks.updateEstimate).toHaveBeenCalledWith('estimate-1', expect.objectContaining({
      lines: [expect.objectContaining({
        unitPrice: '10000',
        priceVatInclusive: false,
      })],
    }))
  })

  it('estimate_legacyLine_userEditedSave_sendsVatInclusive', async () => {
    const provider = makeProvider()
    mocks.getEstimate.mockResolvedValue(makeEstimate({
      lines: [{
        ...makeEstimate().lines[0],
        unitPriceWithVat: null,
        // R6-M4 계열 sweep: legacy fixture 도 BE BigDecimal JSON runtime(number)과 동일 형상.
        unitPrice: 10000 as unknown as string,
      }],
    }))
    mocks.createDocCoeditProvider.mockResolvedValue(provider)
    renderPage()
    await waitFor(() => expect(provider.subscribeDoc).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(estimateUnitPrice().value).toBe('10000'))

    // 값 비교가 아니라 provenance로 판정한다. 10000→99000→10000 되돌려도 실제 사용자 편집이다.
    fireEvent.change(estimateUnitPrice(), { target: { value: '99000' } })
    fireEvent.change(estimateUnitPrice(), { target: { value: '10000' } })
    fireEvent.click(screen.getByTestId('estimate-form-save-button'))

    await waitFor(() => expect(mocks.updateEstimate).toHaveBeenCalledTimes(1))
    expect(mocks.updateEstimate).toHaveBeenCalledWith('estimate-1', expect.objectContaining({
      lines: [expect.objectContaining({
        unitPrice: '10000',
        priceVatInclusive: true,
      })],
    }))
  })

  // R4-F4: 거래처 변경 최근단가 재조회 in-flight 동안 저장/발송 차단 + busy 단서 —
  // 이전 거래처 단가가 새 partnerId 로 저장돼 가격기억이 교차 오염되는 것을 방지.
  it('estimate_hydratedAuthoritativeLine_headerOnlySave_preservesSupplyVatTotal', async () => {
    const provider = makeProvider()
    mocks.getEstimate.mockResolvedValue(makeEstimate({
      lines: [{
        ...makeEstimate().lines[0],
        unitPrice: '100005' as unknown as string,
        unitPriceWithVat: '110004',
        supplyAmount: '100005',
        vatAmount: '9999',
        lineTotal: '110004',
      }],
    }))
    mocks.createDocCoeditProvider.mockResolvedValue(provider)
    renderPage()

    await waitFor(() => expect(provider.subscribeDoc).toHaveBeenCalledTimes(1))
    const memo = await screen.findByTestId('estimate-coedit-header-memo')
    fireEvent.change(memo, { target: { value: '헤더만 변경' } })
    fireEvent.click(screen.getByTestId('estimate-form-save-button'))

    await waitFor(() => expect(mocks.updateEstimate).toHaveBeenCalledTimes(1))
    expect(mocks.updateEstimate.mock.calls[0][1].lines[0]).toMatchObject({
      supplyAmount: '100005',
      vatAmount: '9999',
      lineTotalWithVat: '110004',
    })
  })

  it('estimate_partnerSwitch_blocksSaveWhileRefreshInFlight', async () => {
    const pendingBulk = deferred<{ hits: Array<{ productId: string; unitPrice: number; source: string; updatedAt: string }>; failedProductIds: string[] }>()
    mocks.lookupProductByModelName.mockResolvedValue({
      productId: 'product-busy',
      productName: 'busy 제품',
      productType: 'SINGLE',
      sellingPrice: '33000',
    })
    mocks.getPriceMemory.mockResolvedValue({
      unitPrice: 44000,
      source: 'LINE_SAVE',
      updatedAt: '2026-07-10T09:00:00',
    })
    mocks.getPriceMemories.mockReturnValueOnce(pendingBulk.promise)
    renderPage('/sales/estimates/new')

    fireEvent.click(screen.getByTestId('estimate-select-partner-a'))
    fireEvent.change(estimateModel(), { target: { value: 'MODEL-BUSY' } })
    fireEvent.blur(estimateModel())
    await waitFor(() => expect(estimateUnitPrice().value).toBe('44000'))

    // R4-D9 계열 sweep: busy live region 도 배너와 동일하게 활성 전부터 빈 컨테이너로
    // 선존재해야 SR 낭독이 신뢰된다(조건부 마운트 금지). 저장 버튼 enabled 대기로
    // lookupLoading 완전 해제(= priceResolutionBusy false)를 보장한 뒤 단언한다.
    await waitFor(() =>
      expect((screen.getByTestId('estimate-form-save-button') as HTMLButtonElement).disabled).toBe(false),
    )
    const busyNote = screen.getByTestId('estimate-form-price-refresh-busy')
    expect(busyNote.getAttribute('role')).toBe('status')
    expect(busyNote.getAttribute('aria-live')).toBe('polite')
    expect(busyNote.textContent).toBe('')

    fireEvent.click(screen.getByTestId('estimate-select-partner-b'))
    await waitFor(() => expect(mocks.getPriceMemories).toHaveBeenCalledWith(mocks.partnerB.id, ['product-busy']))

    // 동일 DOM 노드 유지(재마운트 아님) + 텍스트만 토글.
    expect(screen.getByTestId('estimate-form-price-refresh-busy')).toBe(busyNote)
    expect(busyNote.textContent).toContain('최근단가 확인 중')
    const saveButton = screen.getByTestId('estimate-form-save-button') as HTMLButtonElement
    expect(saveButton.disabled).toBe(true)
    fireEvent.click(saveButton)
    expect(mocks.createEstimate).not.toHaveBeenCalled()

    await act(async () => {
      pendingBulk.resolve({ hits: [{
        productId: 'product-busy',
        unitPrice: 99000,
        source: 'LINE_SAVE',
        updatedAt: '2026-07-11T09:00:00',
      }], failedProductIds: [] })
      await pendingBulk.promise
    })

    await waitFor(() => expect(estimateUnitPrice().value).toBe('99000'))
    // 완료 후에도 live region 은 상시 마운트 유지 — 텍스트만 소거된다.
    expect(screen.getByTestId('estimate-form-price-refresh-busy')).toBe(busyNote)
    expect(busyNote.textContent).toBe('')
    expect((screen.getByTestId('estimate-form-save-button') as HTMLButtonElement).disabled).toBe(false)
  })

  it('estimate_preservesUserOverride in both provider and UI', async () => {
    const pending = deferred<{ unitPrice: number; source: string; updatedAt: string } | null>()
    const provider = makeProvider()
    mocks.getEstimate.mockResolvedValue(makeEstimate({ lines: [] }))
    mocks.createDocCoeditProvider.mockResolvedValue(provider)
    mocks.lookupProductByModelName.mockResolvedValue({
      productId: 'product-pending',
      productName: '대기 제품',
      productType: 'SINGLE',
      sellingPrice: '33000',
    })
    mocks.getPriceMemory.mockReturnValueOnce(pending.promise)
    renderPage()

    await waitFor(() => expect(provider.subscribeDoc).toHaveBeenCalled())
    fireEvent.change(estimateModel(), { target: { value: 'MODEL-PENDING' } })
    fireEvent.blur(estimateModel())
    await waitFor(() => expect(mocks.getPriceMemory).toHaveBeenCalled())
    fireEvent.change(estimateUnitPrice(), { target: { value: '7777' } })
    await act(async () => {
      pending.resolve({ unitPrice: 88000, source: 'LINE_SAVE', updatedAt: '2026-07-10T09:00:00' })
      await pending.promise
    })

    expect(estimateUnitPrice().value).toBe('7777')
    expect(provider.setItemValue).toHaveBeenCalledWith(0, 'unitPrice', '7777')
    expect(provider.setItemValue).not.toHaveBeenCalledWith(0, 'unitPrice', '88000')
    expect(screen.getByTestId('estimate-form-line-0').getAttribute('data-price-source')).toBe('USER')
  })

  it('remote coedit unit price change promotes REMEMBERED to USER', async () => {
    const provider = makeProvider()
    mocks.getEstimate.mockResolvedValue(makeEstimate({ lines: [] }))
    mocks.createDocCoeditProvider.mockResolvedValue(provider)
    mocks.lookupProductByModelName.mockResolvedValue({
      productId: 'product-remote-price',
      productName: '원격 제품',
      productType: 'SINGLE',
      sellingPrice: '33000',
    })
    mocks.getPriceMemory.mockResolvedValue({
      unitPrice: 88000,
      source: 'LINE_SAVE',
      updatedAt: '2026-07-10T09:00:00',
    })
    renderPage()

    await waitFor(() => expect(provider.subscribeDoc).toHaveBeenCalled())
    fireEvent.change(estimateModel(), { target: { value: 'MODEL-REMOTE' } })
    fireEvent.blur(estimateModel())
    await waitFor(() => expect(screen.getByTestId('estimate-form-line-0').getAttribute('data-price-source')).toBe('REMEMBERED'))

    provider.setItemValue(0, 'unitPrice', '7777')
    act(() => provider.__emit())

    await waitFor(() => expect(estimateUnitPrice().value).toBe('7777'))
    expect(screen.getByTestId('estimate-form-line-0').getAttribute('data-price-source')).toBe('USER')
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('EstimateFormPage_create_sendsPriceVatInclusiveTrue', async () => {
    mocks.lookupProductByModelName.mockResolvedValue({
      productId: 'product-create',
      productName: '생성 제품',
      productType: 'SINGLE',
      sellingPrice: '33000',
    })
    renderPage('/sales/estimates/new')
    fireEvent.click(screen.getByTestId('estimate-select-partner-a'))
    fireEvent.change(estimateModel(), { target: { value: 'MODEL-CREATE' } })
    fireEvent.blur(estimateModel())
    await waitFor(() => expect(estimateUnitPrice().value).toBe('33000'))
    fireEvent.change(estimateUnitPrice(), { target: { value: '100000' } })
    fireEvent.click(screen.getByTestId('estimate-form-save-button'))

    await waitFor(() => expect(mocks.createEstimate).toHaveBeenCalledTimes(1))
    expect(mocks.createEstimate).toHaveBeenCalledWith(expect.objectContaining({
      partnerId: mocks.partnerA.id,
      lines: [expect.objectContaining({
        productId: 'product-create',
        unitPrice: '100000',
        priceVatInclusive: true,
      })],
    }))
  })

  it('EstimateFormPage_update_sendsPriceVatInclusiveTrue', async () => {
    mocks.getEstimate.mockResolvedValue(makeEstimate())
    mocks.createDocCoeditProvider.mockRejectedValue(new Error('coedit unavailable'))
    renderPage()
    await waitFor(() => expect(mocks.getEstimate).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(estimateUnitPrice().value).toBe('11000'))
    fireEvent.change(estimateUnitPrice(), { target: { value: '100000' } })
    fireEvent.click(screen.getByTestId('estimate-form-save-button'))

    await waitFor(() => expect(mocks.updateEstimate).toHaveBeenCalledTimes(1))
    expect(mocks.updateEstimate).toHaveBeenCalledWith('estimate-1', expect.objectContaining({
      partnerId: '11111111-1111-1111-1111-111111111111',
      lines: [expect.objectContaining({
        productId: 'product-1',
        unitPrice: '100000',
        priceVatInclusive: true,
      })],
    }))
  })

  // HIGH-3(#824 R1): 하단 합계 바가 행의 권위(VAT 직접 편집)를 무시하고 raw unitPrice×quantity 를
  // 독자적으로 10% 재분해했다. 행 자체는 이미 recalculateLineVat(line.authority) 를 쓰는데(옳음),
  // totals memo 만 옛 Math.round(incl/1.1) 코드였다 — 전표(SlipFormPage) 쪽은 이미 옳고 견적만 누락.
  it('HIGH-3: 하단 합계 바가 부가세 직접 편집(VAT authority)을 그대로 합산한다 — 자체 재계산 금지', async () => {
    mocks.getEstimate.mockResolvedValue(makeEstimate())
    mocks.createDocCoeditProvider.mockRejectedValue(new Error('coedit unavailable'))
    const { container } = renderPage()

    await waitFor(() => expect(estimateUnitPrice().value).toBe('11000'))

    // hydrate 직후: 공급 20,000 · 부가세 2,000 (수량 2 × 단가 11,000 의 10% 절사) — 행·하단 모두 일치.
    expect(totalsRowText(container, '공급가액')).toContain('20,000')
    expect(totalsRowText(container, '부가세')).toContain('2,000')

    // 부가세를 0으로 직접 편집 — supplyAmount(20,000)는 그대로 두고 lineTotal 만 20,000 으로 닫힌다.
    const vatField = screen.getByLabelText('라인 1 부가세') as HTMLInputElement
    fireEvent.change(vatField, { target: { value: '0' } })
    await waitFor(() => expect(vatField.value).toBe('0'))

    // 행 자체는 이미 옳다(recalculateLineVat 이 authority='VAT' 를 그대로 반영): 공급 20,000·부가세 0.
    expect((screen.getByLabelText('라인 1 공급가액') as HTMLInputElement).value).toBe('20000')

    // 회귀 재현: 고친 코드는 각 행의 권위값을 합산해 공급 20,000/부가세 0 이어야 한다.
    // 옛 코드(raw unitPrice×qty 를 독자 10% 재분해)는 여전히 공급 18,182/부가세 1,818 을 보인다.
    expect(totalsRowText(container, '공급가액')).toContain('20,000')
    expect(totalsRowText(container, '부가세')).toContain('0')
  })
})

/** 하단 합계 바("라벨 <strong>값</strong>" 형태) 텍스트 — label 로 시작하는 div 를 찾아 반환. */
function totalsRowText(container: HTMLElement, label: string): string {
  const row = Array.from(container.querySelectorAll('strong'))
    .map((strong) => strong.parentElement)
    .find((el): el is HTMLElement => !!el && (el.textContent ?? '').trim().startsWith(label))
  return row?.textContent?.trim() ?? ''
}
