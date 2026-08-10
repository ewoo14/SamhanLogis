// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

const harness = vi.hoisted(() => ({
  getPriceMemory: vi.fn(),
  getPriceMemories: vi.fn(),
  getPartnerDcConfig: vi.fn(),
  lookupPartnerForAutoFill: vi.fn(),
  createSlip: vi.fn(),
  expandBundleLine: vi.fn(),
  listWarehouses: vi.fn(),
  searchProducts: vi.fn(),
  searchPartners: vi.fn(),
  usePageTitle: vi.fn(),
  // MED-1(모바일 분기): useIsMobile 반환값을 테스트별로 토글하기 위한 플래그(기본 데스크톱=false).
  isMobile: false,
  partnerA: {
    id: '11111111-1111-1111-1111-111111111111',
    partnerCode: 'P-A',
    name: 'Partner A',
    phone: '010-1111-1111',
  },
  partnerB: {
    id: '22222222-2222-2222-2222-222222222222',
    partnerCode: 'P-B',
    name: 'Partner B',
    phone: '010-2222-2222',
  },
  productA: {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    modelName: 'MODEL-A',
    productName: 'Product A',
    productType: 'SINGLE',
    sellingPrice: '1000',
    modelCode: 'A',
    categoryKey: 'homemulti',
    hasVariableDiscount: true,
  },
  productB: {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    modelName: 'MODEL-B',
    productName: 'Product B',
    productType: 'SINGLE',
    sellingPrice: '2000',
    modelCode: 'B',
  },
  productC: {
    id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    modelName: 'MODEL-C',
    productName: 'Product C',
    productType: 'SINGLE',
    sellingPrice: '3000',
    modelCode: 'C',
  },
  // MED-1(변경만 케이스): 판매가(sellingPrice) 미보유 품목 — 거래처 변경 재조회 시 카탈로그
  // 폴백 미확보(UNAVAILABLE)로 priceSource=null + priceRefreshChanged=true 상태를 재현한다.
  productD: {
    id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    modelName: 'MODEL-D',
    productName: 'Product D',
    productType: 'SINGLE',
    sellingPrice: null,
    modelCode: 'D',
  },
  bundle: {
    id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    modelName: 'BUNDLE-1',
    productName: '세트 1',
    productType: 'BUNDLE',
    sellingPrice: '10000',
    modelCode: 'SET-1',
    categoryKey: 'homemulti',
    hasVariableDiscount: true,
  },
}))

vi.mock('@samhan/design-system', () => ({
  Button: ({ children, variant: _variant, size: _size, loading: _loading, ...props }: any) => {
    const text = Array.isArray(children) ? children.join('') : String(children ?? '')
    const testId = props['data-testid']
    return (
      <button {...props} data-testid={testId} type="button">
        {children}
      </button>
    )
  },
  Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  DeliveryTagSelector: ({ value, onChange, options = [] }: any) => (
    <select
      data-testid="delivery-tag-selector"
      aria-label="출고구분"
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value || null)}
    >
      <option value="">선택</option>
      {options.map((option: any) => (
        <option key={option.code} value={option.code}>{option.displayName}</option>
      ))}
    </select>
  ),
  FormField: ({ label, render }: { label: string; render: (args: { id: string }) => React.ReactNode }) => (
    <label>
      <span>{label}</span>
      {render({ id: `field-${label}` })}
    </label>
  ),
  Input: React.forwardRef<HTMLInputElement, any>(function Input(props, ref) {
    return <input ref={ref} {...props} />
  }),
  KOREAN_MOBILE_PHONE_PATTERN: /^010-/,
  LineRow: (props: any) => {
    const lineNo = props.lineNumber
    return (
      <div
        data-testid={`line-${lineNo}`}
        data-product-id={props.line.productId ?? ''}
        data-model-code={props.line.modelCode ?? ''}
        data-price-source={props.line.priceSource ?? ''}
        data-discount-info={props.line.discountInfo ?? ''}
        data-lookup-loading={String(props.line.lookupLoading ?? false)}
        data-price-lookup-pending={String(props.priceLookupPending ?? false)}
        data-partner-selected={String(props.partnerSelected ?? '')}
        data-excluded-from-save={String(props.excludedFromSave ?? '')}
      >
        {props.modelCell}
        <span data-testid={`product-name-${lineNo}`}>{props.line.productName}</span>
        <input
          aria-label={`line-${lineNo}-specification`}
          value={props.line.specification}
          onChange={(event) => props.onSpecificationChange(event.target.value)}
        />
        <input
          aria-label={`line-${lineNo}-quantity`}
          value={props.line.quantity}
          onChange={(event) => props.onQuantityChange(event.target.value)}
        />
        <input
          aria-label={`line-${lineNo}-unit-price`}
          value={props.line.unitPrice}
          onChange={(event) => props.onUnitPriceChange(event.target.value)}
        />
        <button
          type="button"
          data-testid={`delete-line-${lineNo}`}
          disabled={!props.canDelete}
          onClick={props.onDelete}
        >
          delete
        </button>
      </div>
    )
  },
  LineTableHeader: () => <div data-testid="line-table-header" />,
  PartnerAutocomplete: ({ onChange, disabled }: any) => (
    <div>
      <button type="button" data-testid="select-partner-a" disabled={disabled} onClick={() => onChange(harness.partnerA)}>
        partner-a
      </button>
      <button type="button" data-testid="select-partner-b" disabled={disabled} onClick={() => onChange(harness.partnerB)}>
        partner-b
      </button>
      <button type="button" data-testid="clear-partner" disabled={disabled} onClick={() => onChange(null)}>
        clear-partner
      </button>
    </div>
  ),
  PhoneInput: ({ helperText: _helperText, ...props }: any) => <input {...props} />,
  ProductAutocomplete: ({ ariaLabel, onChange, onInputCommitChange, resultSelectionMode }: any) => {
    const lineNo = /(\d+)/.exec(String(ariaLabel ?? ''))?.[1] ?? '1'
    return (
      <div
        data-testid={`product-autocomplete-${lineNo}`}
        data-result-selection-mode={resultSelectionMode ?? ''}
      >
        <button type="button" data-testid={`select-product-a-${lineNo}`} onClick={() => onChange(harness.productA)}>
          product-a
        </button>
        <button type="button" data-testid={`select-product-b-${lineNo}`} onClick={() => onChange(harness.productB)}>
          product-b
        </button>
        <button type="button" data-testid={`select-product-c-${lineNo}`} onClick={() => onChange(harness.productC)}>
          product-c
        </button>
        <button type="button" data-testid={`select-product-d-${lineNo}`} onClick={() => onChange(harness.productD)}>
          product-d
        </button>
        <button type="button" data-testid={`select-bundle-${lineNo}`} onClick={() => onChange(harness.bundle)}>
          bundle
        </button>
        <button type="button" data-testid={`type-product-${lineNo}`} onClick={() => onInputCommitChange?.(false)}>
          type-product
        </button>
      </div>
    )
  },
  WarehouseAutocomplete: ({ onChange }: any) => (
    <button type="button" data-testid="select-warehouse" onClick={() => onChange('warehouse-1')}>
      warehouse
    </button>
  ),
}))

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  closestCenter: vi.fn(),
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
}))

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  arrayMove: (items: unknown[]) => items,
  sortableKeyboardCoordinates: vi.fn(),
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    setActivatorNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
  verticalListSortingStrategy: {},
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => undefined } },
}))

vi.mock('../api/slip', () => ({
  createSlip: harness.createSlip,
  createBundleInstanceKey: () => 'test-instance-key',
  expandBundleLine: harness.expandBundleLine,
  getPriceMemories: harness.getPriceMemories,
  getPriceMemory: harness.getPriceMemory,
  lookupPartnerForAutoFill: harness.lookupPartnerForAutoFill,
  emptyBundleSetOptions: () => ({
    outdoorUnits: 1,
    indoorUnits: 1,
    installationHours: 0,
    commissioningHours: 0,
  }),
  toApiBundleSetOptions: (_productType: string | null, options: unknown) => options,
}))

vi.mock('../api/inventory', () => ({
  listWarehouses: harness.listWarehouses,
}))

vi.mock('../api/sales', () => ({
  getPartnerDcConfig: harness.getPartnerDcConfig,
}))

vi.mock('../api/productApi', () => ({
  searchProducts: harness.searchProducts,
}))

vi.mock('../api/partnerApi', () => ({
  searchPartners: harness.searchPartners,
}))

vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: () => harness.isMobile }))
vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: harness.usePageTitle }))
vi.mock('./components/InventoryLookupModal', () => ({ InventoryLookupModal: () => null }))

import { SlipFormPage } from './SlipFormPage'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SlipFormPage mode="OUTBOUND" />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function selectPartnerA() {
  fireEvent.click(screen.getByTestId('select-partner-a'))
  await waitFor(() => expect(harness.lookupPartnerForAutoFill).toHaveBeenCalledWith('P-A'))
}

async function selectPartnerB() {
  fireEvent.click(screen.getByTestId('select-partner-b'))
  await waitFor(() => expect(harness.lookupPartnerForAutoFill).toHaveBeenCalledWith('P-B'))
}

function unitPrice(lineNo = 1) {
  return screen.getByLabelText(`line-${lineNo}-unit-price`) as HTMLInputElement
}

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.resetAllMocks()
  harness.productA.hasVariableDiscount = true
  harness.productA.categoryKey = 'homemulti'
  harness.productA.sellingPrice = '1000'
  harness.bundle.modelCode = 'SET-1'
  harness.bundle.sellingPrice = '10000'
  ;(harness.bundle as any).deliveryPrice = undefined
  harness.bundle.categoryKey = 'homemulti'
  harness.isMobile = false
  harness.listWarehouses.mockResolvedValue([])
  harness.lookupPartnerForAutoFill.mockResolvedValue({})
  harness.createSlip.mockResolvedValue({})
  harness.expandBundleLine.mockResolvedValue([])
  harness.getPriceMemory.mockResolvedValue(null)
  harness.getPriceMemories.mockResolvedValue({ hits: [], failedProductIds: [] })
  harness.getPartnerDcConfig.mockResolvedValue(null)
})

