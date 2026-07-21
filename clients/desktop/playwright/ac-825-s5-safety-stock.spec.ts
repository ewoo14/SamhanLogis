/**
 * #825 슬5 R4 SafetyStock mock hard gate.
 *
 * 미선택/전체 전환과 전체 칩 제거 후 포커스 복귀를 실제 renderer DOM에서 확인한다.
 */
import { expect, test } from '@playwright/test'

test.describe('AC-825-S5 안전재고 범위 mock 회귀', () => {
  test('미선택 잠금 → 전체 선택/제거와 포커스 복귀', async ({ page }) => {
    await page.goto('/#/inventory/safety-stock-alerts?mockRole=MANAGER', {
      waitUntil: 'domcontentloaded',
    })

    const config = page.getByTestId('safety-stock-config')
    await expect(config).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('safety-stock-scope-hint')).toBeVisible()
    await expect(page.getByTestId('safety-stock-config-save')).toBeDisabled()

    const allChip = page.getByTestId('safety-stock-all-chip')
    const allButton = allChip.locator('[role="button"]').first()
    await expect(allButton).toHaveAttribute('aria-pressed', 'false')
    await allChip.click()
    await expect(allButton).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('safety-stock-config-warehouse')).toBeDisabled()

    await page.getByRole('button', { name: '전체 창고 범위 제거' }).click()
    await expect(page.getByTestId('safety-stock-scope-hint')).toBeVisible()
    await expect(allButton).toBeFocused()
  })
})
