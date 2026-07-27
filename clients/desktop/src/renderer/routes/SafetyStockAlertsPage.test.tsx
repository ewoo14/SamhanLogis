// @vitest-environment jsdom
//
// #825 슬5 FABLE5 R1 결정2ⓓ — 안전재고 설정 폼 신규 vitest.
// 종전에는 이 화면에 vitest 자체가 없어(신설 대상) 아래 3개 결함이 CI green 인 채로
// 방치됐다: ⓐ 권한 게이팅 없음(BE 403 인데 폼은 그대로 노출) ⓑ 저장 성공/실패 무피드백
// ⓒ 제품 드롭다운이 알림 목록에서만 파생되어 알림 없는(=신규) 제품은 최초 설정 불가한
// 순환 구조. 셋 다 여기서 회귀 방지 커버한다. TagChip '전체' 칩 제거(X) 버블링 결함
// fix(design-system 레벨)도 이 실 화면 통합 경로에서 재확인한다(design-system 변경은
// 사용처별 회귀 확인 의무).
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }))

const canAccessMock = vi.fn(() => true)
vi.mock('../hooks/usePermissions', () => ({
  usePermissions: () => ({ canAccess: (...args: unknown[]) => canAccessMock(...args), isLoading: false }),
}))

const listSafetyStockAlertsMock = vi.fn()
const setSafetyStockMock = vi.fn()
vi.mock('../api/safetyStockApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/safetyStockApi')>()
  return {
    ...actual,
    listSafetyStockAlerts: (...args: unknown[]) => listSafetyStockAlertsMock(...args),
    setSafetyStock: (...args: unknown[]) => setSafetyStockMock(...args),
  }
})

const listWarehousesMock = vi.fn()
vi.mock('../api/inventory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/inventory')>()
  return {
    ...actual,
    listWarehouses: (...args: unknown[]) => listWarehousesMock(...args),
  }
})

// [#825 슬5 R1 결정2ⓒ] ProductAutocomplete 는 실 debounce 서버검색 UI 라 vitest 에서는
// SlipFormPage.test.tsx 선례(design-system mock 스텁)를 따라 결정적 버튼 스텁으로 대체한다.
// TagChip/Input/Button 등 나머지 design-system 컴포넌트는 실제 구현을 그대로 사용해
// TagChip 버블링 fix 를 이 실 화면 통합 경로에서도 검증한다.
const QA_PRODUCT: { id: string; modelName: string; productName: string } = {
  id: 'aaaaaaaa-1111-1111-1111-111111111111',
  modelName: 'QA-825-S5-LIVE',
  productName: '[QA-825-S5] 안전재고 검증 전용',
}
vi.mock('@samhan/design-system', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@samhan/design-system')>()
  return {
    ...actual,
    ProductAutocomplete: ({
      onChange,
      disabled,
    }: {
      onChange: (product: typeof QA_PRODUCT | null) => void
      disabled?: boolean
    }) => (
      <div>
        <button
          type="button"
          data-testid="select-product-qa"
          disabled={disabled}
          onClick={() => onChange(QA_PRODUCT)}
        >
          {QA_PRODUCT.modelName}
        </button>
        <button
          type="button"
          data-testid="clear-product"
          disabled={disabled}
          onClick={() => onChange(null)}
        >
          clear
        </button>
      </div>
    ),
  }
})

import { SafetyStockAlertsPage } from './SafetyStockAlertsPage'

const HQ_WAREHOUSE = { id: 'wh-hq', code: 'HQ-001', name: '본사창고' }
const BRANCH_WAREHOUSE = { id: 'wh-branch', code: 'BR-001', name: '1호차 차량재고' }

// 기존 알림 — QA_PRODUCT 와 무관한 다른 제품만 존재(알림에 뜬 적 없는 제품도 설정 가능함을
// 증명하기 위한 대조군 — ⓒ 순환 구조 fix 검증).
const otherProductAlert = {
  productId: 'bbbbbbbb-2222-2222-2222-222222222222',
  productCode: 'OTHER-001',
  productName: '다른 제품',
  warehouseId: HQ_WAREHOUSE.id,
  warehouseName: HQ_WAREHOUSE.name,
  threshold: 10,
  currentQty: 2,
  shortage: 8,
  note: null,
}

