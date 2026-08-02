/** #1049 품목 검색 결과 선택 모달 mock 회귀 스위트. */
import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i

async function installAuth(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({
          token: 'playwright-token', userId: '00000000-0000-0000-0000-000000010001',
          role: 'MASTER', fullName: '테스트사용자', partnerCode: null,
        }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  })
}

async function gotoEstimateItems(page: Page): Promise<void> {
  await installAuth(page)
  await page.goto(`${BASE_URL}/#/products/estimate-items?mockRole=MASTER`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('estimate-items-query-button')).toBeVisible({ timeout: 15_000 })
  await page.getByTestId('estimate-items-query-button').click()
  await expect(page.getByTestId('estimate-items-table').locator('tbody tr').first()).toBeVisible({ timeout: 10_000 })
  await page.getByTestId('estimate-items-category-tab-SINGLE_SET').click()
  await expect(page.getByTestId('estimate-items-category-tab-SINGLE_SET')).toHaveAttribute('aria-selected', 'true')
}

function input(page: Page) {
  return page.getByRole('combobox', { name: '기초품목 선택' })
}

test.describe('#1049 부분 검색 모달 복수선택', () => {
  test('A — 결과 1건은 모달 없이 바로 칩으로 확정된다', async ({ page }) => {
    await gotoEstimateItems(page)
    await input(page).fill('AJ040RXH4BC1')
    await expect(page.getByText('AJ040RXH4BC1').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('option', { name: /검색 중/ })).toHaveCount(0)
  })

  test('B·C·D·F — 2건 이상은 모달에서 키보드 복수 선택하고 UUID 없이 확정한다', async ({ page }) => {
    await gotoEstimateItems(page)
    await input(page).fill('AJ')

    const dialog = page.getByRole('dialog', { name: '품목 검색 결과' })
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    const checkboxes = dialog.getByRole('checkbox')
    expect(await checkboxes.count()).toBeGreaterThan(1)
    expect((await dialog.textContent()) ?? '').not.toMatch(UUID_PATTERN)

    await checkboxes.nth(0).focus()
    await page.keyboard.press('Space')
    await checkboxes.nth(1).focus()
    await page.keyboard.press('Space')
    await dialog.getByRole('button', { name: '선택 확정' }).focus()
    await page.keyboard.press('Enter')

    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('option', { name: /검색 중/ })).toHaveCount(0)
    await expect(page.getByTestId('multiselect-chip-count')).toHaveText('2개 선택됨')
    const selectedChipValues = await page.getByTestId('multiselect-chip-count').locator('..').locator('[title]').allTextContents()
    expect(selectedChipValues.length).toBe(2)
    await input(page).fill('AJ')
    await expect(page.getByRole('option', { name: /검색 중/ })).toHaveCount(0)
    expect(await page.getByTestId('multiselect-chip-count').locator('..').locator('[title]').allTextContents()).toEqual(selectedChipValues)
    expect((await page.locator('body').textContent()) ?? '').not.toMatch(UUID_PATTERN)
  })

  test('C — 모달을 Escape로 취소해도 검색 중 dropdown 잔재가 없다', async ({ page }) => {
    await gotoEstimateItems(page)
    await input(page).fill('AJ')

    const dialog = page.getByRole('dialog', { name: '품목 검색 결과' })
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await page.keyboard.press('Escape')

    await expect(dialog).toHaveCount(0)
    await expect(input(page)).toHaveValue('AJ')
    await expect(page.getByRole('option', { name: /검색 중/ })).toHaveCount(0)
  })
})
