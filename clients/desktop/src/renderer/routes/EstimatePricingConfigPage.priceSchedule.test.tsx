// @vitest-environment jsdom
/**
 * ProductPriceSchedulePage — 카테고리별 단가변동 RTL 렌더 테스트 (#17 S4b R1 fix).
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
import type { PriceChangeScheduleAdminItem } from '../api/productCatalogApi'

const mocks = vi.hoisted(() => ({
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

vi.mock('../components/sales/sales.module.css', () => ({
  default: new Proxy({}, { get: (_target, key) => String(key) }),
}))

import { ProductPriceSchedulePage } from './ProductPriceSchedulePage'

type AccessEntry = { view?: boolean; update?: boolean }

/** 미등재 pageCode 는 view/update 모두 false(보수적 deny) — 실 usePermissions 계약과 동일. */
function stubCanAccess(map: Record<string, AccessEntry>) {
  mocks.canAccess.mockImplementation((pageCode: string, action: 'view' | 'update' = 'view') => {
    const entry = map[pageCode]
    if (!entry) return false
    return action === 'update' ? !!entry.update : !!entry.view
  })
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
      <MemoryRouter initialEntries={['/products/price-schedule']}>
        <ProductPriceSchedulePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ProductPriceSchedulePage 카테고리별 단가변동(#17 S4b R1 fix)', () => {
  it('products.price-schedule VIEW 가 없으면 단가변동 Card 를 렌더하지 않는다', async () => {
    stubCanAccess({})

    renderPage()

    await waitFor(() => expect(screen.queryByText('카테고리별 단가변동')).toBeNull())
    expect(screen.queryByText('카테고리별 단가변동')).toBeNull()
    expect(mocks.getPriceChangeScheduleAdmin).not.toHaveBeenCalled()
  })

  it('VIEW 만 있고 UPDATE 가 없으면 입력과 저장 버튼이 비활성화된다', async () => {
    // QA-LOW#1(confound 제거) — 기존에는 rowDirty=false(무편집) 상태로만 save disabled 를
    // 확인해 "canEditPriceSchedule=false" 와 "rowDirty=false" 두 OR 조건이 뒤섞여
    // 판별력이 0 이었다(disabled 는 둘 중 하나만 참이어도 항상 true). UPDATE 가 있는
    // 상태에서 먼저 date 를 변경해 rowDirty=true 를 실제로 만든 뒤, UPDATE 권한만
    // 박탈하고 재렌더한다 — dirty 는 컴포넌트 로컬 state 라 rerender 로 유지되므로,
    // 이후 save disabled 단언은 오직 canEditPriceSchedule=false 때문임이 격리된다.
    stubCanAccess({
      'products.price-schedule': { view: true, update: true },
    })
    mocks.getPriceChangeScheduleAdmin.mockResolvedValue(makeScheduleRows())

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    // rerender 에는 매번 새로 평가된 JSX(새 element 참조)를 넘겨야 한다 — 동일 element
    // 참조를 재사용하면 React 가 참조 동일성만으로 bail-out 해 컴포넌트 함수 바디를
    // 재실행하지 않고(=usePermissions 재호출 없이) 이전 렌더를 그대로 유지해버린다.
    const buildUi = () => (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/products/price-schedule']}>
          <ProductPriceSchedulePage />
        </MemoryRouter>
      </QueryClientProvider>
    )
    const { rerender } = render(buildUi())

    const dateInput = await screen.findByLabelText('홈멀티 적용일')
    fireEvent.change(dateInput, { target: { value: '2026-09-01' } })
    // 편집 가능 상태에서 dirty 가 되어 save 가 활성화됨을 먼저 확인 — rowDirty=true 실증.
    expect((screen.getByTestId('price-schedule-save-homemulti') as HTMLButtonElement).disabled).toBe(false)

    stubCanAccess({
      'products.price-schedule': { view: true, update: false },
    })
    rerender(buildUi())

    expect(
      await screen.findByText('현재 권한은 조회 전용입니다. MASTER, MANAGER 또는 ACCOUNTANT 권한에서 변경할 수 있습니다.'),
    ).not.toBeNull()
    expect(((await screen.findByLabelText('홈멀티 적용일')) as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByTestId('price-schedule-toggle-homemulti') as HTMLInputElement).disabled).toBe(true)
    // rowDirty=true(위에서 실제로 설정) 인 상태에서도 disabled 이므로, canEditPriceSchedule=false
    // 때문임이 격리되어 검증된다(더 이상 rowDirty=false 로 인한 우연한 통과가 아님).
    expect((screen.getByTestId('price-schedule-save-homemulti') as HTMLButtonElement).disabled).toBe(true)
  })

  it('저장 실패 시 카테고리 라벨을 포함한 에러 문구를 표시한다', async () => {
    stubCanAccess({
      'products.price-schedule': { view: true, update: true },
    })
    mocks.getPriceChangeScheduleAdmin.mockResolvedValue(makeScheduleRows())
    mocks.updatePriceChangeSchedule.mockRejectedValue(new Error('save failed'))

    renderPage()

    const dateInput = await screen.findByLabelText('홈멀티 적용일')
    fireEvent.change(dateInput, { target: { value: '2026-09-01' } })
    fireEvent.click(screen.getByTestId('price-schedule-save-homemulti'))

    await screen.findByText('홈멀티 저장에 실패했습니다. 입력값과 권한을 확인하세요.')

    // QA-MED#2 — 에러 표시 후 아무 필드(date)나 다시 편집하면 에러 문구가 즉시 사라진다
    // (handleScheduleDateChange 가 setPriceScheduleError('') 를 선행 호출하는 M2 clear 보장).
    fireEvent.change(dateInput, { target: { value: '2026-10-01' } })
    expect(screen.queryByText(/저장에 실패했습니다/)).toBeNull()
  })

  it('oldProducts 행에도 단가변동 토글이 표시되고 저장한다', async () => {
    stubCanAccess({
      'products.price-schedule': { view: true, update: true },
    })
    mocks.getPriceChangeScheduleAdmin.mockResolvedValue(makeScheduleRows())
    mocks.updatePriceChangeSchedule.mockResolvedValue({
      category: 'oldProducts',
      effectiveDate: '2026-09-01',
      defaultPreChange: false,
    })

    renderPage()

    await screen.findByTestId('price-schedule-row-oldProducts')
    const toggle = await screen.findByTestId('price-schedule-toggle-oldProducts')
    expect((toggle as HTMLInputElement).checked).toBe(false)
    fireEvent.click(toggle)
    fireEvent.click(screen.getByTestId('price-schedule-save-oldProducts'))

    await waitFor(() =>
      expect(mocks.updatePriceChangeSchedule).toHaveBeenCalledWith('oldProducts', { defaultPreChange: true }),
    )
  })

  it('저장 성공 시 refetch 완료 전에도 테이블 값이 즉시 갱신된다(스테일 flash 회귀 가드)', async () => {
    stubCanAccess({
      'products.price-schedule': { view: true, update: true },
    })
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

    // QA-MED#5 — 저장 성공 후 dirty 배경(#fffbeb)이 사라지고 save 버튼이 disabled 로
    // 복귀하는지 별도 검증(위 setQueryData 즉시반영 단언과 분리된 dirty-clear 단언).
    expect(screen.getByTestId('price-schedule-row-homemulti').style.background).toBe('')
    expect((screen.getByTestId('price-schedule-save-homemulti') as HTMLButtonElement).disabled).toBe(true)
  })

  it('한 카테고리만 저장해도 다른 dirty 카테고리는 초기화되지 않는다(다행 회귀 가드, QA-MED#3)', async () => {
    stubCanAccess({
      'products.price-schedule': { view: true, update: true },
    })
    mocks.getPriceChangeScheduleAdmin.mockResolvedValue(makeScheduleRows())
    mocks.updatePriceChangeSchedule.mockResolvedValue({
      category: 'homemulti',
      effectiveDate: '2026-08-01',
      defaultPreChange: true,
    })

    renderPage()

    const homemultiToggle = await screen.findByTestId('price-schedule-toggle-homemulti')
    const singleSetsToggle = await screen.findByTestId('price-schedule-toggle-singleSets')
    fireEvent.click(homemultiToggle)
    fireEvent.click(singleSetsToggle)

    // 두 행 모두 dirty(#fffbeb 배경) — jsdom 이 hex 를 rgb 로 정규화할 수 있어 둘 다 허용.
    expect(['#fffbeb', 'rgb(255, 251, 235)']).toContain(
      screen.getByTestId('price-schedule-row-homemulti').style.background,
    )
    expect(['#fffbeb', 'rgb(255, 251, 235)']).toContain(
      screen.getByTestId('price-schedule-row-singleSets').style.background,
    )

    fireEvent.click(screen.getByTestId('price-schedule-save-homemulti'))

    await waitFor(() => expect(mocks.updatePriceChangeSchedule).toHaveBeenCalledTimes(1))
    expect(mocks.updatePriceChangeSchedule).toHaveBeenCalledWith('homemulti', { defaultPreChange: true })

    // homemulti 는 dirty 클리어되지만, 저장을 요청하지 않은 singleSets 는 여전히 dirty 로
    // 남아 save 가 활성 상태여야 한다 — dirty map 전체 초기화(회귀) 가드.
    expect(screen.getByTestId('price-schedule-row-homemulti').style.background).toBe('')
    expect(['#fffbeb', 'rgb(255, 251, 235)']).toContain(
      screen.getByTestId('price-schedule-row-singleSets').style.background,
    )
    expect((screen.getByTestId('price-schedule-save-singleSets') as HTMLButtonElement).disabled).toBe(false)
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
  })
})