/**
 * '전체' TagChip 의 실제 클릭 가능 영역(role="button" 내부 wrapper)을 클릭한다.
 *
 * <p>TagChip 은 ARIA 중첩 회피를 위해 role="button"/onClick 을 outer testid span 이 아닌
 * 내부 wrapper 에 둔다(#825 슬5 R1). 실 브라우저(Playwright)는 좌표 기반 hit-test 라 outer
 * span 중앙 클릭이 자연히 내부 wrapper 에 도달하지만, RTL `fireEvent.click` 은 좌표
 * hit-test 없이 지정한 노드에 직접 이벤트를 디스패치하며 이벤트는 조상으로만 버블링되므로
 * outer(비대화형) span 을 클릭하면 하위(inner pressable)엔 절대 도달하지 않는다 — 반드시
 * 내부 wrapper 를 직접 타깃해야 한다.
 */
function clickAllChip(testId: string): void {
  const chip = screen.getByTestId(testId)
  const pressable = chip.querySelector('[role="button"]')
  if (!pressable) throw new Error(`${testId} 내부에 role=button wrapper 를 찾을 수 없음`)
  fireEvent.click(pressable)
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <SafetyStockAlertsPage />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  canAccessMock.mockReset()
  canAccessMock.mockReturnValue(true)
  listSafetyStockAlertsMock.mockReset()
  setSafetyStockMock.mockReset()
  listWarehousesMock.mockReset()
})

