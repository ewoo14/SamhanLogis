/**
 * B1-B DS 독립 a11y/layout — CI 포함 mock hard gate.
 *
 * 실 `/sales/new` 화면에서 semantic row 계약과 Partner/Product matchBadge의
 * 360/390px 비클립 및 1440px 노출 순서를 함께 검증한다. real-qa 경로가 아니다.
 */
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'

const EPSILON = 1
const MOCK_PRODUCT_AJ040_ID = '2e40fa30-10b2-3a9b-a99c-570ac92287ad'

async function gotoSlipNewPage(page: Page, requireDesktopLineTable = false): Promise<void> {
  await page.goto('/#/sales/new?mockRole=MANAGER', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('header-page-title')).toHaveText('새 판매전표', { timeout: 15_000 })
  if (requireDesktopLineTable) {
    await expect(page.locator('.sfp-line-table')).toBeVisible()
  }
}

async function openPartnerOption(page: Page, query: string): Promise<Locator> {
  const input = page.getByRole('combobox', { name: '거래처' })
  await input.fill(query)
  const listbox = page.getByRole('listbox', { name: '거래처 목록' })
  await expect(listbox).toBeVisible({ timeout: 5_000 })
  const option = listbox.getByRole('option').first()
  await expect(option).toBeVisible()
  return option
}

async function openProductSelectionDialog(page: Page, query: string): Promise<Locator> {
  const input = page.getByRole('combobox', { name: /라인 1 품목/ })
  await input.fill(query)
  const dialog = page.getByRole('dialog', { name: '품목 검색 결과' })
  await expect(dialog).toBeVisible({ timeout: 5_000 })
  return dialog
}

async function expectBadgeInsideOption(option: Locator, badgeLabel: string): Promise<void> {
  const badge = option.locator(`[aria-label="매치 필드 ${badgeLabel}"]`)
  await expect(badge, `${badgeLabel} badge`).toBeVisible()
  const [optionBox, badgeBox] = await Promise.all([option.boundingBox(), badge.boundingBox()])
  expect(optionBox, `${badgeLabel} option bbox`).not.toBeNull()
  expect(badgeBox, `${badgeLabel} badge bbox`).not.toBeNull()
  expect(badgeBox!.x).toBeGreaterThanOrEqual(optionBox!.x - EPSILON)
  expect(badgeBox!.y).toBeGreaterThanOrEqual(optionBox!.y - EPSILON)
  expect(badgeBox!.x + badgeBox!.width).toBeLessThanOrEqual(optionBox!.x + optionBox!.width + EPSILON)
  expect(badgeBox!.y + badgeBox!.height).toBeLessThanOrEqual(optionBox!.y + optionBox!.height + EPSILON)
}

test.describe('B1-B DS a11y/layout mock hard gate', () => {
  test('SlipForm line table has no aria-required-parent violation', async ({ page }) => {
    await gotoSlipNewPage(page, true)

    const results = await new AxeBuilder({ page })
      .include('.sfp-line-table')
      .analyze()
    const requiredParentViolations = results.violations.filter(
      (violation) => violation.id === 'aria-required-parent',
    )
    expect(requiredParentViolations, 'sfp-line-table aria-required-parent 회귀').toHaveLength(0)
  })

  test('Partner inline badges and Product modal fields stay usable at 360px and 390px', async ({ page }) => {
    for (const width of [360, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await gotoSlipNewPage(page)

      await expectBadgeInsideOption(await openPartnerOption(page, '엘에이'), '상호')
      await expectBadgeInsideOption(await openPartnerOption(page, '1234567890'), '코드')
      await expectBadgeInsideOption(await openPartnerOption(page, '45-678'), '사업자번호')
      const productDialog = await openProductSelectionDialog(page, 'AJ')
      await expect(productDialog.getByRole('columnheader', { name: '모델명' })).toBeVisible()
      await expect(productDialog.getByRole('columnheader', { name: '품목명' })).toBeVisible()
      await expect(productDialog.getByText('AJ040RXH4BC1', { exact: true })).toBeVisible()
      await expect(productDialog).not.toContainText(MOCK_PRODUCT_AJ040_ID)
      await page.keyboard.press('Escape')
    }
  })

  test('1440px Partner/Product options preserve field exposure and separator order', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoSlipNewPage(page, true)

    const partnerOption = await openPartnerOption(page, '엘에이')
    const partnerText = (await partnerOption.textContent()) ?? ''
    expect(partnerText.indexOf('엘에이시스템에어')).toBeLessThan(partnerText.indexOf('1234567890'))
    expect(partnerText.indexOf('1234567890')).toBeLessThan(partnerText.indexOf('123-45-67890'))
    await expect(partnerOption.locator('[class*="optionSep"]')).toHaveCount(2)
    await expect(partnerOption).toContainText('엘에이시스템에어')
    await expect(partnerOption).toContainText('1234567890')
    await expect(partnerOption).toContainText('123-45-67890')

    const productDialog = await openProductSelectionDialog(page, 'AJ')
    await expect(productDialog.getByRole('columnheader', { name: '모델명' })).toBeVisible()
    await expect(productDialog.getByRole('columnheader', { name: '품목명' })).toBeVisible()
    const productRow = productDialog.getByRole('row').filter({ hasText: 'AJ040RXH4BC1' }).first()
    await expect(productRow).toContainText('시스템에어컨 4Way 4HP')
    await expect(productDialog).not.toContainText(MOCK_PRODUCT_AJ040_ID)
  })
})