describe('SlipFormPage price memory autofill', () => {
  it('실제 거래처·품목 선택 흐름에서 최근단가 Promise 동안 pending 신호를 켜고 완료 시 끈다', async () => {
    const pendingPriceMemory = deferred<{ unitPrice: number; source: string; updatedAt: string } | null>()
    harness.getPriceMemory.mockReturnValueOnce(pendingPriceMemory.promise)

    renderPage()
    await selectPartnerA()
    fireEvent.click(screen.getByTestId('select-product-a-1'))

    await waitFor(() => expect(harness.getPriceMemory).toHaveBeenCalledWith(
      harness.partnerA.id,
      harness.productA.id,
    ))
    expect(screen.getByTestId('line-1').getAttribute('data-price-lookup-pending')).toBe('true')

    await act(async () => {
      pendingPriceMemory.resolve({ unitPrice: 1200, source: 'LINE_SAVE', updatedAt: '2026-08-07T09:00:00' })
      await pendingPriceMemory.promise
    })

    await waitFor(() => expect(screen.getByTestId('line-1').getAttribute('data-price-lookup-pending')).toBe('false'))
  })

  it('R23 RED-A3 마지막 행을 채우면 수동 버튼 없이 다음 빈행이 계속 생긴다', () => {
    renderPage()

    fireEvent.change(screen.getByLabelText('line-5-specification'), {
      target: { value: '첫 자동행' },
    })
    expect(screen.getByTestId('line-6')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('line-6-specification'), {
      target: { value: '둘째 자동행' },
    })
    expect(screen.getByTestId('line-7')).toBeTruthy()
  })

  it('R23 RED-B2 판매·구매 신규 전표의 후보 다건은 단일 선택 모달 계약을 유지한다', () => {
    renderPage()

    expect(screen.getByTestId('product-autocomplete-1').getAttribute('data-result-selection-mode'))
      .toBe('single')
  })

  it('uses remembered unit price when price memory exists', async () => {
    harness.getPriceMemory.mockResolvedValueOnce({
      unitPrice: 999000,
      source: 'LINE_SAVE',
      updatedAt: '2026-07-10T09:00:00',
    })
    renderPage()
    const status = screen.getByTestId('slip-price-refresh-banner')
    expect(status.textContent).toBe('')
    await selectPartnerA()

    fireEvent.click(screen.getByTestId('select-product-a-1'))

    await waitFor(() =>
      expect(harness.getPriceMemory).toHaveBeenCalledWith(
        harness.partnerA.id,
        harness.productA.id,
      ),
    )
    await waitFor(() => expect(unitPrice().value).toBe('999000'))
    expect(unitPrice().value).not.toBe(harness.productA.sellingPrice)
    expect(status.textContent).toBe('라인 1 거래처 최근단가 적용')
  })

  it('falls back to catalog selling price when price memory misses', async () => {
    harness.getPriceMemory.mockResolvedValueOnce(null)
    renderPage()
    await selectPartnerA()

    fireEvent.click(screen.getByTestId('select-product-a-1'))

    await waitFor(() =>
      expect(harness.getPriceMemory).toHaveBeenCalledWith(
        harness.partnerA.id,
        harness.productA.id,
      ),
    )
    await waitFor(() => expect(unitPrice().value).toBe(harness.productA.sellingPrice))
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('preserves user override and skips price memory lookup', async () => {
    renderPage()
    await selectPartnerA()
    fireEvent.change(unitPrice(), { target: { value: '7777' } })

    fireEvent.click(screen.getByTestId('select-product-a-1'))

    await waitFor(() => expect(screen.getByTestId('product-name-1').textContent).toBe(harness.productA.productName))
    expect(harness.getPriceMemory).not.toHaveBeenCalled()
    expect(unitPrice().value).toBe('7777')
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('ignores a late response when partner changes during lookup', async () => {
    const first = deferred<{ unitPrice: number; source: string; updatedAt: string } | null>()
    const second = deferred<{ hits: Array<{ productId: string; unitPrice: number; source: string; updatedAt: string }>; failedProductIds: string[] }>()
    harness.getPriceMemory.mockReturnValueOnce(first.promise)
    harness.getPriceMemories.mockReturnValueOnce(second.promise)
    renderPage()
    await selectPartnerA()

    fireEvent.click(screen.getByTestId('select-product-a-1'))
    await waitFor(() => expect(harness.getPriceMemory).toHaveBeenCalledWith(harness.partnerA.id, harness.productA.id))
    await waitFor(() => expect(screen.getByTestId('product-name-1').textContent).toBe(harness.productA.productName))
    await selectPartnerB()
    await waitFor(() => expect(harness.getPriceMemories).toHaveBeenCalledWith(harness.partnerB.id, [harness.productA.id]))

    await act(async () => {
      second.resolve({ hits: [{
        productId: harness.productA.id,
        unitPrice: 222000,
        source: 'LINE_SAVE',
        updatedAt: '2026-07-11T09:00:00',
      }], failedProductIds: [] })
      await second.promise
    })
    await waitFor(() => expect(unitPrice().value).toBe('222000'))

    await act(async () => {
      first.resolve({ unitPrice: 111000, source: 'LINE_SAVE', updatedAt: '2026-07-10T09:00:00' })
      await first.promise
    })
    expect(unitPrice().value).toBe('222000')
  })

  it('does not apply a prior partner bulk result while the newly selected partner DC is pending', async () => {
    const pendingPreviousPartnerBulk = deferred<{
      hits: Array<{ productId: string; unitPrice: number; source: string; updatedAt: string }>
      failedProductIds: string[]
    }>()
    const pendingCurrentPartnerDc = deferred<null>()
    let partnerACallCount = 0
    harness.getPartnerDcConfig.mockImplementation((partnerCode: string) => {
      if (partnerCode === harness.partnerA.partnerCode) {
        partnerACallCount += 1
        return partnerACallCount >= 3 ? pendingCurrentPartnerDc.promise : Promise.resolve(null)
      }
      return Promise.resolve({
        partnerCode,
        companyName: harness.partnerB.name,
        homeMultiDc: '45%',
        commercialMultiDc: null,
      })
    })
    harness.getPriceMemories.mockReturnValueOnce(pendingPreviousPartnerBulk.promise)

    renderPage()
    await selectPartnerA()
    fireEvent.click(screen.getByTestId('select-product-a-1'))
    await waitFor(() => expect(unitPrice().value).toBe(harness.productA.sellingPrice))

    await selectPartnerB()
    await waitFor(() => expect(harness.getPriceMemories).toHaveBeenCalledWith(harness.partnerB.id, [harness.productA.id]))

    await selectPartnerA()
    expect(screen.getByTestId('line-1').getAttribute('data-lookup-loading')).toBe('true')

    await act(async () => {
      pendingPreviousPartnerBulk.resolve({ hits: [], failedProductIds: [] })
      await pendingPreviousPartnerBulk.promise
    })

    expect(unitPrice().value).toBe(harness.productA.sellingPrice)
    expect(screen.getByTestId('line-1').getAttribute('data-discount-info')).toBe('')
    expect(screen.getByTestId('line-1').getAttribute('data-lookup-loading')).toBe('true')
    expect(screen.getByTestId('slip-price-refresh-banner').textContent).toBe('')

    // 이 테스트가 남긴 현재 A 거래처 DC Promise도 여기서 닫는다. cleanup은
    // unmount만 수행하므로, 미해결로 남기면 제품의 5초 timeout 뒤 이전 렌더가
    // 새 테스트의 module-level 가격 mock을 호출할 수 있다.
    let currentPartnerDcSettled = false
    await act(async () => {
      pendingCurrentPartnerDc.resolve(null)
      await pendingCurrentPartnerDc.promise
      currentPartnerDcSettled = true
    })
    expect(currentPartnerDcSettled).toBe(true)
    await waitFor(() => expect(harness.getPriceMemories).toHaveBeenCalledWith(
      harness.partnerA.id,
      [harness.productA.id],
    ))
  })

  it('ignores a late response when the same line changes to another product', async () => {
    const first = deferred<{ unitPrice: number; source: string; updatedAt: string } | null>()
    const second = deferred<{ unitPrice: number; source: string; updatedAt: string } | null>()
    harness.getPriceMemory
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    renderPage()
    await selectPartnerA()

    fireEvent.click(screen.getByTestId('select-product-a-1'))
    await waitFor(() => expect(harness.getPriceMemory).toHaveBeenCalledWith(harness.partnerA.id, harness.productA.id))
    await waitFor(() => expect(screen.getByTestId('product-name-1').textContent).toBe(harness.productA.productName))
    fireEvent.click(screen.getByTestId('select-product-b-1'))
    await waitFor(() => expect(harness.getPriceMemory).toHaveBeenCalledWith(harness.partnerA.id, harness.productB.id))

    await act(async () => {
      second.resolve({ unitPrice: 202000, source: 'LINE_SAVE', updatedAt: '2026-07-12T09:00:00' })
      await second.promise
    })
    await waitFor(() => expect(unitPrice().value).toBe('202000'))

    await act(async () => {
      first.resolve({ unitPrice: 101000, source: 'LINE_SAVE', updatedAt: '2026-07-10T09:00:00' })
      await first.promise
    })
    expect(screen.getByTestId('product-name-1').textContent).toBe(harness.productB.productName)
    expect(unitPrice().value).toBe('202000')
  })

  it('ignores a late response when the line is deleted during lookup', async () => {
    const pending = deferred<{ unitPrice: number; source: string; updatedAt: string } | null>()
    harness.getPriceMemory.mockReturnValueOnce(pending.promise)
    renderPage()
    await selectPartnerA()
    fireEvent.click(screen.getByTestId('select-product-a-2'))
    await waitFor(() => expect(harness.getPriceMemory).toHaveBeenCalledWith(harness.partnerA.id, harness.productA.id))
    fireEvent.click(screen.getByTestId('delete-line-2'))
    // 초기 자동 빈행 5개에서 2번 행을 삭제하면 뒤 행이 번호를 당긴다.
    expect(screen.getAllByTestId(/^line-\d+$/)).toHaveLength(4)

    await act(async () => {
      pending.resolve({ unitPrice: 999000, source: 'LINE_SAVE', updatedAt: '2026-07-10T09:00:00' })
      await pending.promise
    })
    // 늦은 가격 응답 이후에도 삭제로 줄어든 행 수가 복원되지 않는다.
    expect(screen.getAllByTestId(/^line-\d+$/)).toHaveLength(4)
    expect(unitPrice(1).value).toBe('0')
  })

  it('refreshes autofilled lines on partner change and preserves user override lines', async () => {
    harness.getPriceMemory.mockResolvedValueOnce({
      unitPrice: 100000,
      source: 'LINE_SAVE',
      updatedAt: '2026-07-10T09:00:00',
    })
    harness.getPriceMemories.mockResolvedValueOnce({ hits: [{
      productId: harness.productA.id,
      unitPrice: 200000,
      source: 'LINE_SAVE',
      updatedAt: '2026-07-11T09:00:00',
    }], failedProductIds: [] })
    renderPage()
    await selectPartnerA()
    fireEvent.click(screen.getByTestId('select-product-a-1'))
    await waitFor(() => expect(unitPrice(1).value).toBe('100000'))

    fireEvent.change(unitPrice(2), { target: { value: '7777' } })
    fireEvent.click(screen.getByTestId('select-product-b-2'))
    await waitFor(() => expect(screen.getByTestId('product-name-2').textContent).toBe(harness.productB.productName))
    expect(unitPrice(2).value).toBe('7777')

    await selectPartnerB()

    await waitFor(() => expect(harness.getPriceMemories).toHaveBeenCalledWith(harness.partnerB.id, [harness.productA.id]))
    expect(harness.getPriceMemories).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(unitPrice(1).value).toBe('200000'))
    expect(unitPrice(2).value).toBe('7777')
    // R4 수렴 fix: 상시 마운트 live region 이 2곳(재적용 배너 + busy 단서)이라 role=status
    // 단수 조회는 모호 — 배너 testid 로 대상을 고정하되 role=status a11y 계약 단언은 유지한다.
    const refreshBanner = screen.getByTestId('slip-price-refresh-banner')
    expect(refreshBanner.getAttribute('role')).toBe('status')
    expect(refreshBanner.textContent).toContain('거래처 변경으로 최근단가 재적용')
    expect(screen.getByTestId('line-1').getAttribute('data-price-source')).toBe('REMEMBERED')
  })

  it('clears the stale single-lookup announcement when a partner switch refresh starts', async () => {
    // R6-M5: slip 폼만 재조회 시작 시 단건 안내를 클리어하지 않아(견적 669행과 비대칭)
    // 재적용 결과가 동일 단가(priceRefreshChanged=false → 배너 비활성)일 때 region 이
    // "라인 1 거래처 최근단가 적용" stale 문구로 폴백 — SR 이 이제는 거짓인 문장을 재낭독했다.
    harness.getPriceMemory.mockResolvedValueOnce({
      unitPrice: 999000,
      source: 'LINE_SAVE',
      updatedAt: '2026-07-10T09:00:00',
    })
    harness.getPriceMemories.mockResolvedValueOnce({ hits: [{
      productId: harness.productA.id,
      unitPrice: 999000,
      source: 'LINE_SAVE',
      updatedAt: '2026-07-11T09:00:00',
    }], failedProductIds: [] })
    renderPage()
    await selectPartnerA()
    fireEvent.click(screen.getByTestId('select-product-a-1'))
    await waitFor(() => expect(unitPrice().value).toBe('999000'))
    const status = screen.getByTestId('slip-price-refresh-banner')
    expect(status.textContent).toBe('라인 1 거래처 최근단가 적용')

    await selectPartnerB()

    await waitFor(() => expect(harness.getPriceMemories).toHaveBeenCalledWith(harness.partnerB.id, [harness.productA.id]))
    await waitFor(() => expect(unitPrice().value).toBe('999000'))
    expect(screen.getByTestId('line-1').getAttribute('data-price-source')).toBe('REMEMBERED')
    // 동일 단가 재적용이라 배너는 비활성 — stale 단건 문구로 폴백하지 않고 빈 텍스트여야 한다.
    expect(status.textContent).toBe('')
  })

  it('partner change uses one bulk call and maps omitted products to catalog miss', async () => {
    harness.getPriceMemories.mockResolvedValueOnce({ hits: [{
      productId: harness.productA.id,
      unitPrice: 555000,
      source: 'LINE_SAVE',
      updatedAt: '2026-07-11T09:00:00',
    }], failedProductIds: [] })
    renderPage()
    await selectPartnerA()
    fireEvent.click(screen.getByTestId('select-product-a-1'))
    await waitFor(() => expect(unitPrice(1).value).toBe(harness.productA.sellingPrice))
    fireEvent.click(screen.getByTestId('select-product-b-2'))
    await waitFor(() => expect(unitPrice(2).value).toBe(harness.productB.sellingPrice))

    await selectPartnerB()

    await waitFor(() => expect(harness.getPriceMemories).toHaveBeenCalledWith(
      harness.partnerB.id,
      [harness.productA.id, harness.productB.id],
    ))
    expect(harness.getPriceMemories).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(unitPrice(1).value).toBe('555000'))
    expect(unitPrice(2).value).toBe(harness.productB.sellingPrice)
    expect(screen.getByTestId('line-1').getAttribute('data-price-source')).toBe('REMEMBERED')
    expect(screen.getByTestId('line-2').getAttribute('data-price-source')).toBe('CATALOG')
  })

  it('treats zero remembered unit price as a valid hit', async () => {
    harness.getPriceMemory.mockResolvedValueOnce({
      unitPrice: 0,
      source: 'LINE_SAVE',
      updatedAt: '2026-07-10T09:00:00',
    })
    renderPage()
    await selectPartnerA()

    fireEvent.click(screen.getByTestId('select-product-a-1'))

    await waitFor(() => expect(harness.getPriceMemory).toHaveBeenCalledWith(harness.partnerA.id, harness.productA.id))
    await waitFor(() => expect(unitPrice().value).toBe('0'))
    expect(screen.getByTestId('line-1').getAttribute('data-price-source')).toBe('REMEMBERED')
  })

  it('passes remembered priceSource to the real LineRow boundary', async () => {
    harness.getPriceMemory.mockResolvedValueOnce({
      unitPrice: 123000,
      source: 'LINE_SAVE',
      updatedAt: '2026-07-10T09:00:00',
    })
    renderPage()
    await selectPartnerA()

    fireEvent.click(screen.getByTestId('select-product-a-1'))

    await waitFor(() => expect(screen.getByTestId('line-1').getAttribute('data-price-source')).toBe('REMEMBERED'))

    fireEvent.change(unitPrice(2), { target: { value: '7777' } })
    fireEvent.click(screen.getByTestId('select-product-b-2'))
    await waitFor(() => expect(screen.getByTestId('product-name-2').textContent).toBe(harness.productB.productName))
    expect(screen.getByTestId('line-2').getAttribute('data-price-source')).toBe('USER')
  })

  it('skips price memory lookup when partnerId is not selected', async () => {
    renderPage()

    fireEvent.click(screen.getByTestId('select-product-a-1'))

    await waitFor(() => expect(screen.getByTestId('product-name-1').textContent).toBe(harness.productA.productName))
    expect(harness.getPriceMemory).not.toHaveBeenCalled()
    expect(unitPrice().value).toBe(harness.productA.sellingPrice)
  })

  it('keeps catalog fallback when price memory lookup rejects', async () => {
    harness.getPriceMemory.mockRejectedValueOnce(new Error('forbidden'))
    renderPage()
    await selectPartnerA()

    fireEvent.click(screen.getByTestId('select-product-a-1'))

    await waitFor(() => expect(harness.getPriceMemory).toHaveBeenCalledWith(harness.partnerA.id, harness.productA.id))
    await waitFor(() => expect(screen.getByTestId('product-name-1').textContent).toBe(harness.productA.productName))
    await waitFor(() => expect(unitPrice().value).toBe(harness.productA.sellingPrice))
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('keeps the global discount price when recent price lookup misses', async () => {
    harness.getPartnerDcConfig.mockResolvedValue({
      partnerCode: harness.partnerA.partnerCode,
      companyName: harness.partnerA.name,
      homeMultiDc: '48%',
      commercialMultiDc: '49%',
    })
    renderPage()
    await selectPartnerA()
    fireEvent.click(screen.getByTestId('select-product-a-1'))

    await waitFor(() => expect(unitPrice().value).toBe('520'))
    fireEvent.click(screen.getByTestId('select-warehouse'))
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(harness.createSlip).toHaveBeenCalledTimes(1))
    expect(harness.createSlip).toHaveBeenCalledWith(expect.objectContaining({
      discountInfo: '거래처 전역DC 48% 적용',
    }))
  })

  it('applies global DC to a BUNDLE base price before expanding its components', async () => {
    harness.getPartnerDcConfig.mockResolvedValue({
      partnerCode: harness.partnerA.partnerCode,
      companyName: harness.partnerA.name,
      homeMultiDc: '48%',
      commercialMultiDc: null,
    })
    harness.expandBundleLine.mockResolvedValueOnce([{
      productId: harness.productA.id,
      modelName: harness.productA.modelName,
      name: harness.productA.productName,
      quantity: 1,
      unitPrice: 5200,
      specification: null,
    }])

    renderPage()
    await selectPartnerA()
    fireEvent.click(screen.getByTestId('select-bundle-1'))

    await waitFor(() => expect(unitPrice().value).toBe('5200'))
    await waitFor(() => expect(harness.expandBundleLine).toHaveBeenCalledWith(expect.objectContaining({
      unitPrice: '5200',
    })))
  })

  it('preserves server-allocated component prices after applying a single-set fixed amount to the parent', async () => {
    harness.getPartnerDcConfig.mockResolvedValue({
      partnerCode: harness.partnerA.partnerCode,
      companyName: harness.partnerA.name,
      homeMultiDc: null,
      commercialMultiDc: null,
      threeSixty: '30,000',
      fourWay: null,
      oneWay: null,
      stand: null,
      deluxe: null,
      firstGrade: null,
    })
    harness.expandBundleLine.mockResolvedValueOnce([{
      productId: harness.productA.id,
      modelName: harness.productA.modelName,
      name: harness.productA.productName,
      modelCode: 'AC123456P',
      quantity: 1,
      unitPrice: 100000,
      specification: null,
    }])

    renderPage()
    await selectPartnerA()
    fireEvent.click(screen.getByTestId('select-bundle-1'))

    await waitFor(() => expect(unitPrice().value).toBe('100000'))
    expect(screen.getByTestId('line-1').getAttribute('data-discount-info')).toBe('')
  })

  it('applies a single-set fixed amount once when two expanded components carry the flag', async () => {
    harness.getPartnerDcConfig.mockResolvedValue({
      partnerCode: harness.partnerA.partnerCode,
      companyName: harness.partnerA.name,
      homeMultiDc: null,
      commercialMultiDc: null,
      threeSixty: '30,000',
      fourWay: null,
      oneWay: null,
      stand: null,
      deluxe: null,
      firstGrade: null,
    })
    harness.expandBundleLine.mockResolvedValueOnce([
      { productId: harness.productA.id, modelName: 'Flag A', name: 'Flag A', modelCode: 'AC072CS6PBH1SY', quantity: 1, unitPrice: 70000, specification: null },
      { productId: harness.productB.id, modelName: 'Flag B', name: 'Flag B', modelCode: 'AC072CS6PBH1SY', quantity: 1, unitPrice: 30000, specification: null },
    ])

    renderPage()
    await selectPartnerA()
    fireEvent.click(screen.getByTestId('select-bundle-1'))

    await waitFor(() => expect(unitPrice(1).value).toBe('70000'))
    expect(unitPrice(2).value).toBe('30000')
    expect(Number(unitPrice(1).value) + Number(unitPrice(2).value)).toBe(100000)
  })

  it('re-expands an expanded bundle from its parent catalog price after a partner switch', async () => {
    harness.bundle.sellingPrice = '1000000'
    harness.bundle.modelCode = 'AC072CS6PBH1SY'
    harness.bundle.categoryKey = null
    harness.getPartnerDcConfig.mockImplementation(async (partnerCode: string) => ({
      partnerCode,
      companyName: partnerCode === 'P-A' ? 'Partner A' : 'Partner B',
      homeMultiDc: null,
      commercialMultiDc: null,
      threeSixty: partnerCode === 'P-A' ? '30,000' : '45,000',
      fourWay: null,
      oneWay: null,
      stand: null,
      deluxe: null,
      firstGrade: null,
    }))
    harness.expandBundleLine
      .mockResolvedValueOnce([{ productId: harness.productA.id, modelName: 'Flag A', name: 'Flag A', modelCode: 'AC072CS6PBH1SY', quantity: 1, unitPrice: 970000, specification: null }])
      .mockResolvedValueOnce([{ productId: harness.productA.id, modelName: 'Flag A', name: 'Flag A', modelCode: 'AC072CS6PBH1SY', quantity: 1, unitPrice: 955000, specification: null }])

    renderPage()
    await selectPartnerA()
    fireEvent.click(screen.getByTestId('select-bundle-1'))
    await waitFor(() => expect(unitPrice().value).toBe('970000'))

    await selectPartnerB()
    await waitFor(() => expect(harness.expandBundleLine).toHaveBeenCalledTimes(2))
    expect(harness.expandBundleLine.mock.calls[1][0]).toEqual(expect.objectContaining({ unitPrice: '955000' }))
    await waitFor(() => expect(unitPrice().value).toBe('955000'))
  })

  it('uses the bundle delivery price, not selling price, as the partner reprice base', async () => {
    harness.bundle.sellingPrice = '2780800'
    ;(harness.bundle as any).deliveryPrice = 1840000
    harness.bundle.modelCode = 'AC072CS6PBH1SY'
    harness.bundle.categoryKey = null
    harness.getPartnerDcConfig.mockImplementation(async (partnerCode: string) => ({
      partnerCode,
      companyName: partnerCode === 'P-A' ? 'Partner A' : 'Partner B',
      homeMultiDc: null,
      commercialMultiDc: null,
      threeSixty: partnerCode === 'P-B' ? '30,000' : null,
      fourWay: null,
      oneWay: null,
      stand: null,
      deluxe: null,
      firstGrade: null,
    }))
    harness.expandBundleLine
      .mockResolvedValueOnce([
        { productId: harness.productA.id, modelName: 'Indoor', name: 'Indoor', modelCode: 'INDOOR', quantity: 1, unitPrice: 1000000 },
        { productId: harness.productB.id, modelName: 'Outdoor', name: 'Outdoor', modelCode: 'OUTDOOR', quantity: 1, unitPrice: 840000 },
      ])
      .mockResolvedValueOnce([
        { productId: harness.productA.id, modelName: 'Indoor', name: 'Indoor', modelCode: 'INDOOR', quantity: 1, unitPrice: 1000000 },
        { productId: harness.productB.id, modelName: 'Outdoor', name: 'Outdoor', modelCode: 'OUTDOOR', quantity: 1, unitPrice: 810000 },
      ])
      .mockResolvedValueOnce([
        { productId: harness.productA.id, modelName: 'Indoor', name: 'Indoor', modelCode: 'INDOOR', quantity: 1, unitPrice: 1000000 },
        { productId: harness.productB.id, modelName: 'Outdoor', name: 'Outdoor', modelCode: 'OUTDOOR', quantity: 1, unitPrice: 840000 },
      ])

    renderPage()
    await selectPartnerA()
    fireEvent.click(screen.getByTestId('select-bundle-1'))
    await waitFor(() => expect(unitPrice(1).value).toBe('1000000'))

    await selectPartnerB()
    await waitFor(() => expect(harness.expandBundleLine).toHaveBeenCalledTimes(2))
    expect(harness.expandBundleLine.mock.calls[1][0]).toEqual(expect.objectContaining({ unitPrice: '1810000' }))
    await waitFor(() => expect(unitPrice(1).value).toBe('1000000'))
    expect(unitPrice(2).value).toBe('810000')
    expect(screen.getByTestId('line-1').getAttribute('data-discount-info'))
      .toBe('거래처 싱글세트 정액DC 30000원 적용')
    expect(Number(unitPrice(1).value) + Number(unitPrice(2).value)).toBe(1810000)

    await selectPartnerA()
    await waitFor(() => expect(harness.expandBundleLine).toHaveBeenCalledTimes(3))
    expect(harness.expandBundleLine.mock.calls[2][0]).toEqual(expect.objectContaining({ unitPrice: '1840000' }))
    await waitFor(() => expect(unitPrice(2).value).toBe('840000'))
    expect(screen.getByTestId('line-1').getAttribute('data-discount-info')).toBe('')
    expect(Number(unitPrice(1).value) + Number(unitPrice(2).value)).toBe(1840000)
  })

  it('stores the bundle discount evidence on the saved slip payload', async () => {
    harness.bundle.modelCode = 'AC072CS6PBH1SY'
    harness.bundle.categoryKey = 'singleSets'
    harness.getPartnerDcConfig.mockResolvedValue({
      partnerCode: harness.partnerA.partnerCode,
      companyName: harness.partnerA.name,
      homeMultiDc: null,
      commercialMultiDc: null,
      threeSixty: '30,000',
      fourWay: null,
      oneWay: null,
      stand: null,
      deluxe: null,
      firstGrade: null,
    })
    harness.expandBundleLine.mockResolvedValueOnce([{
      productId: harness.productA.id,
      modelName: harness.productA.modelName,
      name: harness.productA.productName,
      modelCode: 'AC072CS6PBH1SY',
      quantity: 1,
      unitPrice: 970000,
      specification: null,
    }])

    renderPage()
    await selectPartnerA()
    fireEvent.click(screen.getByTestId('select-bundle-1'))
    await waitFor(() => expect(unitPrice().value).toBe('970000'))
    fireEvent.click(screen.getByTestId('select-warehouse'))
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(harness.createSlip).toHaveBeenCalledTimes(1))
    expect(harness.createSlip.mock.calls[0][0].discountInfo).toContain('거래처 싱글세트 정액DC 30000원 적용')
  })

  it('preserves a user-edited bundle component price across a partner switch', async () => {
    harness.expandBundleLine
      .mockResolvedValueOnce([
        { productId: harness.productA.id, modelName: 'Indoor', name: 'Indoor', modelCode: 'INDOOR', quantity: 1, unitPrice: 7000 },
        { productId: harness.productB.id, modelName: 'Panel', name: 'Panel', modelCode: 'PANEL', quantity: 1, unitPrice: 3000 },
      ])
      .mockResolvedValueOnce([
        { productId: harness.productA.id, modelName: 'Indoor', name: 'Indoor', modelCode: 'INDOOR', quantity: 1, unitPrice: 6500 },
        { productId: harness.productB.id, modelName: 'Panel', name: 'Panel', modelCode: 'PANEL', quantity: 1, unitPrice: 3500 },
      ])
    renderPage()
    await selectPartnerA()
    fireEvent.click(screen.getByTestId('select-bundle-1'))
    await waitFor(() => expect(unitPrice(2).value).toBe('3000'))
    fireEvent.change(unitPrice(2), { target: { value: '7777' } })

    await selectPartnerB()
    await waitFor(() => expect(harness.expandBundleLine).toHaveBeenCalledTimes(2))
    expect(unitPrice(2).value).toBe('7777')
    expect(screen.getByTestId('line-2').getAttribute('data-price-source')).toBe('USER')
  })

  it('reprices once after the first bundle component is deleted', async () => {
    harness.bundle.modelCode = 'AC072CS6PBH1SY'
    harness.getPartnerDcConfig.mockResolvedValue({
      partnerCode: harness.partnerA.partnerCode,
      companyName: harness.partnerA.name,
      homeMultiDc: null,
      commercialMultiDc: null,
      threeSixty: '30,000',
      fourWay: null,
      oneWay: null,
      stand: null,
      deluxe: null,
      firstGrade: null,
    })
    harness.expandBundleLine
      .mockResolvedValueOnce([
        { productId: harness.productA.id, modelName: 'Outdoor', name: 'Outdoor', modelCode: 'OUTDOOR', quantity: 1, unitPrice: 7000 },
        { productId: harness.productB.id, modelName: 'Indoor', name: 'Indoor', modelCode: 'AC072CS6PBH1SY', quantity: 1, unitPrice: 970000 },
      ])
      .mockResolvedValueOnce([
        { productId: harness.productB.id, modelName: 'Indoor', name: 'Indoor', modelCode: 'AC072CS6PBH1SY', quantity: 1, unitPrice: 970000 },
      ])
    renderPage()
    await selectPartnerA()
    fireEvent.click(screen.getByTestId('select-bundle-1'))
    await waitFor(() => expect(screen.getByTestId('line-2').getAttribute('data-model-code')).toBe('AC072CS6PBH1SY'))
    fireEvent.click(screen.getByTestId('delete-line-1'))

    await selectPartnerB()
    await waitFor(() => expect(harness.expandBundleLine).toHaveBeenCalledTimes(2))
    expect(unitPrice().value).toBe('970000')
    expect(harness.getPriceMemories.mock.calls.flat()[1]).not.toBe(harness.productB.id)
  })

  it('does not resurrect a deleted bundle component when partner reprice re-expands the parent', async () => {
    harness.bundle.modelCode = 'AC072CS6PBH1SY'
    harness.getPartnerDcConfig.mockResolvedValue({
      partnerCode: harness.partnerA.partnerCode,
      companyName: harness.partnerA.name,
      homeMultiDc: null,
      commercialMultiDc: null,
      threeSixty: '30,000',
      fourWay: null,
      oneWay: null,
      deluxe: null,
      firstGrade: null,
    })
    harness.expandBundleLine
      .mockResolvedValueOnce([
        { productId: harness.productA.id, modelName: 'Indoor', name: 'Indoor', modelCode: 'INDOOR', quantity: 1, unitPrice: 7000 },
        { productId: harness.productB.id, modelName: 'Outdoor', name: 'Outdoor', modelCode: 'OUTDOOR', quantity: 1, unitPrice: 3000 },
      ])
      .mockResolvedValueOnce([
        { productId: harness.productA.id, modelName: 'Indoor', name: 'Indoor', modelCode: 'INDOOR', quantity: 1, unitPrice: 6500 },
        { productId: harness.productB.id, modelName: 'Outdoor', name: 'Outdoor', modelCode: 'OUTDOOR', quantity: 1, unitPrice: 3500 },
      ])

    renderPage()
    await selectPartnerA()
    fireEvent.click(screen.getByTestId('select-bundle-1'))
    await waitFor(() => expect(screen.getByTestId('line-2').getAttribute('data-model-code')).toBe('OUTDOOR'))

    fireEvent.click(screen.getByTestId('delete-line-1'))
    await selectPartnerB()

    await waitFor(() => expect(harness.expandBundleLine).toHaveBeenCalledTimes(2))
    expect(screen.queryByTestId('line-2')).toBeTruthy()
    expect(screen.getAllByTestId(/^line-\d+$/).map((node) => node.getAttribute('data-model-code'))).not.toContain('INDOOR')
    expect(screen.getByTestId('line-1').getAttribute('data-model-code')).toBe('OUTDOOR')
    expect(unitPrice().value).toBe('3500')
  })

  it('does not render the bundle option picker after bundle expansion', async () => {
    harness.expandBundleLine.mockResolvedValueOnce([
      { productId: harness.productA.id, modelName: 'Indoor', name: 'Indoor', modelCode: 'INDOOR', quantity: 1, unitPrice: 7000 },
    ])

    renderPage()
    await selectPartnerA()
    fireEvent.click(screen.getByTestId('select-bundle-1'))

    await waitFor(() => expect(screen.getByTestId('line-1')).toBeTruthy())
    expect(screen.queryByTestId('bundle-option-change')).toBeNull()
    expect(harness.expandBundleLine.mock.calls[0][0]).not.toHaveProperty('setOptions')
  })

  it('keeps both bundle contexts through A to B to A partner switching', async () => {
    harness.expandBundleLine
      .mockResolvedValueOnce([{ productId: harness.productA.id, modelName: 'A-1', name: 'A-1', modelCode: 'A-1', quantity: 1, unitPrice: 7000 }])
      .mockResolvedValueOnce([{ productId: harness.productB.id, modelName: 'A-2', name: 'A-2', modelCode: 'A-2', quantity: 1, unitPrice: 3000 }])
      .mockResolvedValueOnce([{ productId: harness.productA.id, modelName: 'B-1', name: 'B-1', modelCode: 'B-1', quantity: 1, unitPrice: 6000 }])
      .mockResolvedValueOnce([{ productId: harness.productB.id, modelName: 'B-2', name: 'B-2', modelCode: 'B-2', quantity: 1, unitPrice: 4000 }])
      .mockResolvedValueOnce([{ productId: harness.productA.id, modelName: 'A-1-final', name: 'A-1-final', modelCode: 'A-1-final', quantity: 1, unitPrice: 7000 }])
      .mockResolvedValueOnce([{ productId: harness.productB.id, modelName: 'A-2-final', name: 'A-2-final', modelCode: 'A-2-final', quantity: 1, unitPrice: 3000 }])
    renderPage()
    await selectPartnerA()
    fireEvent.click(screen.getByTestId('select-bundle-1'))
    await waitFor(() => expect(harness.expandBundleLine).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByTestId('select-bundle-2'))
    await waitFor(() => expect(harness.expandBundleLine).toHaveBeenCalledTimes(2))

    await selectPartnerB()
    await selectPartnerA()
    await waitFor(() => expect(harness.expandBundleLine).toHaveBeenCalledTimes(6))
    expect(screen.getByTestId('line-1').getAttribute('data-model-code')).toBe('A-1-final')
    expect(screen.getByTestId('line-2').getAttribute('data-model-code')).toBe('A-2-final')
  })

  it('does not bulk-reprice expanded component lines on partner switch', async () => {
    harness.expandBundleLine.mockResolvedValueOnce([
      { productId: harness.productA.id, modelName: 'Indoor', name: 'Indoor', modelCode: 'AC072CS6PBH1SY', quantity: 1, unitPrice: 970000 },
    ])
    renderPage()
    await selectPartnerA()
    fireEvent.click(screen.getByTestId('select-bundle-1'))
    await waitFor(() => expect(unitPrice().value).toBe('970000'))
    await selectPartnerB()
    await waitFor(() => expect(harness.expandBundleLine).toHaveBeenCalledTimes(2))
    expect(harness.getPriceMemories.mock.calls.some((call) => call.includes(harness.productA.id))).toBe(false)
  })

  it('keeps the no-fixed-discount expansion result unchanged', async () => {
    harness.bundle.modelCode = 'SET-WITHOUT-FLAGS'
    harness.getPartnerDcConfig.mockResolvedValue({
      partnerCode: harness.partnerA.partnerCode,
      companyName: harness.partnerA.name,
      homeMultiDc: null,
      commercialMultiDc: null,
      threeSixty: null,
      fourWay: null,
      oneWay: null,
      stand: null,
      deluxe: null,
      firstGrade: null,
    })
    harness.expandBundleLine.mockResolvedValueOnce([{
      productId: harness.productA.id,
      modelName: 'No-DC component',
      name: 'No-DC component',
      modelCode: 'PLAIN-COMPONENT',
      quantity: 1,
      unitPrice: 10000,
    }])
    renderPage()
    await selectPartnerA()
    fireEvent.click(screen.getByTestId('select-bundle-1'))
    await waitFor(() => expect(unitPrice().value).toBe('10000'))
    expect(screen.getByTestId('line-1').getAttribute('data-discount-info')).toBe('')
  })

  it('C-1 판별: 비세트 상업멀티 품목에도 거래처 전역DC가 적용된다', async () => {
    harness.productA.categoryKey = 'commercialMulti'
    harness.productA.sellingPrice = '20680000'
    harness.getPartnerDcConfig.mockResolvedValue({
      partnerCode: harness.partnerA.partnerCode,
      companyName: harness.partnerA.name,
      homeMultiDc: '45%',
      commercialMultiDc: '46%',
    })

    renderPage()
    await selectPartnerA()
    fireEvent.click(screen.getByTestId('select-product-a-1'))

    await waitFor(() => expect(unitPrice().value).toBe('11167200'))
    expect(screen.getByTestId('line-1').getAttribute('data-discount-info'))
      .toBe('거래처 전역DC 46% 적용')
  })

  it('reprices an existing variable-DC line with the new partner global discount after a memory miss', async () => {
    harness.getPartnerDcConfig.mockImplementation(async (partnerCode: string) => ({
      partnerCode,
      companyName: partnerCode === 'P-A' ? 'Partner A' : 'Partner B',
      homeMultiDc: partnerCode === 'P-A' ? '48%' : '45%',
      commercialMultiDc: null,
    }))
    renderPage()
    await selectPartnerA()
    fireEvent.click(screen.getByTestId('select-product-a-1'))
    await waitFor(() => expect(unitPrice().value).toBe('520'))

    await selectPartnerB()
    await waitFor(() => expect(unitPrice().value).toBe('550'))
    expect(screen.getByTestId('line-1').getAttribute('data-discount-info'))
      .toBe('거래처 전역DC 45% 적용')
  })

  it('announces the resolved global discount rather than the initial catalog fallback', async () => {
    const pendingDc = deferred<{
      partnerCode: string
      companyName: string
      homeMultiDc: string
      commercialMultiDc: string
    }>()
    harness.getPartnerDcConfig.mockReturnValue(pendingDc.promise)
    renderPage()
    await selectPartnerA()
    fireEvent.click(screen.getByTestId('select-product-a-1'))

    expect(unitPrice().value).toBe('1000')
    await act(async () => {
      pendingDc.resolve({
        partnerCode: 'P-A',
        companyName: 'Partner A',
        homeMultiDc: '48%',
        commercialMultiDc: '49%',
      })
      await pendingDc.promise
    })

    await waitFor(() => expect(unitPrice().value).toBe('520'))
    expect(screen.getByTestId('line-1').getAttribute('data-discount-info'))
      .toBe('거래처 전역DC 48% 적용')
    expect(screen.getByTestId('slip-price-refresh-banner').textContent)
      .toContain('거래처 전역DC 48% 적용')
  })

  it('does not apply global DC to a non-variable-discount product with a physical fallback category', async () => {
    harness.getPartnerDcConfig.mockResolvedValue({
      partnerCode: harness.partnerA.partnerCode,
      companyName: harness.partnerA.name,
      homeMultiDc: '48%',
      commercialMultiDc: '49%',
    })
    harness.productA.hasVariableDiscount = false
    harness.productA.sellingPrice = '204000'
    renderPage()
    await selectPartnerA()
    fireEvent.click(screen.getByTestId('select-product-a-1'))

    await waitFor(() => expect(unitPrice().value).toBe('204000'))
    expect(screen.queryByText('거래처 전역DC 48% 적용')).toBeNull()
  })

  it('confirms the selected product at catalog price before a pending DC request completes', async () => {
    const pending = new Promise<null>(() => undefined)
    harness.getPartnerDcConfig.mockReturnValue(pending)
    renderPage()
    await selectPartnerA()

    fireEvent.click(screen.getByTestId('select-product-a-1'))

    await waitFor(() => expect(screen.getByTestId('product-name-1').textContent).toBe(harness.productA.productName))
    expect(unitPrice().value).toBe(harness.productA.sellingPrice)
  })

  it('uses the global discount result instead of a remembered list price', async () => {
    harness.getPartnerDcConfig.mockResolvedValue({
      partnerCode: harness.partnerA.partnerCode,
      companyName: harness.partnerA.name,
      homeMultiDc: '48%',
      commercialMultiDc: '49%',
    })
    harness.getPriceMemory.mockResolvedValueOnce({
      unitPrice: 999,
      source: 'LINE_SAVE',
      updatedAt: '2026-08-06T00:00:00',
    })

    renderPage()
    await selectPartnerA()
    fireEvent.click(screen.getByTestId('select-product-a-1'))

    await waitFor(() => expect(unitPrice().value).toBe('520'))
    expect(screen.getByTestId('line-1').getAttribute('data-price-source')).toBe('CATALOG')
  })

  it('bulk refresh failure does not overwrite a user edit made while the request is pending', async () => {
    const pending = deferred<{ hits: Array<{ productId: string; unitPrice: number; source: string; updatedAt: string }>; failedProductIds: string[] }>()
    harness.getPriceMemory.mockResolvedValueOnce({
      unitPrice: 100000,
      source: 'LINE_SAVE',
      updatedAt: '2026-07-10T09:00:00',
    })
    harness.getPriceMemories.mockReturnValueOnce(pending.promise)
    renderPage()
    await selectPartnerA()
    fireEvent.click(screen.getByTestId('select-product-a-1'))
    await waitFor(() => expect(unitPrice().value).toBe('100000'))

    await selectPartnerB()
    await waitFor(() => expect(harness.getPriceMemories).toHaveBeenCalledTimes(1))
    fireEvent.change(unitPrice(), { target: { value: '7777' } })
    await act(async () => {
      pending.reject(new Error('forbidden'))
      await pending.promise.catch(() => undefined)
    })

    expect(unitPrice().value).toBe('7777')
    expect(screen.getByTestId('line-1').getAttribute('data-price-source')).toBe('USER')
    expect(screen.queryByText(/거래처 변경으로 최근단가 재적용/)).toBeNull()
  })

  // R4-F1: REMEMBERED 자동채움 라인이 다른 품목으로 교체되면 단가·마커를 새 품목 기준으로
  // 재채움(가격기억 재조회) — 견적과 공유 헬퍼(shouldAutoFillPrice) semantics 고정.
  it('re-fills price and marker via memory re-lookup when a remembered line switches product', async () => {
    harness.getPriceMemory
      .mockResolvedValueOnce({
        unitPrice: 88000,
        source: 'LINE_SAVE',
        updatedAt: '2026-07-10T09:00:00',
      })
      .mockResolvedValueOnce(null)
    renderPage()
    await selectPartnerA()

    fireEvent.click(screen.getByTestId('select-product-a-1'))
    await waitFor(() => expect(unitPrice().value).toBe('88000'))
    expect(screen.getByTestId('line-1').getAttribute('data-price-source')).toBe('REMEMBERED')

    fireEvent.click(screen.getByTestId('select-product-b-1'))

    await waitFor(() =>
      expect(harness.getPriceMemory).toHaveBeenCalledWith(harness.partnerA.id, harness.productB.id),
    )
    await waitFor(() => expect(unitPrice().value).toBe(harness.productB.sellingPrice))
    expect(screen.getByTestId('line-1').getAttribute('data-price-source')).toBe('CATALOG')
  })

  // R4-D4(b)·D-R4-4: 거래처 해제 시 단가값은 유지하고 마커만 해제(LineRow 에 partnerSelected=false
  // 전달). priceSource state 는 REMEMBERED 로 유지해 거래처 재선택 시 재조회 대상 자격을 보존한다.
  it('keeps the remembered unit price and only releases the marker when the partner is cleared', async () => {
    harness.getPriceMemory.mockResolvedValueOnce({
      unitPrice: 100000,
      source: 'LINE_SAVE',
      updatedAt: '2026-07-10T09:00:00',
    })
    renderPage()
    await selectPartnerA()
    fireEvent.click(screen.getByTestId('select-product-a-1'))
    await waitFor(() => expect(unitPrice().value).toBe('100000'))
    expect(screen.getByTestId('line-1').getAttribute('data-partner-selected')).toBe('true')

    fireEvent.click(screen.getByTestId('clear-partner'))

    // 단가값 유지(판매가로 되돌리지 않음) + 마커 해제 신호 + 상태 보존
    await waitFor(() =>
      expect(screen.getByTestId('line-1').getAttribute('data-partner-selected')).toBe('false'),
    )
    expect(unitPrice().value).toBe('100000')
    expect(screen.getByTestId('line-1').getAttribute('data-price-source')).toBe('REMEMBERED')

    // 거래처 재선택 시 자동 라인 재조회 자격 보존 — 새 거래처 기준 bulk 재조회 + miss 시 판매가 격리
    await selectPartnerB()
    await waitFor(() =>
      expect(harness.getPriceMemories).toHaveBeenCalledWith(harness.partnerB.id, [harness.productA.id]),
    )
    await waitFor(() => expect(unitPrice().value).toBe(harness.productA.sellingPrice))
    expect(screen.getByTestId('line-1').getAttribute('data-price-source')).toBe('CATALOG')
  })

  // R4-D9: 배너 live region 은 빈 컨테이너로 상시 마운트되고 텍스트만 토글 — 내용과 함께
  // 조건부 마운트하면 일부 SR 이 낭독하지 않는다. 동일 DOM 노드 유지(재마운트 아님)까지 고정.
  it('keeps the price refresh banner live region mounted before and after activation', async () => {
    harness.getPriceMemories.mockResolvedValueOnce({ hits: [{
      productId: harness.productA.id,
      unitPrice: 200000,
      source: 'LINE_SAVE',
      updatedAt: '2026-07-11T09:00:00',
    }], failedProductIds: [] })
    renderPage()

    const banner = screen.getByTestId('slip-price-refresh-banner')
    expect(banner.getAttribute('role')).toBe('status')
    expect(banner.getAttribute('aria-live')).toBe('polite')
    expect(banner.textContent).toBe('')

    await selectPartnerA()
    fireEvent.click(screen.getByTestId('select-product-a-1'))
    await waitFor(() => expect(unitPrice().value).toBe(harness.productA.sellingPrice))
    await selectPartnerB()
    await waitFor(() => expect(unitPrice().value).toBe('200000'))

    expect(screen.getByTestId('slip-price-refresh-banner')).toBe(banner)
    expect(banner.textContent).toContain('거래처 변경으로 최근단가 재적용')
  })

  // R4-F4: 거래처 변경 최근단가 재조회 in-flight 동안 저장 차단 + busy 단서 —
  // 이전 거래처 단가가 새 partnerId 로 저장돼 가격기억이 교차 오염되는 것을 방지.
  it('blocks submit and shows a busy note while the partner price refresh is in flight', async () => {
    const pending = deferred<{ hits: Array<{ productId: string; unitPrice: number; source: string; updatedAt: string }>; failedProductIds: string[] }>()
    harness.getPriceMemories.mockReturnValueOnce(pending.promise)
    renderPage()
    await selectPartnerA()
    fireEvent.click(screen.getByTestId('select-warehouse'))
    fireEvent.click(screen.getByTestId('select-product-a-1'))
    await waitFor(() => expect(unitPrice().value).toBe(harness.productA.sellingPrice))
    await waitFor(() =>
      expect((screen.getByRole('button', { name: '저장' }) as HTMLButtonElement).disabled).toBe(false),
    )

    // R4-D9 계열 sweep: busy live region 도 배너와 동일하게 활성 전부터 빈 컨테이너로
    // 선존재해야 SR 낭독이 신뢰된다(조건부 마운트 금지).
    const busyNote = screen.getByTestId('slip-form-price-refresh-busy')
    expect(busyNote.getAttribute('role')).toBe('status')
    expect(busyNote.getAttribute('aria-live')).toBe('polite')
    expect(busyNote.textContent).toBe('')

    await selectPartnerB()
    await waitFor(() => expect(harness.getPriceMemories).toHaveBeenCalledTimes(1))

    // 동일 DOM 노드 유지(재마운트 아님) + 텍스트만 토글.
    expect(screen.getByTestId('slip-form-price-refresh-busy')).toBe(busyNote)
    expect(busyNote.textContent).toContain('최근단가 확인 중')
    const saveButton = screen.getByRole('button', { name: '저장' }) as HTMLButtonElement
    expect(saveButton.disabled).toBe(true)
    fireEvent.click(saveButton)
    expect(harness.createSlip).not.toHaveBeenCalled()

    await act(async () => {
      pending.resolve({ hits: [{
        productId: harness.productA.id,
        unitPrice: 222000,
        source: 'LINE_SAVE',
        updatedAt: '2026-07-11T09:00:00',
      }], failedProductIds: [] })
      await pending.promise
    })

    await waitFor(() => expect(unitPrice().value).toBe('222000'))
    // 완료 후에도 live region 은 상시 마운트 유지 — 텍스트만 소거된다.
    expect(screen.getByTestId('slip-form-price-refresh-busy')).toBe(busyNote)
    expect(busyNote.textContent).toBe('')
    expect((screen.getByRole('button', { name: '저장' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('SlipFormPage_submit_sendsVatInclusivePriceExactly', async () => {
    renderPage()
    await selectPartnerA()
    fireEvent.click(screen.getByTestId('select-warehouse'))
    fireEvent.click(screen.getByTestId('select-product-a-1'))
    await waitFor(() => expect(unitPrice().value).toBe(harness.productA.sellingPrice))
    fireEvent.change(unitPrice(), { target: { value: '100000' } })

    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(harness.createSlip).toHaveBeenCalledTimes(1))
    expect(harness.createSlip).toHaveBeenCalledWith(expect.objectContaining({
      partnerId: harness.partnerA.id,
      lines: [expect.objectContaining({
        productId: harness.productA.id,
        unitPrice: '100000',
        priceVatInclusive: true,
      })],
    }))
  })

  it('allows DRAFT save without a partner', async () => {
    renderPage()
    fireEvent.click(screen.getByTestId('select-warehouse'))
    fireEvent.click(screen.getByTestId('select-product-a-1'))
    await waitFor(() => expect(screen.getByTestId('product-name-1').textContent).toBe(harness.productA.productName))

    fireEvent.click(screen.getByRole('button', { name: /저장/ }))

    await waitFor(() => expect(harness.createSlip).toHaveBeenCalledTimes(1))
    expect(harness.createSlip).toHaveBeenCalledWith(expect.objectContaining({ partnerId: undefined }))
  })

  it('KEEP BUNDLE 부모는 저장 payload에 자기 계보를 부여하지 않는다', async () => {
    harness.expandBundleLine.mockResolvedValueOnce([{
      productId: harness.bundle.id,
      modelName: harness.bundle.modelName,
      name: harness.bundle.productName,
      modelCode: harness.bundle.modelCode,
      quantity: 1,
      unitPrice: 10000,
      specification: null,
      componentKind: null,
      setHead: false,
    }])
    renderPage()
    fireEvent.click(screen.getByTestId('select-bundle-1'))
    await waitFor(() => expect(screen.getByTestId('product-name-1').textContent).toBe(harness.bundle.productName))
    fireEvent.click(screen.getByTestId('select-warehouse'))
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(harness.createSlip).toHaveBeenCalledTimes(1))

    const savedLine = harness.createSlip.mock.calls[0][0].lines[0]
    expect(savedLine.productId).toBe(harness.bundle.id)
    expect(savedLine.parentSetModel).toBeUndefined()
    expect(savedLine.setHead).toBeUndefined()
    expect(savedLine.bundleParentProductId).toBeUndefined()
  })

  it('R30 계측: partner 전환 중 bundle expand 요청·응답·최종 행 순서를 기록한다', async () => {
    harness.bundle.modelCode = 'AC060CS6PBH1SY'
    harness.bundle.categoryKey = 'singleSets'
    ;(harness.bundle as any).deliveryPrice = '1660000'
    harness.getPartnerDcConfig.mockImplementation(async (partnerCode: string) => ({
      partnerCode,
      companyName: partnerCode === 'P-A' ? 'Partner A' : 'Partner B',
      homeMultiDc: null,
      commercialMultiDc: null,
      threeSixty: '₩70,000',
      fourWay: null,
      oneWay: null,
      stand: null,
      deluxe: null,
      firstGrade: null,
    }))

    const first = deferred<any[]>()
    const second = deferred<any[]>()
    const trace: string[] = []
    harness.expandBundleLine.mockImplementation((request: { unitPrice: string }) => {
      const requestNo = harness.expandBundleLine.mock.calls.length
      trace.push(`request#${requestNo}:unitPrice=${request.unitPrice}`)
      return requestNo === 1 ? first.promise : second.promise
    })

    renderPage()
    await selectPartnerA()
    fireEvent.click(screen.getByTestId('select-bundle-1'))
    await waitFor(() => expect(harness.expandBundleLine).toHaveBeenCalledTimes(1))

    await selectPartnerB()
    await waitFor(() => expect(harness.expandBundleLine).toHaveBeenCalledTimes(2))
    trace.push('response#2:componentSum=1590000')
    second.resolve([
      { productId: harness.productA.id, modelName: 'Indoor', name: 'Indoor', modelCode: 'INDOOR', quantity: 1, unitPrice: 954000 },
      { productId: harness.productB.id, modelName: 'Outdoor', name: 'Outdoor', modelCode: 'OUTDOOR', quantity: 1, unitPrice: 636000 },
    ])
    await waitFor(() => expect(unitPrice(1).value).toBe('954000'))
    trace.push(`setLines:unitPrice=${unitPrice(1).value};sum=${Number(unitPrice(1).value) + Number(unitPrice(2).value)}`)

    trace.push('response#1:componentSum=1660000')
    first.resolve([
      { productId: harness.productA.id, modelName: 'Indoor', name: 'Indoor', modelCode: 'INDOOR', quantity: 1, unitPrice: 996000 },
      { productId: harness.productB.id, modelName: 'Outdoor', name: 'Outdoor', modelCode: 'OUTDOOR', quantity: 1, unitPrice: 664000 },
    ])
    await act(async () => {
      await first.promise
    })
    await waitFor(() => expect(unitPrice(1).value).toBe('954000'))
    trace.push(`final:unitPrice=${unitPrice(1).value};sum=${Number(unitPrice(1).value) + Number(unitPrice(2).value)}`)
    fireEvent.click(screen.getByTestId('select-warehouse'))
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(harness.createSlip).toHaveBeenCalledTimes(1))
    const savedLines = harness.createSlip.mock.calls[0][0].lines
    trace.push(`save:sum=${savedLines.reduce((sum: number, line: { unitPrice: string; quantity: number }) => sum + Number(line.unitPrice) * line.quantity, 0)}`)
    expect(savedLines.reduce((sum: number, line: { unitPrice: string; quantity: number }) => sum + Number(line.unitPrice) * line.quantity, 0))
      .toBe(1590000)
    console.log(`[R30-TRACE] ${trace.join(' | ')}`)
  })
})

describe('SlipFormPage outbound date contract', () => {
  it('keeps today as the minimum outbound date for every active cutoff tag', () => {
    renderPage()

    const selector = screen.getByTestId('delivery-tag-selector')
    const outboundDate = screen.getByTestId('slip-form-outbound-date') as HTMLInputElement
    const today = outboundDate.value

    for (const tag of ['DAY', 'LOGEN', 'REGION', 'STACK', 'GYEONGDONG_PARCEL', 'GYEONGDONG_FREIGHT']) {
      fireEvent.change(selector, { target: { value: tag } })
      expect(outboundDate.min).toBe(today)
      expect(outboundDate.disabled).toBe(false)
    }
  })

  it('allows next-day outbound creation and recalculates REGION unload date from M', async () => {
    renderPage()

    fireEvent.change(screen.getByTestId('delivery-tag-selector'), { target: { value: 'REGION' } })

    const outboundDate = screen.getByTestId('slip-form-outbound-date') as HTMLInputElement
    const today = outboundDate.value
    const addDays = (date: string, days: number) => {
      const [year, month, day] = date.split('-').map(Number)
      const result = new Date(Date.UTC(year, month - 1, day + days))
      return result.toISOString().slice(0, 10)
    }
    const nextDayValue = addDays(today, 1)
    const nextUnloadValue = addDays(nextDayValue, 1)

    expect(outboundDate.disabled).toBe(false)
    expect(outboundDate.min).toBe(today)
    fireEvent.change(outboundDate, { target: { value: nextDayValue } })

    await waitFor(() => expect((screen.getByTestId('slip-form-unload-date') as HTMLInputElement).value)
      .toBe(nextUnloadValue))

    fireEvent.click(screen.getByTestId('select-product-a-1'))
    fireEvent.click(screen.getByTestId('select-warehouse'))
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(harness.createSlip).toHaveBeenCalledTimes(1))
    expect(harness.createSlip).toHaveBeenCalledWith(expect.objectContaining({
      slipDate: nextDayValue,
      unloadDate: nextUnloadValue,
    }))
  })

  it('preserves a user-edited N when M changes and exposes an M/N validation error', async () => {
    renderPage()

    fireEvent.change(screen.getByTestId('delivery-tag-selector'), { target: { value: 'REGION' } })
    const outboundDate = screen.getByTestId('slip-form-outbound-date') as HTMLInputElement
    const unloadDate = screen.getByTestId('slip-form-unload-date') as HTMLInputElement
    fireEvent.change(unloadDate, { target: { value: '2026-08-14' } })

    fireEvent.change(outboundDate, { target: { value: '2026-08-09' } })

    expect(unloadDate.value).toBe('2026-08-14')
    expect(screen.getByTestId('slip-form-unload-date-error').textContent)
      .toContain('출고일(M)과 하차일(N)을 확인')
  })
})

describe('SlipFormPage 이카운트식 라인 입력 — 제거된 세트 옵션 picker 레거시 테스트', () => {
  it('RED-B: 옵션 미입력 기본 전개는 서버 응답 4행을 그대로 표시한다', async () => {
    harness.expandBundleLine.mockResolvedValueOnce([
      { productId: 'default-indoor', modelCode: 'DEFAULT-IN', modelName: 'DEFAULT-IN', name: '기본 실내기', quantity: 1, unitPrice: 1000, componentKind: 'INDOOR', setHead: true },
      { productId: 'default-outdoor', modelCode: 'DEFAULT-OUT', modelName: 'DEFAULT-OUT', name: '기본 실외기', quantity: 1, unitPrice: 2000, componentKind: 'OUTDOOR', setHead: false },
      { productId: 'default-panel', modelCode: 'DEFAULT-PANEL', modelName: 'DEFAULT-PANEL', name: '기본 판넬', quantity: 1, unitPrice: 3000, componentKind: 'PANEL', setHead: false },
      { productId: 'default-remote', modelCode: 'DEFAULT-REMOTE', modelName: 'DEFAULT-REMOTE', name: '기본 리모컨', quantity: 1, unitPrice: 4000, componentKind: 'REMOTE', setHead: false },
    ])
    renderPage()

    fireEvent.click(screen.getByTestId('select-bundle-1'))
    await waitFor(() => expect(harness.expandBundleLine).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByTestId('line-4').getAttribute('data-model-code')).toBe('DEFAULT-REMOTE'))
    expect(screen.getByTestId('line-1').getAttribute('data-model-code')).toBe('DEFAULT-IN')
    expect(screen.queryByTestId('line-5')?.getAttribute('data-product-id')).toBe('')
  })

  it('거래처 최근단가 대기 중 바꾼 최신 수량으로 세트를 전개한다', async () => {
    const pricePending = deferred<{ unitPrice: number; source: string; updatedAt: string } | null>()
    harness.getPriceMemory.mockReturnValueOnce(pricePending.promise)
    harness.expandBundleLine.mockResolvedValueOnce([{
      productId: harness.productA.id,
      modelName: harness.productA.modelName,
      name: harness.productA.productName,
      quantity: 1,
      unitPrice: 1000,
      specification: null,
    }])
    renderPage()
    await selectPartnerA()

    fireEvent.click(screen.getByTestId('select-bundle-1'))
    await waitFor(() => expect(harness.getPriceMemory).toHaveBeenCalledWith(
      harness.partnerA.id,
      harness.bundle.id,
    ))
    fireEvent.change(screen.getByLabelText('line-1-quantity'), { target: { value: '3' } })

    await act(async () => {
      pricePending.resolve({ unitPrice: 9000, source: 'LINE_SAVE', updatedAt: '2026-08-05T09:00:00' })
      await pricePending.promise
    })

    await waitFor(() => expect(harness.expandBundleLine).toHaveBeenCalledWith(expect.objectContaining({
      quantity: 3,
    })))
    expect(harness.expandBundleLine).toHaveBeenCalledTimes(1)
  })

  it('거래처 최근단가 대기 중 직접 입력한 단가로 세트를 한 번 전개한다', async () => {
    const pricePending = deferred<{ unitPrice: number; source: string; updatedAt: string } | null>()
    harness.getPriceMemory.mockReturnValueOnce(pricePending.promise)
    harness.expandBundleLine.mockResolvedValueOnce([{
      productId: harness.productA.id,
      modelName: harness.productA.modelName,
      name: harness.productA.productName,
      quantity: 1,
      unitPrice: 7777,
      specification: null,
    }])
    renderPage()
    await selectPartnerA()

    fireEvent.click(screen.getByTestId('select-bundle-1'))
    await waitFor(() => expect(harness.getPriceMemory).toHaveBeenCalledWith(
      harness.partnerA.id,
      harness.bundle.id,
    ))
    fireEvent.change(unitPrice(), { target: { value: '7777' } })

    await act(async () => {
      pricePending.resolve({ unitPrice: 9000, source: 'LINE_SAVE', updatedAt: '2026-08-05T09:00:00' })
      await pricePending.promise
    })

    await waitFor(() => expect(harness.expandBundleLine).toHaveBeenCalledWith(expect.objectContaining({
      unitPrice: '7777',
    })))
    expect(harness.expandBundleLine).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('line-1')?.getAttribute('data-product-id')).not.toBe(harness.bundle.id)
  })

  it('거래처 최근단가 대기 중 지운 부모 규격을 구성품에 되살리지 않는다', async () => {
    const pricePending = deferred<{ unitPrice: number; source: string; updatedAt: string } | null>()
    harness.getPriceMemory.mockReturnValueOnce(pricePending.promise)
    harness.expandBundleLine.mockResolvedValueOnce([{
      productId: harness.productA.id,
      modelName: harness.productA.modelName,
      name: harness.productA.productName,
      quantity: 1,
      unitPrice: 1000,
      specification: null,
    }])
    renderPage()
    await selectPartnerA()

    fireEvent.change(screen.getByLabelText('line-1-specification'), { target: { value: '현장규격' } })
    fireEvent.click(screen.getByTestId('select-bundle-1'))
    await waitFor(() => expect(harness.getPriceMemory).toHaveBeenCalledWith(
      harness.partnerA.id,
      harness.bundle.id,
    ))
    fireEvent.change(screen.getByLabelText('line-1-specification'), { target: { value: '' } })

    await act(async () => {
      pricePending.resolve({ unitPrice: 9000, source: 'LINE_SAVE', updatedAt: '2026-08-05T09:00:00' })
      await pricePending.promise
    })

    await waitFor(() => expect(harness.expandBundleLine).toHaveBeenCalledWith(expect.objectContaining({
      specification: undefined,
    })))
    await waitFor(() => expect((screen.getByLabelText('line-1-specification') as HTMLInputElement).value).toBe(''))
    expect(harness.expandBundleLine).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('line-1')?.getAttribute('data-product-id')).not.toBe(harness.bundle.id)
  })

  it('EXPAND 세트 선택은 구성품 계보와 옵션 문맥을 저장 payload에도 보낸다', async () => {
    harness.expandBundleLine.mockResolvedValueOnce([
      {
        productId: harness.productA.id,
        modelName: harness.productA.modelName,
        name: harness.productA.productName,
        modelCode: harness.productA.modelCode,
        quantity: 2,
        unitPrice: 6000,
        specification: '구성품 규격',
        componentKind: 'INDOOR',
        setHead: true,
      },
      {
        productId: harness.productB.id,
        modelName: harness.productB.modelName,
        name: harness.productB.productName,
        modelCode: harness.productB.modelCode,
        quantity: 1,
        unitPrice: 4000,
        specification: null,
        componentKind: 'OUTDOOR',
        setHead: false,
      },
    ])
    renderPage()

    fireEvent.click(screen.getByTestId('select-bundle-1'))

    await waitFor(() => expect(harness.expandBundleLine).toHaveBeenCalledWith(expect.objectContaining({
      parentModelCode: 'SET-1',
      quantity: 1,
      unitPrice: '10000',
    })))
    await waitFor(() => expect(screen.getByTestId('product-name-1').textContent).toBe('Product A'))
    expect(screen.getByTestId('product-name-2').textContent).toBe('Product B')
    expect(screen.queryByTestId('line-3')?.getAttribute('data-product-id')).not.toBe(harness.bundle.id)
    expect(screen.queryByTestId('product-name-3')?.textContent).not.toBe('세트 1')

    fireEvent.click(screen.getByTestId('select-warehouse'))
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(harness.createSlip).toHaveBeenCalledTimes(1))
    const savedLines = harness.createSlip.mock.calls[0][0].lines
    expect(savedLines).toHaveLength(2)
    expect(savedLines.every((saved: { productId: string }) => saved.productId !== harness.bundle.id)).toBe(true)
    expect(savedLines[0]).toEqual(expect.objectContaining({
      setHead: true,
      parentSetModel: 'SET-1',
      bundleParentProductId: harness.bundle.id,
      setOptions: expect.anything(),
    }))
    expect(savedLines[1]).toEqual(expect.objectContaining({
      setHead: false,
      parentSetModel: 'SET-1',
      bundleParentProductId: harness.bundle.id,
    }))
  })

  it('구성품 전개 실패도 세트 라인을 저장하지 않고 사용자에게 오류를 보인다', async () => {
    harness.expandBundleLine.mockRejectedValueOnce(new Error('구성품 조회 실패'))
    renderPage()

    fireEvent.click(screen.getByTestId('select-bundle-1'))

    await waitFor(() => expect(screen.getByText('세트 구성품을 불러오지 못했습니다. 다시 선택해 주세요.')).toBeTruthy())
    expect(screen.queryByTestId('line-1')?.getAttribute('data-product-id')).not.toBe(harness.bundle.id)
    expect(screen.getByRole('button', { name: '저장' })).toHaveProperty('disabled', true)
  })

  it('전개 실패 중 수량이 바뀌면 실패한 세대를 버리고 최신 수량으로 다시 전개한다', async () => {
    const first = deferred<any[]>()
    harness.expandBundleLine.mockReturnValueOnce(first.promise)
    harness.expandBundleLine.mockResolvedValueOnce([{
      productId: harness.productA.id,
      modelName: harness.productA.modelName,
      name: harness.productA.productName,
      quantity: 3,
      unitPrice: 2000,
      specification: null,
    }])
    renderPage()

    fireEvent.click(screen.getByTestId('select-bundle-1'))
    await waitFor(() => expect(harness.expandBundleLine).toHaveBeenCalledWith(expect.objectContaining({
      quantity: 1,
    })))
    fireEvent.change(screen.getByLabelText('line-1-quantity'), { target: { value: '3' } })

    await act(async () => {
      first.reject(new Error('첫 전개 실패'))
      await first.promise.catch(() => undefined)
    })

    await waitFor(() => expect(harness.expandBundleLine).toHaveBeenCalledWith(expect.objectContaining({
      quantity: 3,
    })))
    expect(harness.expandBundleLine).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(screen.queryByTestId('line-1')?.getAttribute('data-product-id'))
      .not.toBe(harness.bundle.id))
  })

  it.each([
    ['단가', 'line-1-unit-price', { unitPrice: '7777' }, { unitPrice: '7777' }],
    ['규격', 'line-1-specification', { specification: '현장규격' }, { specification: '현장규격' }],
  ])('전개 실패 중 %s가 바뀌면 최신 스냅샷으로 다시 전개한다', async (_field, label, change, expected) => {
    const first = deferred<any[]>()
    harness.expandBundleLine.mockReturnValueOnce(first.promise)
    harness.expandBundleLine.mockResolvedValueOnce([])
    renderPage()

    fireEvent.click(screen.getByTestId('select-bundle-1'))
    await waitFor(() => expect(harness.expandBundleLine).toHaveBeenCalledTimes(1))
    fireEvent.change(screen.getByLabelText(label), { target: { value: Object.values(change)[0] } })

    await act(async () => {
      first.reject(new Error('첫 전개 실패'))
      await first.promise.catch(() => undefined)
    })

    await waitFor(() => expect(harness.expandBundleLine).toHaveBeenCalledWith(expect.objectContaining(expected)))
    expect(harness.expandBundleLine).toHaveBeenCalledTimes(2)
  })

  it('늦게 도착한 세트 전개 응답은 이후 일반 품목 선택을 덮지 않는다', async () => {
    const pending = deferred<any[]>()
    harness.expandBundleLine.mockReturnValueOnce(pending.promise)
    harness.expandBundleLine.mockResolvedValue([{
      productId: harness.productA.id,
      modelName: harness.productA.modelName,
      name: harness.productA.productName,
      quantity: 3,
      unitPrice: 2000,
      specification: null,
    }])
    renderPage()

    fireEvent.click(screen.getByTestId('select-bundle-1'))
    fireEvent.click(screen.getByTestId('select-product-a-1'))
    expect(screen.getByTestId('product-name-1').textContent).toBe(harness.productA.productName)

    await act(async () => {
      pending.resolve([{
        productId: harness.productB.id,
        modelName: harness.productB.modelName,
        name: harness.productB.productName,
        quantity: 1,
        unitPrice: 2000,
        specification: null,
      }])
    })

    await waitFor(() => expect(screen.getByTestId('product-name-1').textContent)
      .toBe(harness.productA.productName))
  })

  it('늦은 세트 전개 응답은 그 사이 사용자가 입력한 최신 수량을 보존한다', async () => {
    const pending = deferred<any[]>()
    harness.expandBundleLine.mockReturnValueOnce(pending.promise)
    harness.expandBundleLine.mockResolvedValue([{
      productId: harness.productA.id,
      modelName: harness.productA.modelName,
      name: harness.productA.productName,
      quantity: 3,
      unitPrice: 2000,
      specification: null,
    }])
    renderPage()

    fireEvent.click(screen.getByTestId('select-bundle-1'))
    fireEvent.change(screen.getByLabelText('line-1-quantity'), { target: { value: '3' } })
    await act(async () => {
      pending.resolve([{
        productId: harness.productA.id,
        modelName: harness.productA.modelName,
        name: harness.productA.productName,
        quantity: 3,
        unitPrice: 2000,
        specification: null,
      }])
    })

    await waitFor(() => expect((screen.getByLabelText('line-1-quantity') as HTMLInputElement).value)
      .toBe('3'))
  })

  it('전개 응답 대기 중 지운 부모 규격을 재전개 응답도 되살리지 않는다', async () => {
    const pending = deferred<any[]>()
    harness.expandBundleLine.mockReturnValueOnce(pending.promise)
    harness.expandBundleLine.mockResolvedValue([{
      productId: harness.productA.id,
      modelName: harness.productA.modelName,
      name: harness.productA.productName,
      quantity: 1,
      unitPrice: 2000,
      specification: null,
    }])
    renderPage()

    fireEvent.change(screen.getByLabelText('line-1-specification'), { target: { value: '현장규격' } })
    fireEvent.click(screen.getByTestId('select-bundle-1'))
    await waitFor(() => expect(harness.expandBundleLine).toHaveBeenCalledTimes(1))
    fireEvent.change(screen.getByLabelText('line-1-specification'), { target: { value: '' } })

    await act(async () => {
      pending.resolve([{
        productId: harness.productA.id,
        modelName: harness.productA.modelName,
        name: harness.productA.productName,
        quantity: 1,
        unitPrice: 2000,
        specification: null,
      }])
      await pending.promise
    })

    await waitFor(() => expect(harness.expandBundleLine).toHaveBeenCalledWith(expect.objectContaining({
      specification: undefined,
    })));
    await waitFor(() => expect((screen.getByLabelText('line-1-specification') as HTMLInputElement).value).toBe(''))
    expect(harness.expandBundleLine).toHaveBeenCalledTimes(2)
    expect(screen.queryByTestId('line-1')?.getAttribute('data-product-id')).not.toBe(harness.bundle.id)
  })

  it('초기에는 입력 가능한 빈 행 5개를 보여준다', () => {
    renderPage()

    expect(screen.getByTestId('line-1')).toBeTruthy()
    expect(screen.getByTestId('line-5')).toBeTruthy()
    expect(screen.queryByTestId('line-6')).toBeNull()
  })

  it('마지막 행의 셀에 입력하면 아래에 한 행만 증식하고 재입력은 중복 증식하지 않는다', () => {
    renderPage()
    const lastQuantity = screen.getByLabelText('line-5-quantity') as HTMLInputElement

    fireEvent.change(lastQuantity, { target: { value: '2' } })
    expect(screen.getByTestId('line-6')).toBeTruthy()
    expect(screen.queryByTestId('line-7')).toBeNull()

    fireEvent.change(lastQuantity, { target: { value: '3' } })
    fireEvent.change(lastQuantity, { target: { value: '' } })
    fireEvent.change(lastQuantity, { target: { value: '4' } })

    expect(screen.getByTestId('line-6')).toBeTruthy()
    expect(screen.queryByTestId('line-7')).toBeNull()
  })

  it('중간 행 입력은 증식하지 않고 새 마지막 행에 입력하면 다시 한 행만 증식한다', () => {
    renderPage()

    fireEvent.change(screen.getByLabelText('line-2-quantity'), { target: { value: '2' } })
    expect(screen.queryByTestId('line-6')).toBeNull()

    fireEvent.change(screen.getByLabelText('line-5-specification'), { target: { value: '220V' } })
    expect(screen.getByTestId('line-6')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('line-6-unit-price'), { target: { value: '5000' } })
    expect(screen.getByTestId('line-7')).toBeTruthy()
    expect(screen.queryByTestId('line-8')).toBeNull()
  })

  it('빈 행 5개는 저장 payload와 합계 건수·금액, 저장 가능 여부를 바꾸지 않는다', async () => {
    renderPage()
    await selectPartnerA()
    fireEvent.click(screen.getByTestId('select-warehouse'))
    fireEvent.click(screen.getByTestId('select-product-a-1'))

    await waitFor(() => expect(unitPrice().value).toBe(harness.productA.sellingPrice))
    expect(screen.getByText('1건')).toBeTruthy()
    expect(screen.getByText('₩1,000')).toBeTruthy()
    expect((screen.getByRole('button', { name: '저장' }) as HTMLButtonElement).disabled).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(harness.createSlip).toHaveBeenCalledTimes(1))
    expect(harness.createSlip.mock.calls[0][0].lines).toHaveLength(1)
    expect(harness.createSlip.mock.calls[0][0].lines[0]).toEqual(expect.objectContaining({
      productId: harness.productA.id,
      quantity: 1,
    }))
  })

  it('입력했지만 품목 또는 수량이 빠진 행은 저장 전에 중립적인 제외 안내를 보여주고 빈 행에는 보여주지 않는다', () => {
    renderPage()

    fireEvent.change(screen.getByLabelText('line-1-quantity'), { target: { value: '2' } })

    expect(screen.getByTestId('line-1-incomplete-notice').textContent).toContain('저장에서 제외')
    expect(screen.queryByTestId('line-2-incomplete-notice')).toBeNull()
    expect(screen.getByTestId('line-1-incomplete-notice').getAttribute('role')).toBe('note')
  })

  it('품목을 선택했지만 수량을 0으로 둔 행도 저장 전에 제외 안내를 보여준다', async () => {
    renderPage()
    fireEvent.click(screen.getByTestId('select-product-a-1'))
    await waitFor(() => expect(screen.getByTestId('product-name-1').textContent).toBe(harness.productA.productName))
    fireEvent.change(screen.getByLabelText('line-1-quantity'), { target: { value: '0' } })

    expect(screen.getByTestId('line-1-incomplete-notice').textContent).toContain('저장에서 제외')
  })

  it('선택된 품목을 다시 타이핑하면 품목코드 확정을 해제한다', async () => {
    renderPage()
    fireEvent.click(screen.getByTestId('select-product-a-1'))
    await waitFor(() => expect(screen.getByTestId('line-1').getAttribute('data-product-id')).toBe(harness.productA.id))

    fireEvent.click(screen.getByTestId('type-product-1'))

    expect(screen.getByTestId('line-1').getAttribute('data-product-id')).toBe('')
    expect(screen.getByTestId('line-1').getAttribute('data-excluded-from-save')).toBe('true')
  })

  it('자동 증식 사실을 낭독하고 현재 입력 포커스를 끊지 않는다', () => {
    renderPage()
    const lastQuantity = screen.getByLabelText('line-5-quantity') as HTMLInputElement
    lastQuantity.focus()

    fireEvent.change(lastQuantity, { target: { value: '2' } })

    expect(screen.getByTestId('slip-form-line-expansion-announcement').textContent).toContain('입력 행 1개가 추가')
    expect(document.activeElement).toBe(lastQuantity)
    expect(screen.getByLabelText('line-6-quantity')).toBeTruthy()
  })
})

