/**
 * #825 슬7 — 거래처 우선 주문 병합 UX Playwright mock QA.
 *
 * 이 스펙은 병합 규칙을 바꾸지 않고 UI 후보 모집단만 검증한다.
 * UUID 대신 거래처 코드/명·주문번호·전표번호만 단언한다.
 */
import { expect, test, type Locator, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'
const listUrl = (extra = '') => `${BASE_URL}/#/sales/partner-orders?mockRole=MASTER${extra}`

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
  await expect(page.getByTestId('header-page-title')).toContainText('주문서 관리', { timeout: 15_000 })
}

function mockPermissions(entries: Array<{ pageCode: string; view?: boolean; edit?: boolean }>): string {
  return Buffer.from(JSON.stringify(entries), 'utf8').toString('base64')
}

async function openMergeDialog(page: Page): Promise<void> {
  await expect(page.getByTestId('merge-convert-open')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('input[type="checkbox"][data-testid^="merge-checkbox-"]')).toHaveCount(0)
  await page.getByTestId('merge-convert-open').click()
  await expect(page.getByTestId('merge-convert-dialog-body')).toBeVisible({ timeout: 10_000 })
}

async function selectPartner(page: Page, partnerCode: string, partnerName: string): Promise<void> {
  const input = page.getByTestId('merge-convert-partner-search')
  await expect(input).toBeVisible({ timeout: 5_000 })
  await input.fill(partnerCode)
  const listbox = page.getByRole('listbox', { name: '거래처 목록' })
  await expect(listbox).toBeVisible({ timeout: 5_000 })
  const option = listbox.locator('[role="option"]').filter({ hasText: partnerCode }).first()
  await expect(option).toBeVisible({ timeout: 5_000 })
  await option.click()
  await expect(page.getByTestId('merge-convert-selected-partner')).toContainText(partnerName)
}

async function searchOrder(page: Page, orderNumber: string): Promise<Locator> {
  const input = page.getByTestId('merge-convert-order-search')
  await expect(input).toBeVisible({ timeout: 5_000 })
  await input.fill(orderNumber)
  const option = page.getByTestId(`merge-convert-order-option-${orderNumber}`)
  await expect(option).toBeVisible({ timeout: 5_000 })
  return option
}

async function selectOrder(page: Page, orderNumber: string): Promise<void> {
  const option = await searchOrder(page, orderNumber)
  await expect(option).toContainText(orderNumber)
  await option.click()
  const chip = page.getByTestId(`merge-convert-order-chip-${orderNumber}`)
  await expect(chip).toContainText(orderNumber)
}

async function selectWarehouse(page: Page): Promise<void> {
  const warehouse = page.getByTestId('merge-convert-warehouse')
  const input = warehouse.locator('input[role="combobox"]')
  await expect(input).toBeVisible({ timeout: 5_000 })
  await input.fill('HQ')
  if ((await input.getAttribute('aria-expanded')) === 'false') {
    await expect(input).toHaveValue(/HQ-001/)
    return
  }
  await expect(input).toHaveAttribute('aria-expanded', 'true', { timeout: 5_000 })
  await warehouse.locator('[role="listbox"] [role="option"]').first().click()
  await expect(input).toHaveAttribute('aria-expanded', 'false', { timeout: 5_000 })
}

async function selectTwoPartnerAOrders(page: Page): Promise<void> {
  await selectPartner(page, '1234567890', '엘에이시스템에어')
  await selectOrder(page, '2026/05/04-1')
  await selectOrder(page, '2026/05/31-3')
  await expect(page.getByTestId('merge-convert-selected-order-count')).toContainText('2건 선택됨')
}

