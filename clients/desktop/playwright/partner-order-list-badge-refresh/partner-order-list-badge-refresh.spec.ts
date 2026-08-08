/**
 * 3-D — 병합 전환 후 주문 목록 상태 배지 갱신 Playwright E2E.
 *
 * <h2>검증 대상</h2>
 * <ol>
 *   <li>같은 거래처 DRAFT 2건 병합 발행 성공</li>
 *   <li>수동 새로고침(page.reload) 없이 invalidateQueries(['partner-orders']) 로
 *       DRAFT 필터 목록에서 변환된 두 행이 사라짐</li>
 *   <li>전체 필터로 전환 시 두 행이 CONVERTED 배지(전환완료 라벨)로 노출</li>
 * </ol>
 *
 * <h2>Mock 전략 — VITE_MOCK_MODE=1 (mock.ts 3-D 상태보존)</h2>
 * <ul>
 *   <li>POST /api/v1/partner-orders/convert-to-slip-merge → 성공 +
 *       변환 주문번호('2026/05/04-1','2026/05/31-3')를 mockConvertedOrderNos 에 기록</li>
 *   <li>GET /api/v1/partner-orders → 기록된 주문번호는 CONVERTED 로 노출(전체) /
 *       DRAFT 필터에서는 제외</li>
 * </ul>
 *
 * <h2>no-fake-data 원칙 ([[feedback_no_fake_data_ever]])</h2>
 * <p>본 spec 은 VITE_MOCK_MODE=1 환경에서 react-query invalidate 회귀 검증 전용(FE 단위).
 * 실서버 Docker QA 증빙은 PM 이 별도 수행하며 본 spec 을 실 QA 로 포장하지 않는다.</p>
 *
 * <h2>실행 방법</h2>
 * <pre>
 *   cd clients/desktop
 *   set VITE_MOCK_MODE=1 && npx vite src/renderer --host 127.0.0.1 --port 5174
 *   set PLAYWRIGHT_SKIP_WEB_SERVER=1 && set AUDIT_BASE_URL=http://127.0.0.1:5174
 *     && npx playwright test playwright/partner-order-list-badge-refresh --reporter=line
 * </pre>
 */
import { expect, test, type Locator, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'

const listUrl = (extra = '') =>
  `${BASE_URL}/#/sales/partner-orders?mockRole=MASTER${extra}`

async function installAuthMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const auth = {
      token: 'playwright-token',
      userId: '00000000-0000-0000-0000-000000010001',
      role: 'MASTER',
      fullName: '오병승',
      partnerCode: 'P-MOCK-001',
    }
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => auth,
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  })
}

async function gotoListAndWait(page: Page, extra = ''): Promise<void> {
  await page.goto(listUrl(extra), { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('header-page-title')).toContainText('주문서 관리', {
    timeout: 15_000,
  })
}

/** WarehouseAutocomplete 선택 헬퍼. */
async function selectWarehouseAutocomplete(
  warehouseDiv: Locator,
  searchText: string,
): Promise<void> {
  const input = warehouseDiv.locator('input[role="combobox"]')
  await expect(input).toBeVisible({ timeout: 5_000 })
  await input.click()
  await input.fill(searchText)
  if ((await input.getAttribute('aria-expanded')) === 'false') {
    await expect(input).toHaveValue(/HQ-001/)
    return
  }
  await expect(input).toHaveAttribute('aria-expanded', 'true', { timeout: 5_000 })
  const listbox = warehouseDiv.locator('[role="listbox"]')
  await expect(listbox).toBeVisible({ timeout: 5_000 })
  await listbox.locator('[role="option"]').first().click()
  await expect(input).toHaveAttribute('aria-expanded', 'false', { timeout: 5_000 })
}

/** 같은 거래처 DRAFT 2건 병합 발행을 완료한다(성공 토스트까지). */
async function performMerge(page: Page): Promise<void> {
  await expect(page.getByTestId('merge-convert-open')).toBeEnabled({ timeout: 5_000 })
  await page.getByTestId('merge-convert-open').click()
  await expect(page.getByTestId('merge-convert-dialog-body')).toBeVisible({ timeout: 10_000 })

  const partnerInput = page.getByTestId('merge-convert-partner-search')
  await partnerInput.fill('1234567890')
  const partnerListbox = page.getByRole('listbox', { name: '거래처 목록' })
  await expect(partnerListbox).toBeVisible({ timeout: 5_000 })
  await partnerListbox.locator('[role="option"]').filter({ hasText: '1234567890' }).first().click()
  await expect(page.getByTestId('merge-convert-selected-partner')).toContainText('엘에이시스템에어')

  const orderInput = page.getByTestId('merge-convert-order-search')
  for (const orderNumber of ['2026/05/04-1', '2026/05/31-3']) {
    await orderInput.fill(orderNumber)
    const option = page.getByTestId(`merge-convert-order-option-${orderNumber}`)
    await expect(option).toBeVisible({ timeout: 5_000 })
    await option.click()
    await expect(page.getByTestId(`merge-convert-order-chip-${orderNumber}`)).toContainText(orderNumber)
  }
  await selectWarehouseAutocomplete(page.getByTestId('merge-convert-warehouse'), 'HQ')
  const submitBtn = page.getByTestId('merge-convert-submit')
  await expect(submitBtn).toBeEnabled({ timeout: 10_000 })
  await submitBtn.click()
  // 성공 토스트 = 병합 완료 신호
  await expect(page.getByTestId('merge-convert-success-toast')).toBeVisible({ timeout: 10_000 })
}

test.describe('3-D 병합 후 주문 목록 배지 갱신 (invalidate 회귀)', () => {
  test('시나리오 1: 병합 성공 → 새로고침 없이 DRAFT 목록에서 변환 행 사라짐', async ({ page }) => {
    await installAuthMock(page)
    await gotoListAndWait(page) // 기본 DRAFT 필터 — 같은 거래처 DRAFT 2건

    // 변환 전: 같은 거래처 DRAFT 2건 병합 전제 명시.
    const firstDraftRow = page.getByTestId('partner-order-row-2026/05/04-1')
    const secondDraftRow = page.getByTestId('partner-order-row-2026/05/31-3')
    await expect(firstDraftRow).toBeVisible({
      timeout: 10_000,
    })
    await expect(secondDraftRow).toBeVisible()
    await expect(firstDraftRow).toContainText('1234567890')
    await expect(secondDraftRow).toContainText('1234567890')

    await performMerge(page)

    // page.reload() 호출 없음 — invalidate 만으로 갱신되어야 함.
    // 변환된 두 행이 DRAFT 목록에서 사라짐.
    await expect(page.getByTestId('partner-order-row-2026/05/04-1')).toHaveCount(0, {
      timeout: 10_000,
    })
    await expect(page.getByTestId('partner-order-row-2026/05/31-3')).toHaveCount(0)
  })

  test('시나리오 2: 병합 후 전체 필터 → 변환 행이 CONVERTED 배지로 노출', async ({ page }) => {
    await installAuthMock(page)
    await gotoListAndWait(page)
    await performMerge(page)

    // 전체 필터로 전환
    await page.getByTestId('partner-order-list-status-filter').selectOption('')

    // CONVERTED 라벨: clients/desktop/src/renderer/api/sales.ts PARTNER_ORDER_STATUS_LABEL.
    const row = page.getByTestId('partner-order-row-2026/05/04-1')
    await expect(row).toBeVisible({ timeout: 10_000 })
    const badge = row.locator('span').filter({ hasText: '전환완료' }).last()
    await expect(badge).toContainText('전환완료')
  })
})