// ────────────────────────────────────────────────────────────────────────────
// #902 R2 8건 결함 리뷰(OPUS+SOL 적대검증) — 근본원인: 안내·증식 판정이 "행에 내용이
// 있는가"가 아니라 "onChange 가 한 번 발화했는가"(touchedLineIds 이력)에 걸려 있었다.
// 아래는 그 8건 각각의 재현 + 회귀 가드다.
// ────────────────────────────────────────────────────────────────────────────
describe('SlipFormPage 라인 입력 안내/증식 — #902 R2 결함 회귀 가드', () => {
  // D1: 입력을 되돌리면(원복) 안내가 사라진다(H1) — touchedLineIds 이력이면 행 삭제 전까지 안 사라진다.
  it('D1·H1: 규격을 입력했다 원복하면 제외 안내가 사라진다', () => {
    renderPage()
    const spec = screen.getByLabelText('line-1-specification')

    fireEvent.change(spec, { target: { value: 'x' } })
    expect(screen.getByTestId('line-1-incomplete-notice')).toBeTruthy()

    fireEvent.change(spec, { target: { value: '' } })
    expect(screen.queryByTestId('line-1-incomplete-notice')).toBeNull()
  })

  // D2: 단가 셀은 빈 값도 '0'으로 표시하므로(LineRow priceDisplay 폴백), 화면상 아무 변화도
  // 없는 Backspace 1회(0→'')가 마지막 행에서 안내·증식을 유발하면 안 된다(H2).
  it('D2·H2: 마지막 행 단가를 0에서 빈 문자열로 지워도(화면은 그대로 0) 안내·증식이 없다', () => {
    renderPage()

    fireEvent.change(unitPrice(5), { target: { value: '' } })

    expect(screen.queryByTestId('line-6')).toBeNull()
    expect(screen.queryByTestId('line-5-incomplete-notice')).toBeNull()
    expect(screen.getByTestId('slip-form-line-expansion-announcement').textContent).toBe('')
  })

  // D3·H3: 저장 전에, 몇 행이 제외되는지 한 곳(스크롤 없이)에서 알 수 있어야 한다.
  it('D3·H3: 여러 행이 미완성이면 저장 전 요약 안내가 제외 행 수를 보여준다', () => {
    renderPage()

    fireEvent.change(screen.getByLabelText('line-2-quantity'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('line-3-specification'), { target: { value: '220V' } })

    const summary = screen.getByTestId('slip-form-incomplete-summary')
    expect(summary.getAttribute('data-incomplete-count')).toBe('2')
    expect(summary.getAttribute('role')).toBe('status')
    expect(summary.textContent).toContain('2')
  })

  it('D3·H3: 미완성 행이 없으면 요약 안내가 비어 있다', () => {
    renderPage()
    const summary = screen.getByTestId('slip-form-incomplete-summary')
    expect(summary.getAttribute('data-incomplete-count')).toBe('0')
    expect(summary.textContent).toBe('')
  })

  // D4·H4: 문구가 실제로 해야 할 일을 말한다 — 품목 미선택과 수량 0 은 서로 다른 조건이다.
  it('D4·H4: 품목 미선택 행은 "품목을 선택"을, 수량 0 행은 "수량"을 말한다', async () => {
    renderPage()

    fireEvent.change(screen.getByLabelText('line-1-quantity'), { target: { value: '2' } })
    const noProductNotice = screen.getByTestId('line-1-incomplete-notice').textContent ?? ''
    expect(noProductNotice).toContain('품목을 선택')
    expect(noProductNotice).not.toContain('수량을')

    fireEvent.click(screen.getByTestId('select-product-a-1'))
    await waitFor(() => expect(screen.getByTestId('product-name-1').textContent).toBe(harness.productA.productName))
    fireEvent.change(screen.getByLabelText('line-1-quantity'), { target: { value: '0' } })

    const zeroQtyNotice = screen.getByTestId('line-1-incomplete-notice').textContent ?? ''
    expect(zeroQtyNotice).toContain('수량')
    expect(zeroQtyNotice).not.toContain('품목을 선택')
  })

  // D6·H5: 마지막 행에서 증식이 반복되면(같은 라인 번호라도) 안내 문구가 매번 달라져 재낭독된다.
  // 동일 문자열이면 React 가 재렌더를 bail-out 해 스크린리더가 재낭독하지 않는다.
  it('D6·H5: 같은 마지막 행에서 반복 증식되면 안내 문구가 매번 달라진다', () => {
    renderPage()

    fireEvent.change(screen.getByLabelText('line-5-quantity'), { target: { value: '2' } })
    expect(screen.getByTestId('line-6')).toBeTruthy()
    const first = screen.getByTestId('slip-form-line-expansion-announcement').textContent

    fireEvent.click(screen.getByTestId('delete-line-6'))
    expect(screen.queryByTestId('line-6')).toBeNull()

    fireEvent.change(screen.getByLabelText('line-5-quantity'), { target: { value: '3' } })
    expect(screen.getByTestId('line-6')).toBeTruthy()
    const second = screen.getByTestId('slip-form-line-expansion-announcement').textContent

    expect(second).not.toBe(first)
    expect(second).toContain('입력 행 1개가 추가')
  })

  // D7·H6 (wiring): SlipFormPage 는 저장에서 제외될 행을 LineRow 에 명시적으로 알려줘야
  // 실제 금액 표시 억제(LineRow.test.tsx 에서 별도 검증)가 가능하다.
  it('D7·H6(배선): 품목 선택 + 수량 0 인 행은 excludedFromSave=true 로 전달된다', async () => {
    renderPage()
    fireEvent.click(screen.getByTestId('select-product-a-1'))
    await waitFor(() => expect(screen.getByTestId('product-name-1').textContent).toBe(harness.productA.productName))

    expect(screen.getByTestId('line-1').getAttribute('data-excluded-from-save')).toBe('false')

    fireEvent.change(screen.getByLabelText('line-1-quantity'), { target: { value: '0' } })
    expect(screen.getByTestId('line-1').getAttribute('data-excluded-from-save')).toBe('true')
  })

  // H7′(개발책임자 회귀 지시 — #902 R3 S5, H7 대체): 종전 D8 fix 는 "2.7"→"27"(10배
  // 오주문)처럼 자릿수를 재조합해 사용자가 의도하지 않은 다른 수량을 조용히 만들었다.
  // 전체 문자열이 순수 자연수(빈 값 포함)가 아니면 이 입력 자체를 반영하지 않는다.
  it.each(['2.7', '0.5', '-3', '1e3'])('H7′: 모바일 수량 입력 "%s" 은 반영되지 않고 이전 값을 유지한다', (raw) => {
    renderMobilePage()
    const qty = screen.getByLabelText('라인 1 수량') as HTMLInputElement
    expect(qty.value).toBe('1')

    fireEvent.change(qty, { target: { value: raw } })

    expect(qty.value).toBe('1')
  })

  it('H7′: 모바일 수량 입력 "12"는 그대로 반영된다(정상 경로 무회귀)', () => {
    renderMobilePage()
    const qty = screen.getByLabelText('라인 1 수량') as HTMLInputElement

    fireEvent.change(qty, { target: { value: '12' } })

    expect(qty.value).toBe('12')
  })
})

// ────────────────────────────────────────────────────────────────────────────
// #902 R3 — 개발책임자 직접 발견 회귀(모바일 표면): SlipMobileLineCard 는 LineRow 와 동일한
// "excludedFromSave 면 무조건 0" 패턴을 자체 보유한다(design-system mock 밖의 실제 코드라
// 이 파일에서만 재현 가능). 데스크톱(LineRow.test.tsx)과 동일한 회귀·수정을 검증한다.
// ────────────────────────────────────────────────────────────────────────────
describe('SlipFormPage 모바일 라인 카드 #902 R3 회귀 가드 — 제외 행에서도 입력한 금액은 남는다(H6′·H8)', () => {
  it('H6′·H8: 품목 미선택 모바일 행도 공급가액 입력값이 화면에 남는다', () => {
    renderMobilePage()
    // (모바일 카드는 데스크톱 mock LineRow 의 data-testid="line-N"/data-excluded-from-save
    // 를 갖지 않는다 — SlipMobileLineCard 는 실제 코드라 이 파일에서 mock 되지 않는다.
    // 신규 페이지의 1행은 품목 미선택 상태라 excludedFromSave=true 임이 이미 전제된다.)
    const supply = screen.getByLabelText('라인 1 공급가액') as HTMLInputElement

    fireEvent.change(supply, { target: { value: '12345' } })

    expect(supply.value).toBe('12,345')
  })

  it('H6′·H8: 수량 0 모바일 행도 부가세 입력값이 화면에 남는다', async () => {
    renderMobilePage()
    fireEvent.click(screen.getByTestId('select-product-a-1'))
    // 모바일 카드는 데스크톱 mock LineRow 의 data-testid="product-name-N" 을 갖지 않는다
    // (SlipMobileLineCard 는 실제 코드 — 품목명은 일반 텍스트로만 렌더).
    await waitFor(() => expect(screen.getByText(harness.productA.productName)).toBeTruthy())
    fireEvent.change(screen.getByLabelText('라인 1 수량'), { target: { value: '0' } })

    const vat = screen.getByLabelText('라인 1 부가세') as HTMLInputElement
    fireEvent.change(vat, { target: { value: '999' } })

    expect(vat.value).toBe('999')
  })

  // P1(개발책임자 결정 2026-07-25 "금액 열 편집 정책"): 합계는 편집 불가다. 종전 H6′·H8은
  // "합계 칸에 입력한 값이 남는다"였으나, 이제 합계 칸 자체가 입력을 받지 않으므로 그
  // 전제가 성립하지 않는다 — "편집 수단이 없고 공급가액+부가세 파생값을 보여준다"로 대체.
  it('P1: 합계(VAT포함) 칸은 편집할 수 없고 공급가액+부가세 파생값을 읽기전용으로 보여준다', async () => {
    renderMobilePage()
    fireEvent.click(screen.getByTestId('select-product-a-1'))
    // 모바일 카드는 데스크톱 mock LineRow 의 data-testid="product-name-N" 을 갖지 않는다
    // (SlipMobileLineCard 는 실제 코드 — 품목명은 일반 텍스트로만 렌더).
    await waitFor(() => expect(screen.getByText(harness.productA.productName)).toBeTruthy())
    fireEvent.change(screen.getByLabelText('라인 1 수량'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('라인 1 공급가액'), { target: { value: '50000' } })

    const total = screen.getByLabelText('라인 1 합계(VAT포함)')
    expect(total.tagName).not.toBe('INPUT')
    // 종전(RED) 코드는 이 자리에 <input>이 있어 fireEvent.change로 값을 직접 밀어넣을 수
    // 있었다 — 이제는 input이 아니므로 그 수단 자체가 없다는 것을 tagName으로 확인한다.
  })

  // H9 회귀 가드(모바일): 품목 선택 + 수량 0 이고, 금액 칸을 직접 편집한 적 없는 행은
  // "수량 1로 클램프 계산된" 가짜 합계를 보여주면 안 된다(원래 D7 모순 — 모바일 표면).
  it('H9(모바일): 품목 선택 + 수량 0 이고 금액을 직접 편집하지 않은 행은 합계가 0이다', async () => {
    renderMobilePage()
    fireEvent.click(screen.getByTestId('select-product-a-1'))
    await waitFor(() => expect(screen.getByText(harness.productA.productName)).toBeTruthy())
    fireEvent.change(screen.getByLabelText('라인 1 단가'), { target: { value: '2000' } })
    fireEvent.change(screen.getByLabelText('라인 1 수량'), { target: { value: '0' } })

    // P1: 합계는 이제 읽기전용 표시라 HTMLInputElement가 아니다 — textContent로 확인한다.
    expect(screen.getByLabelText('라인 1 합계(VAT포함)').textContent).toBe('0')
    expect((screen.getByLabelText('라인 1 공급가액') as HTMLInputElement).value).toBe('0')
    expect((screen.getByLabelText('라인 1 부가세') as HTMLInputElement).value).toBe('0')
  })

  // H8 확장(모바일): 품목 미선택이라도 수량이 유효(기본값 1)하고 단가만 입력했다면 —
  // 클램프가 왜곡한 게 없으므로 — 합계를 그대로 보여준다(이카운트 방식 "금액 먼저" 흐름).
  it('H8 확장(모바일): 품목 미선택이라도 수량 유효 + 단가 입력 행은 합계를 보여준다', () => {
    renderMobilePage()
    fireEvent.change(screen.getByLabelText('라인 1 단가'), { target: { value: '100000' } })

    // P1: 합계는 읽기전용 표시 — textContent로 확인한다.
    expect(screen.getByLabelText('라인 1 합계(VAT포함)').textContent).toBe('100,000')
  })

  // ──────────────────────────────────────────────────────────────────────────
  // #902 금액 열 편집 정책(개발책임자 결정 2026-07-25, 정정 포함) — 실 화면 통합 가드.
  // 단위 테스트(lineVat.test.ts의 editSlipLineAmount)로 이미 검증했지만, 실제 SlipMobileLineCard
  // 배선(updateVatAmount → editSlipLineAmount)이 그 계산을 올바르게 호출하는지 통합 레벨에서도
  // 확인한다 — SlipMobileLineCard는 이 파일에서 mock되지 않는 실제 코드이기 때문이다.
  // ──────────────────────────────────────────────────────────────────────────
  it('P4(통합): 공급가액을 편집해도 단가는 바뀌지 않는다(역산 금지)', () => {
    renderMobilePage()
    fireEvent.change(screen.getByLabelText('라인 1 단가'), { target: { value: '11000' } })
    fireEvent.change(screen.getByLabelText('라인 1 공급가액'), { target: { value: '50000' } })

    expect(mobileUnitPrice().value).toBe('11000')
  })

  it('P4(통합): 부가세를 편집해도 단가는 바뀌지 않는다(역산 금지)', () => {
    renderMobilePage()
    fireEvent.change(screen.getByLabelText('라인 1 단가'), { target: { value: '11000' } })
    fireEvent.change(screen.getByLabelText('라인 1 부가세'), { target: { value: '7000' } })

    expect(mobileUnitPrice().value).toBe('11000')
  })

  it('P6(통합): 공급가액을 편집해도 부가세는 그대로다 — 합계만 재계산된다', () => {
    renderMobilePage()
    fireEvent.change(screen.getByLabelText('라인 1 단가'), { target: { value: '11000' } }) // qty=1 → 공급 10000/부가세 1000
    fireEvent.change(screen.getByLabelText('라인 1 공급가액'), { target: { value: '50000' } })

    expect((screen.getByLabelText('라인 1 부가세') as HTMLInputElement).value).toBe('1,000')
    expect(screen.getByLabelText('라인 1 합계(VAT포함)').textContent).toBe('51,000')
  })

  it('P6(통합): 부가세를 편집해도 공급가액은 그대로다 — 합계만 재계산된다', () => {
    renderMobilePage()
    fireEvent.change(screen.getByLabelText('라인 1 단가'), { target: { value: '11000' } }) // qty=1 → 공급 10000/부가세 1000
    fireEvent.change(screen.getByLabelText('라인 1 부가세'), { target: { value: '7000' } })

    expect((screen.getByLabelText('라인 1 공급가액') as HTMLInputElement).value).toBe('10,000')
    expect(screen.getByLabelText('라인 1 합계(VAT포함)').textContent).toBe('17,000')
  })

  it.each(['2.7', '-3', '1e3', '1,,2'])('D-2: 모바일 금액 입력 "%s"은 숫자로 재조합하지 않고 거부한다', (raw) => {
    renderMobilePage()
    const supply = screen.getByLabelText('라인 1 공급가액') as HTMLInputElement
    const before = supply.value

    fireEvent.change(supply, { target: { value: raw } })

    expect(supply.value).toBe(before)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// MED-1 (B1-B #828 OPUS R1 dim5 — 모바일 분기 테스트 갭)
//
// 모바일 카드(SlipMobileLineCard)의 단가 input 은 가격출처(priceStatusId)와 변경상태
// (priceChangedStatusId)를 **복수 IDREF 로 병합**하고, card-level generic div
// (.mobile-line-card)에는 row-level aria-describedby 를 두지 않는다. 데스크톱 LineRow
// (LineRow.test.tsx '단가 input IDREF …' 4-케이스)와 대응한다.
//
// SlipMobileLineCard 는 export 되지 않으므로 useIsMobile=true 로 전체 페이지를 모바일
// 뷰로 렌더해 실제 카드 DOM 을 검증한다(뷰 분기 = useIsMobile 미디어쿼리 훅).
//
// 회귀 가드: 구 코드(모바일 단가 input 에 가격출처 IDREF 만·card div 에 aria-describedby)
// 로 되돌리면 '둘 다'/'변경만' 케이스와 card div 단언이 RED 가 된다.
// ────────────────────────────────────────────────────────────────────────────

function renderMobilePage() {
  harness.isMobile = true
  return renderPage()
}

/** 모바일 카드의 단가 input(aria-label "라인 N 단가") — 데스크톱 mock LineRow 와 구분됨. */
function mobileUnitPrice(lineNo = 1) {
  return screen.getByLabelText(`라인 ${lineNo} 단가`) as HTMLInputElement
}

/** 단가 input 을 감싸는 card-level generic div(.mobile-line-card). */
function mobileCard(lineNo = 1): HTMLElement {
  const card = mobileUnitPrice(lineNo).closest('.mobile-line-card')
  if (!card) throw new Error('mobile-line-card 를 찾지 못했습니다')
  return card as HTMLElement
}

/** aria-describedby 를 IDREF 배열로 분해(공백 구분·빈 토큰 제거). */
function describedByIds(input: HTMLElement): string[] {
  return input.getAttribute('aria-describedby')?.split(' ').filter(Boolean) ?? []
}

describe('SlipFormPage 모바일 라인 카드 aria-describedby (MED-1)', () => {
  it('모바일 뷰에서 데스크톱 LineRow 테이블이 아니라 라인 카드를 렌더한다', () => {
    renderMobilePage()
    // 모바일 분기 진입 확인 — 데스크톱 분기 전용 mock LineTableHeader 는 렌더되지 않는다.
    expect(mobileCard()).not.toBeNull()
    expect(screen.queryByTestId('line-table-header')).toBeNull()
  })

  // 데스크톱 케이스 '없음'(USER/null·변경 X → IDREF 0)과 대응.
  it('없음: 신규 라인 단가 input 은 aria-describedby 를 갖지 않는다', () => {
    renderMobilePage()
    expect(mobileUnitPrice().hasAttribute('aria-describedby')).toBe(false)
    expect(screen.queryByRole('note')).toBeNull()
    expect(screen.queryByText('단가 변경')).toBeNull()
    expect(mobileCard().hasAttribute('aria-describedby')).toBe(false)
  })

  // 데스크톱 케이스 '가격출처만'(CATALOG·변경 X → IDREF 1)과 대응.
  it('가격출처만: 단가 input IDREF 는 판매가 note 단독을 가리킨다', async () => {
    renderMobilePage()
    await selectPartnerA()
    fireEvent.click(screen.getByTestId('select-product-a-1'))
    await waitFor(() => expect(mobileUnitPrice().value).toBe(harness.productA.sellingPrice))

    const note = screen.getByRole('note')
    expect(note.textContent).toBe('판매가')
    expect(screen.queryByText('단가 변경')).toBeNull()

    const ids = describedByIds(mobileUnitPrice())
    expect(ids).toEqual([note.id])
    expect(ids.every((id) => document.getElementById(id) !== null)).toBe(true)
    // card-level generic div 은 row-level aria-describedby 를 갖지 않는다.
    expect(mobileCard().hasAttribute('aria-describedby')).toBe(false)
  })

  // 데스크톱 케이스 '둘 다'(REMEMBERED + 변경 → IDREF 2)와 대응 — 복수 IDREF 병합의 핵심 회귀 가드.
  it('둘 다: 단가 input IDREF 는 "priceStatusId priceChangedStatusId" 복수를 순서대로 가리킨다', async () => {
    // 응답은 전역 호출 순서가 아니라 거래처·품목 인자에 귀속시킨다. 선행
    // 테스트의 늦은 A 호출이 있어도 현재 B의 200000 응답을 선소비할 수 없다.
    harness.getPriceMemory.mockImplementation((partnerId: string, productId: string) => {
      if (partnerId === harness.partnerA.id && productId === harness.productA.id) {
        return Promise.resolve({
          unitPrice: 100000,
          source: 'LINE_SAVE',
          updatedAt: '2026-07-10T09:00:00',
        })
      }
      return Promise.resolve(null)
    })
    const partnerBPrice = deferred<{
      hits: Array<{ productId: string; unitPrice: number; source: string; updatedAt: string }>
      failedProductIds: string[]
    }>()
    harness.getPriceMemories.mockImplementation((partnerId: string) => {
      if (partnerId === harness.partnerB.id) return partnerBPrice.promise
      return Promise.resolve({ hits: [], failedProductIds: [] })
    })
    renderMobilePage()
    await selectPartnerA()
    fireEvent.click(screen.getByTestId('select-product-a-1'))
    await waitFor(() => expect(mobileUnitPrice().value).toBe('100000'))

    await selectPartnerB()
    await waitFor(() => expect(harness.getPriceMemories).toHaveBeenCalledWith(
      harness.partnerB.id,
      [harness.productA.id],
    ))

    await act(async () => {
      partnerBPrice.resolve({ hits: [{
        productId: harness.productA.id,
        unitPrice: 200000,
        source: 'LINE_SAVE',
        updatedAt: '2026-07-11T09:00:00',
      }], failedProductIds: [] })
      await partnerBPrice.promise
    })
    await waitFor(() => expect(mobileUnitPrice().value).toBe('200000'))
    await waitFor(() => expect(screen.getByText('단가 변경')).toBeTruthy())

    const note = screen.getByRole('note')        // 거래처 최근단가 (priceStatusId)
    const changed = screen.getByText('단가 변경') // PriceChangeIndicator (priceChangedStatusId)
    expect(note.textContent).toBe('거래처 최근단가')
    expect(changed.querySelector('svg')).not.toBeNull()

    const ids = describedByIds(mobileUnitPrice())
    // production join 순서 = [가격출처, 변경상태]. 구 코드(가격출처 IDREF 단독)면 length 1 → RED.
    expect(ids).toEqual([note.id, changed.id])
    expect(ids).toHaveLength(2)
    expect(document.getElementById(note.id)).toBe(note)
    expect(document.getElementById(changed.id)).toBe(changed)
    // card-level generic div 은 row-level aria-describedby 를 갖지 않는다(구 코드면 RED).
    expect(mobileCard().hasAttribute('aria-describedby')).toBe(false)
  })

  // 데스크톱 케이스 '변경상태만'(변경 O·note X → IDREF 1)과 대응.
  // 페이지 흐름상 note 없는 변경 상태 = 판매가 미확보(UNAVAILABLE)로 priceSource=null 인 재적용 행.
  it('변경만: 판매가 미확보 재적용 시 단가 input IDREF 는 변경 표지 단독을 가리킨다', async () => {
    renderMobilePage()
    await selectPartnerA()
    // sellingPrice 없는 품목(productD) → catalogFallback null → 거래처 변경 시 UNAVAILABLE.
    fireEvent.click(screen.getByTestId('select-product-d-1'))
    await waitFor(() =>
      expect(harness.getPriceMemory).toHaveBeenCalledWith(harness.partnerA.id, harness.productD.id),
    )
    await waitFor(() => expect(screen.getByRole('note').textContent).toBe('판매가'))

    await selectPartnerB()
    await waitFor(() =>
      expect(harness.getPriceMemories).toHaveBeenCalledWith(harness.partnerB.id, [harness.productD.id]),
    )
    await waitFor(() => expect(screen.getByText('단가 변경')).toBeTruthy())

    // priceSource=null → 가격출처 note 없음, 변경 표지만 남는다.
    expect(screen.queryByRole('note')).toBeNull()
    const changed = screen.getByText('단가 변경')
    const ids = describedByIds(mobileUnitPrice())
    expect(ids).toEqual([changed.id])
    expect(document.getElementById(changed.id)).toBe(changed)
    expect(mobileCard().hasAttribute('aria-describedby')).toBe(false)
  })
})
