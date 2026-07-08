// @vitest-environment jsdom
/**
 * EstimatePricingConfigPage — 카테고리별 단가변동 섹션 RTL 렌더 테스트 (#17 S4b R1 fix).
 *
 * 기존 EstimatePricingConfigPage.test.ts 는 readFileSync + toContain substring 뿐이라
 * 렌더 로직(가드 반전, disabled 상태, 에러 처리, stale-flash)이 깨져도 green 이었다
 * (QA-H2/FE-MED-2). 이 파일은 실제 렌더/상호작용을 검증한다.
 */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { EstimateConfig } from '../api/sales'
import type { PriceChangeScheduleAdminItem } from '../api/productCatalogApi'

const mocks = vi.hoisted(() => ({
  getEstimateConfig: vi.fn(),
  updateEstimateConfig: vi.fn(),
  getPriceChangeScheduleAdmin: vi.fn(),
  updatePriceChangeSchedule: vi.fn(),
  canAccess: vi.fn(),
}))

type MockButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: string
  size?: string
  loading?: boolean
}
type MockInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string
  inputSize?: string
}

vi.mock('@samhan/design-system', () => ({
  Button: ({ children, variant: _variant, size: _size, loading, disabled, ...props }: MockButtonProps) => (
    <button disabled={!!disabled || !!loading} {...props}>
      {children}
    </button>
  ),
  Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  Input: React.forwardRef<HTMLInputElement, MockInputProps>(function Input(
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
}))

vi.mock('../api/sales', () => ({
  getEstimateConfig: mocks.getEstimateConfig,
  updateEstimateConfig: mocks.updateEstimateConfig,
}))

vi.mock('../api/productCatalogApi', () => ({
  getPriceChangeScheduleAdmin: mocks.getPriceChangeScheduleAdmin,
  updatePriceChangeSchedule: mocks.updatePriceChangeSchedule,
}))

vi.mock('../hooks/usePermissions', () => ({
  usePermissions: () => ({ canAccess: mocks.canAccess }),
}))

vi.mock('../stores/pageTitle', () => ({
  usePageTitleStore: () => vi.fn(),
}))

vi.mock('../components/sales/SalesSubNav', () => ({ SalesSubNav: () => <nav /> }))
vi.mock('../components/sales/sales.module.css', () => ({
  default: new Proxy({}, { get: (_target, key) => String(key) }),
}))

import { EstimatePricingConfigPage } from './EstimatePricingConfigPage'

type AccessEntry = { view?: boolean; update?: boolean }

/** 미등재 pageCode 는 view/update 모두 false(보수적 deny) — 실 usePermissions 계약과 동일. */
function stubCanAccess(map: Record<string, AccessEntry>) {
  mocks.canAccess.mockImplementation((pageCode: string, action: 'view' | 'update' = 'view') => {
    const entry = map[pageCode]
    if (!entry) return false
    return action === 'update' ? !!entry.update : !!entry.view
  })
}

function makeEstimateConfig(overrides: Partial<EstimateConfig> = {}): EstimateConfig {
  return {
    commonHomeDiscountRate: 0.45,
    commonCommercialDiscountRate: 0.45,
    oldProductDiscountRate: 0.5,
    vatRate: 0.1,
    cardFeeRate: 0.03,
    advanceDiscountRate: 0,
    comboWarnRate: 0,
    homeNoHose: false,
    homeNoBranch: false,
    homeWithFoot: false,
    homeDefaultPanel: '',
    singleDefaultWiredRemote: '',
    singleNoRemote: false,
    singleWithBase: false,
    singleDefaultPanel: '',
    singlePanelShape: '원형',
    singleDiscount: 0,
    singleOneWayDiscount: 0,
    singleMaterialInclusion: '별도',
    footerNotice: '',
    ...overrides,
  }
}

function makeScheduleRows(
  overrides: Partial<Record<PriceChangeScheduleAdminItem['category'], Partial<PriceChangeScheduleAdminItem>>> = {},
): PriceChangeScheduleAdminItem[] {
  const base: PriceChangeScheduleAdminItem[] = [
    { category: 'homemulti', effectiveDate: '2026-08-01', defaultPreChange: false },
    { category: 'singleSets', effectiveDate: '2026-08-01', defaultPreChange: false },
    { category: 'commercialMulti', effectiveDate: '2026-08-01', defaultPreChange: false },
    { category: 'oldProducts', effectiveDate: '2026-08-01', defaultPreChange: false },
  ]
  return base.map((row) => ({ ...row, ...overrides[row.category] }))
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/sales/estimate-config']}>
        <EstimatePricingConfigPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('EstimatePricingConfigPage 카테고리별 단가변동 섹션(#17 S4b R1 fix)', () => {
  it('products.price-schedule VIEW 가 없으면 단가변동 Card 를 렌더하지 않는다', async () => {
    stubCanAccess({ 'sales.estimate-config': { view: true, update: true } })
    mocks.getEstimateConfig.mockResolvedValue(makeEstimateConfig())

    renderPage()

    await screen.findByText('옵션 기본값')
    expect(screen.queryByText('카테고리별 단가변동')).toBeNull()
    expect(mocks.getPriceChangeScheduleAdmin).not.toHaveBeenCalled()
  })

  it('VIEW 만 있고 UPDATE 가 없으면 입력과 저장 버튼이 비활성화된다', async () => {
    stubCanAccess({
      'sales.estimate-config': { view: true, update: true },
      'products.price-schedule': { view: true, update: false },
    })
    mocks.getEstimateConfig.mockResolvedValue(makeEstimateConfig())
    mocks.getPriceChangeScheduleAdmin.mockResolvedValue(makeScheduleRows())

    renderPage()

    expect(
      await screen.findByText('현재 권한은 조회 전용입니다. MASTER, MANAGER 또는 ACCOUNTANT 권한에서 변경할 수 있습니다.'),
    ).not.toBeNull()
    expect(((await screen.findByLabelText('홈멀티 적용일')) as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByTestId('price-schedule-toggle-homemulti') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByTestId('price-schedule-save-homemulti') as HTMLButtonElement).disabled).toBe(true)
  })

  it('저장 실패 시 카테고리 라벨을 포함한 에러 문구를 표시한다', async () => {
    stubCanAccess({
      'sales.estimate-config': { view: true, update: true },
      'products.price-schedule': { view: true, update: true },
    })
    mocks.getEstimateConfig.mockResolvedValue(makeEstimateConfig())
    mocks.getPriceChangeScheduleAdmin.mockResolvedValue(makeScheduleRows())
    mocks.updatePriceChangeSchedule.mockRejectedValue(new Error('save failed'))

    renderPage()

    const dateInput = await screen.findByLabelText('홈멀티 적용일')
    fireEvent.change(dateInput, { target: { value: '2026-09-01' } })
    fireEvent.click(screen.getByTestId('price-schedule-save-homemulti'))

    await screen.findByText('홈멀티 저장에 실패했습니다. 입력값과 권한을 확인하세요.')
  })

  it('oldProducts 행은 체크박스 없이 "대상 아님" 을 표시한다', async () => {
    stubCanAccess({
      'sales.estimate-config': { view: true, update: true },
      'products.price-schedule': { view: true, update: true },
    })
    mocks.getEstimateConfig.mockResolvedValue(makeEstimateConfig())
    mocks.getPriceChangeScheduleAdmin.mockResolvedValue(makeScheduleRows())

    renderPage()

    const oldRow = await screen.findByTestId('price-schedule-row-oldProducts')
    expect(oldRow.textContent).toContain('대상 아님')
    expect(screen.queryByTestId('price-schedule-toggle-oldProducts')).toBeNull()
  })

  it('저장 성공 시 refetch 완료 전에도 테이블 값이 즉시 갱신된다(스테일 flash 회귀 가드)', async () => {
    stubCanAccess({
      'sales.estimate-config': { view: true, update: true },
      'products.price-schedule': { view: true, update: true },
    })
    mocks.getEstimateConfig.mockResolvedValue(makeEstimateConfig())
    mocks.getPriceChangeScheduleAdmin
      .mockResolvedValueOnce(makeScheduleRows())
      // invalidateQueries 가 트리거하는 background refetch(2번째 GET) 는 고의로 응답을
      // 지연시켜, 그 사이에도 테이블이 stale 값으로 되돌아가지 않는지 검증한다.
      .mockImplementationOnce(() => new Promise(() => {}))
    mocks.updatePriceChangeSchedule.mockResolvedValue({
      category: 'homemulti',
      effectiveDate: '2026-08-01',
      defaultPreChange: true,
    })

    renderPage()

    const toggle = await screen.findByTestId('price-schedule-toggle-homemulti')
    expect((toggle as HTMLInputElement).checked).toBe(false)
    fireEvent.click(toggle)
    fireEvent.click(screen.getByTestId('price-schedule-save-homemulti'))

    await waitFor(() => expect(mocks.updatePriceChangeSchedule).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(mocks.getPriceChangeScheduleAdmin).toHaveBeenCalledTimes(2))
    expect((screen.getByTestId('price-schedule-toggle-homemulti') as HTMLInputElement).checked).toBe(true)
  })

  it('ACCOUNTANT 관점(sales.estimate-config 없음·products.price-schedule 있음)에서는 estimateConfig 폼 없이 단가변동 섹션만 노출한다', async () => {
    stubCanAccess({
      'products.price-schedule': { view: true, update: true },
    })
    mocks.getPriceChangeScheduleAdmin.mockResolvedValue(makeScheduleRows())

    renderPage()

    await screen.findByText('카테고리별 단가변동')
    expect(screen.queryByText('견적 가격 설정')).toBeNull()
    expect(screen.queryByText('옵션 기본값')).toBeNull()
    expect(mocks.getEstimateConfig).not.toHaveBeenCalled()
  })
})