test.describe('#825 슬7 주문 병합 거래처 우선 선택', () => {
  test('S7-1: 거래처 A를 양성 확인하면 A 주문 후보만 보이고 B 주문은 0건이다', async ({ page }) => {
    await installAuthMock(page)
    await gotoListAndWait(page)
    await openMergeDialog(page)
    await selectPartner(page, '1234567890', '엘에이시스템에어')

    await expect(page.getByTestId('merge-convert-order-candidate-summary')).toContainText('3건 후보')
    await expect(page.getByTestId('merge-convert-order-candidate-summary')).toContainText('1건은 병합에서 제외됨')
    await expect(page.getByTestId('merge-convert-order-ineligible-reason')).toContainText('단건 전표 발행')
    await selectOrder(page, '2026/05/04-1')

    const otherPartnerOption = page.getByTestId('merge-convert-order-option-2026/05/05-2')
    await expect(otherPartnerOption).toHaveCount(0)
    await expect(page.getByTestId('merge-convert-order-chip-2026/05/04-1')).toContainText('2026/05/04-1')
  })

  test('S7-4: 거래처를 B로 바꾸면 A 주문 칩은 0건이고 B 후보로 동기 전환된다', async ({ page }) => {
    await installAuthMock(page)
    await gotoListAndWait(page)
    await openMergeDialog(page)
    await selectPartner(page, '1234567890', '엘에이시스템에어')
    await selectOrder(page, '2026/05/04-1')

    await selectPartner(page, '2345678901', '강남에어솔루션')
    await expect(page.getByTestId('merge-convert-selected-order-count')).toContainText('0건 선택됨')
    await expect(page.getByTestId('merge-convert-order-chip-2026/05/04-1')).toHaveCount(0)
    await expect(page.getByTestId('merge-convert-order-candidate-summary')).toContainText('1건 후보')
    await selectOrder(page, '2026/05/05-2')
    await expect(page.getByTestId('merge-convert-order-option-2026/05/04-1')).toHaveCount(0)
  })

  test('같은 거래처 2주문 병합 발행 성공은 기존 payload/결과 계약을 유지한다', async ({ page }) => {
    await installAuthMock(page)
    await gotoListAndWait(page)
    await openMergeDialog(page)
    await selectTwoPartnerAOrders(page)
    await selectWarehouse(page)
    const submit = page.getByTestId('merge-convert-submit')
    await expect(submit).toBeEnabled({ timeout: 10_000 })
    await submit.click()
    await expect(page.getByTestId('merge-convert-dialog')).toHaveCount(0, { timeout: 10_000 })
    await expect(page.getByTestId('merge-convert-success-toast')).toContainText('2026/05/31-1')
    await expect(page.getByTestId('merge-convert-success-toast')).toContainText('발행 완료')
  })

  test('S7-2 안전망: BE가 거래처 불일치 409를 반환하면 모달을 유지하고 한국어 오류를 표시한다', async ({ page }) => {
    await installAuthMock(page)
    await gotoListAndWait(page, '&mockMerge409=mixed')
    await openMergeDialog(page)
    await selectTwoPartnerAOrders(page)
    await selectWarehouse(page)
    await page.getByTestId('merge-convert-submit').click()
    const error = page.getByTestId('merge-convert-error')
    await expect(error).toBeVisible({ timeout: 10_000 })
    await expect(error).toContainText('같은 거래처')
    await expect(page.getByTestId('merge-convert-dialog-body')).toBeVisible()
  })

  test('권한 제거: partners.search VIEW가 없으면 병합 버튼을 잠그고 원인을 표시한다', async ({ page }) => {
    await installAuthMock(page)
    const perms = mockPermissions([
      { pageCode: 'sales.partner-order.convert', view: false, edit: true },
      { pageCode: 'sales.partner-order.list', view: true, edit: true },
    ])
    await gotoListAndWait(page, `&mockPerms=${encodeURIComponent(perms)}`)

    const openButton = page.getByTestId('merge-convert-open')
    await expect(openButton).toBeVisible({ timeout: 10_000 })
    await expect(openButton).toBeDisabled()
    await expect(openButton).toHaveAttribute('title', '거래처 검색 권한이 필요합니다')
    await expect(page.getByTestId('merge-convert-permission-hint')).toContainText('partners.search VIEW')
  })

  test('재고 부족 409는 기존 병합 오류 UX를 유지한다', async ({ page }) => {
    await installAuthMock(page)
    await gotoListAndWait(page, '&mockMerge409=stock')
    await openMergeDialog(page)
    await selectTwoPartnerAOrders(page)
    await selectWarehouse(page)
    await page.getByTestId('merge-convert-submit').click()
    await expect(page.getByTestId('merge-convert-error')).toContainText('재고 부족', { timeout: 10_000 })
    await expect(page.getByTestId('merge-convert-dialog-body')).toBeVisible()
  })

  test('기존 단일 주문 전환 화면은 병합 UX 변경으로 사라지지 않는다', async ({ page }) => {
    await installAuthMock(page)
    await page.goto(`${BASE_URL}/#/sales/partner-orders/ord-draft?mockRole=MASTER`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('header-page-title')).toContainText('주문서', { timeout: 15_000 })
    await expect(page.getByTestId('partner-order-convert-open')).toContainText('출고전표 전환')
    await expect(page.getByTestId('partner-order-convert-open')).toBeEnabled()
  })
})
