import { expect, test } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'

test.describe('모바일 슬2 Drawer 셸', () => {
  test('390px 모바일에서 햄버거로 7분류 사이드바 Drawer 를 열고 자동 닫힘을 수행한다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`${BASE_URL}/#/?mockRole=MASTER`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})

    const toggle = page.getByTestId('app-drawer-toggle')
    const drawer = page.locator('#app-drawer')
    const backdrop = page.getByTestId('app-drawer-backdrop')

    await expect(toggle).toBeVisible()
    await expect(drawer).not.toHaveClass(/is-open/)

    const salesCategory = page.getByTestId('sidebar-category-toggle-판매')
    await expect(salesCategory).not.toBeVisible()

    await toggle.click()
    await expect(drawer).toHaveClass(/is-open/)
    await expect(salesCategory).toBeVisible()

    if ((await salesCategory.getAttribute('aria-expanded')) !== 'true') {
      await salesCategory.click()
    }
    await page.getByTestId('sidebar-sales').click()
    await expect(page).toHaveURL(/#\/sales(?:\?.*)?$/)
    await expect(drawer).not.toHaveClass(/is-open/)

    await toggle.click()
    await expect(drawer).toHaveClass(/is-open/)
    await backdrop.click()
    await expect(drawer).not.toHaveClass(/is-open/)

    await toggle.click()
    await expect(drawer).toHaveClass(/is-open/)
    await page.keyboard.press('Escape')
    await expect(drawer).not.toHaveClass(/is-open/)
  })

  test('1280px 데스크탑에서는 햄버거가 숨겨지고 사이드바가 정적으로 노출된다', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(`${BASE_URL}/#/?mockRole=MASTER`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})

    await expect(page.getByTestId('app-drawer-toggle')).toBeHidden()
    await expect(page.locator('#app-drawer')).toBeVisible()
    await expect(page.locator('#app-drawer')).not.toHaveClass(/is-open/)
  })
})