describe('SafetyStockAlertsPage — #825 슬5 R1 결정2', () => {
  it('칩 0개(미선택)면 저장이 잠기고 role="status" 안내를 표시한다', async () => {
    listSafetyStockAlertsMock.mockResolvedValue([otherProductAlert])
    listWarehousesMock.mockResolvedValue([HQ_WAREHOUSE, BRANCH_WAREHOUSE])

    renderPage()

    const hint = await screen.findByTestId('safety-stock-scope-hint')
    expect(hint.getAttribute('role')).toBe('status')
    expect((screen.getByTestId('safety-stock-config-save') as HTMLButtonElement).disabled).toBe(true)
  })

  it('결정2ⓒ — 알림 이력이 전혀 없는 제품도 ProductAutocomplete 로 검색·선택해 최초 설정을 저장할 수 있다(순환 구조 해소)', async () => {
    // 알림 목록에는 QA_PRODUCT 가 단 한 번도 등장하지 않는다 — 종전 select 는 alertsQuery
    // 파생 옵션만 제공해 이 제품을 절대 선택할 수 없었다(최초 설정 불가 순환 구조).
    listSafetyStockAlertsMock.mockResolvedValue([otherProductAlert])
    listWarehousesMock.mockResolvedValue([HQ_WAREHOUSE, BRANCH_WAREHOUSE])
    setSafetyStockMock.mockResolvedValue({
      id: 'cfg-1',
      productId: QA_PRODUCT.id,
      warehouseId: HQ_WAREHOUSE.id,
      threshold: 5,
      note: null,
    })

    renderPage()
    await screen.findByTestId('safety-stock-scope-hint')

    fireEvent.click(screen.getByTestId('select-product-qa'))
    fireEvent.change(screen.getByTestId('safety-stock-config-warehouse'), { target: { value: HQ_WAREHOUSE.id } })
    fireEvent.change(screen.getByTestId('safety-stock-config-threshold'), { target: { value: '5' } })

    const saveBtn = screen.getByTestId('safety-stock-config-save') as HTMLButtonElement
    await waitFor(() => expect(saveBtn.disabled).toBe(false))
    fireEvent.click(saveBtn)

    await waitFor(() => expect(setSafetyStockMock).toHaveBeenCalledWith(QA_PRODUCT.id, {
      warehouseId: HQ_WAREHOUSE.id,
      threshold: 5,
      scopeMode: 'SELECTED',
    }))
  })

  it('결정2ⓑ — 저장 성공 시 성공 피드백을 표시한다(종전 무피드백)', async () => {
    listSafetyStockAlertsMock.mockResolvedValue([])
    listWarehousesMock.mockResolvedValue([HQ_WAREHOUSE])
    setSafetyStockMock.mockResolvedValue({
      id: 'cfg-2',
      productId: QA_PRODUCT.id,
      warehouseId: null,
      threshold: 7,
      note: null,
    })

    renderPage()
    await screen.findByTestId('safety-stock-scope-hint')

    fireEvent.click(screen.getByTestId('select-product-qa'))
    clickAllChip('safety-stock-all-chip')
    fireEvent.change(screen.getByTestId('safety-stock-config-threshold'), { target: { value: '7' } })

    const saveBtn = screen.getByTestId('safety-stock-config-save') as HTMLButtonElement
    await waitFor(() => expect(saveBtn.disabled).toBe(false))
    fireEvent.click(saveBtn)

    const successBanner = await screen.findByTestId('safety-stock-config-save-success')
    expect(successBanner.textContent).toContain('안전재고 설정을 저장했습니다.')
    expect(setSafetyStockMock).toHaveBeenCalledWith(QA_PRODUCT.id, {
      warehouseId: null,
      threshold: 7,
      scopeMode: 'ALL',
    })
  })

  it('저장 성공 직후 새 임계값과 모순되는 이전 부족 경고를 동시에 표시하지 않는다', async () => {
    let resolveRefresh: ((alerts: unknown[]) => void) | undefined
    listWarehousesMock.mockResolvedValue([])
    listSafetyStockAlertsMock
      .mockResolvedValueOnce([{
        ...otherProductAlert,
        productId: QA_PRODUCT.id,
        productCode: QA_PRODUCT.modelName,
        productName: QA_PRODUCT.productName,
        threshold: 10,
        currentQty: 2,
        shortage: 8,
      }])
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveRefresh = resolve
      }))
    setSafetyStockMock.mockResolvedValue({
      id: 'cfg-p2',
      productId: QA_PRODUCT.id,
      warehouseId: null,
      threshold: 1,
      note: null,
    })

    renderPage()
    await screen.findByText('재고 부족 경고')
    fireEvent.click(screen.getByTestId('select-product-qa'))
    clickAllChip('safety-stock-all-chip')
    fireEvent.change(screen.getByTestId('safety-stock-config-threshold'), { target: { value: '1' } })

    const saveBtn = screen.getByTestId('safety-stock-config-save') as HTMLButtonElement
    await waitFor(() => expect(saveBtn.disabled).toBe(false))
    fireEvent.click(saveBtn)

    await waitFor(() => expect(listSafetyStockAlertsMock).toHaveBeenCalledTimes(2))
    await screen.findByTestId('safety-stock-config-save-success')
    expect(screen.getByTestId('safety-stock-alerts-refreshing')).not.toBeNull()
    expect(screen.queryByText('재고 부족 경고')).toBeNull()

    resolveRefresh?.([])
    await waitFor(() => expect(screen.queryByTestId('safety-stock-alerts-refreshing')).toBeNull())
    expect(screen.queryByText('재고 부족 경고')).toBeNull()
  })

  it('refetch 실패 시에도 저장 성공을 알리고 stale 부족 경고 대신 새로고침 실패를 안내한다', async () => {
    listWarehousesMock.mockResolvedValue([])
    listSafetyStockAlertsMock
      .mockResolvedValueOnce([{
        ...otherProductAlert,
        productId: QA_PRODUCT.id,
        productCode: QA_PRODUCT.modelName,
        productName: QA_PRODUCT.productName,
        threshold: 10,
        currentQty: 2,
        shortage: 8,
      }])
      .mockRejectedValueOnce(new Error('alerts refresh failed'))
    setSafetyStockMock.mockResolvedValue({
      id: 'cfg-p2-error',
      productId: QA_PRODUCT.id,
      warehouseId: null,
      threshold: 1,
      note: null,
    })

    renderPage()
    await screen.findByText('재고 부족 경고')
    fireEvent.click(screen.getByTestId('select-product-qa'))
    clickAllChip('safety-stock-all-chip')
    fireEvent.change(screen.getByTestId('safety-stock-config-threshold'), { target: { value: '1' } })

    const saveBtn = screen.getByTestId('safety-stock-config-save') as HTMLButtonElement
    await waitFor(() => expect(saveBtn.disabled).toBe(false))
    fireEvent.click(saveBtn)

    await screen.findByTestId('safety-stock-config-save-success')
    await screen.findByTestId('safety-stock-alerts-refresh-error')
    expect(screen.queryByText('재고 부족 경고')).toBeNull()
  })

  it('결정2ⓑ — 저장 실패(404 등) 시 오류 피드백을 표시한다(종전 무피드백 — 라이브 QA d2-f3 실증)', async () => {
    listSafetyStockAlertsMock.mockResolvedValue([])
    listWarehousesMock.mockResolvedValue([HQ_WAREHOUSE])
    // axios isAxiosError() 는 isAxiosError:true 마커로 duck-type 판별하므로 실 AxiosError
    // 인스턴스 없이도 이 형태의 plain object 로 재현 가능하다 — 라이브 QA d2-f3 의 실제
    // 서버 404 메시지("일부 제품을 찾을 수 없습니다 (요청 1, 응답 0)")를 그대로 사용한다.
    setSafetyStockMock.mockRejectedValue({
      isAxiosError: true,
      response: { status: 404, data: { code: 'NOT_FOUND', message: '일부 제품을 찾을 수 없습니다 (요청 1, 응답 0)' } },
    })

    renderPage()
    await screen.findByTestId('safety-stock-scope-hint')

    fireEvent.click(screen.getByTestId('select-product-qa'))
    clickAllChip('safety-stock-all-chip')
    fireEvent.change(screen.getByTestId('safety-stock-config-threshold'), { target: { value: '9' } })

    const saveBtn = screen.getByTestId('safety-stock-config-save') as HTMLButtonElement
    await waitFor(() => expect(saveBtn.disabled).toBe(false))
    fireEvent.click(saveBtn)

    const errorBanner = await screen.findByTestId('safety-stock-config-save-error')
    expect(errorBanner.getAttribute('role')).toBe('alert')
    expect(errorBanner.textContent).toContain('일부 제품을 찾을 수 없습니다 (요청 1, 응답 0)')
    expect(screen.queryByTestId('safety-stock-config-save-success')).toBeNull()
  })

  it("TagChip '전체' 칩 X 제거가 즉시 재선택으로 버블링되지 않는다(design-system 버블링 fix — 실 화면 통합 회귀)", async () => {
    listSafetyStockAlertsMock.mockResolvedValue([])
    listWarehousesMock.mockResolvedValue([HQ_WAREHOUSE])

    renderPage()
    await screen.findByTestId('safety-stock-scope-hint')

    clickAllChip('safety-stock-all-chip')
    expect(screen.queryByTestId('safety-stock-scope-hint')).toBeNull()
    expect((screen.getByTestId('safety-stock-config-warehouse') as HTMLSelectElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: '전체 창고 범위 제거' }))

    // 종전 결함: 제거 클릭이 chip onClick 으로 버블링되어 즉시 ALL 재선택 → hint 미복귀.
    // fix 후에는 미선택으로 정확히 복귀해야 한다.
    const hintAfterRemove = await screen.findByTestId('safety-stock-scope-hint')
    expect(hintAfterRemove).not.toBeNull()
    expect((screen.getByTestId('safety-stock-config-warehouse') as HTMLSelectElement).disabled).toBe(false)
    expect((screen.getByTestId('safety-stock-config-save') as HTMLButtonElement).disabled).toBe(true)
  })

  it('Enter 키로 \'전체\' 칩을 활성화할 수 있다(키보드 접근성)', async () => {
    listSafetyStockAlertsMock.mockResolvedValue([])
    listWarehousesMock.mockResolvedValue([HQ_WAREHOUSE])

    renderPage()
    await screen.findByTestId('safety-stock-scope-hint')

    const chip = screen.getByTestId('safety-stock-all-chip')
    const pressable = chip.querySelector('[role="button"]')
    expect(pressable).not.toBeNull()
    fireEvent.keyDown(pressable as Element, { key: 'Enter' })

    expect(screen.queryByTestId('safety-stock-scope-hint')).toBeNull()
    expect((pressable as Element).getAttribute('aria-pressed')).toBe('true')
  })

  it('미선택 안내는 전체 칩과 창고 선택 경로를 함께 안내하고 Enter·Space로 왕복 토글된다', async () => {
    listSafetyStockAlertsMock.mockResolvedValue([])
    listWarehousesMock.mockResolvedValue([HQ_WAREHOUSE])

    renderPage()

    const hint = await screen.findByTestId('safety-stock-scope-hint')
    expect(hint.textContent).toContain("전체로 처리하려면 '전체' 칩을 선택하세요.")
    expect(hint.textContent).toContain('특정 창고만 처리하려면 창고를 선택하세요.')

    const pressable = screen.getByTestId('safety-stock-all-chip').querySelector('[role="button"]')
    expect(pressable).not.toBeNull()
    fireEvent.keyDown(pressable as Element, { key: 'Enter' })
    await waitFor(() => expect(pressable?.getAttribute('aria-pressed')).toBe('true'))
    fireEvent.keyDown(pressable as Element, { key: 'Enter' })
    await waitFor(() => expect(pressable?.getAttribute('aria-pressed')).toBe('false'))
    expect(screen.getByTestId('safety-stock-scope-hint')).toBeTruthy()

    fireEvent.keyDown(pressable as Element, { key: ' ' })
    await waitFor(() => expect(pressable?.getAttribute('aria-pressed')).toBe('true'))
    fireEvent.keyDown(pressable as Element, { key: ' ' })
    await waitFor(() => expect(pressable?.getAttribute('aria-pressed')).toBe('false'))
    expect(screen.getByTestId('safety-stock-scope-hint')).toBeTruthy()
  })

  it('결정2ⓐ — inventory.safety-stock UPDATE 권한이 없으면 설정 폼이 잠기고 사유를 안내한다(BE @RequirePermission 과 정합)', async () => {
    canAccessMock.mockImplementation((page: string, action?: string) => {
      if (page === 'inventory.safety-stock' && action === 'update') return false
      return true
    })
    listSafetyStockAlertsMock.mockResolvedValue([])
    listWarehousesMock.mockResolvedValue([HQ_WAREHOUSE])

    renderPage()
    await screen.findByTestId('safety-stock-config')

    expect(screen.getByText(/안전재고 설정 권한이 없습니다/)).not.toBeNull()
    expect((screen.getByTestId('select-product-qa') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('safety-stock-config-warehouse') as HTMLSelectElement).disabled).toBe(true)
    expect((screen.getByTestId('safety-stock-config-threshold') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByTestId('safety-stock-config-save') as HTMLButtonElement).disabled).toBe(true)
    const allChip = screen.getByTestId('safety-stock-all-chip')
    expect(allChip.querySelector('[role="button"]')).toBeNull()
    expect(allChip.getAttribute('role')).toBeNull()
    expect(allChip.getAttribute('tabindex')).toBeNull()
    expect(allChip.getAttribute('aria-disabled')).toBeNull()

    // 값을 채워도(우회 시도) 저장 버튼은 잠긴 채 유지된다. canUpdate=false 이면 TagChip 은
    // onClick 자체가 없어(isPressable=false) 내부 pressable wrapper 가 렌더되지 않으므로
    // outer testid span 클릭 자체가 이미 완전한 no-op 검증이다(clickAllChip 헬퍼 불필요).
    fireEvent.click(screen.getByTestId('safety-stock-all-chip'))
    fireEvent.change(screen.getByTestId('safety-stock-config-threshold'), { target: { value: '3' } })
    expect((screen.getByTestId('safety-stock-config-save') as HTMLButtonElement).disabled).toBe(true)
  })
})
