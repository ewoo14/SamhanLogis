/**
 * PR #1063 mock renderer hard gate.
 *
 * ProductAutocomplete 은 공용 design-system 경로를 실제 Chromium에서 사용하므로
 * Vitest DOM 테스트만으로 끝내지 않고 좁은 품목 입력 화면과 수정 견적 화면에서
 * 모달/빈행의 사용자 표면을 함께 확인한다.
 */
import { expect, test } from '@playwright/test'

test.describe('PR #1063 전표 라인 입력 UX mock', () => {
  test('후보 2건 이상은 UUID 없이 읽을 수 있는 품목 표 모달을 연다', async ({ page }) => {
    await page.goto('/#/inventory/safety-stock-alerts?mockRole=MASTER', {
      waitUntil: 'domcontentloaded',
    })

    await expect(page.getByTestId('safety-stock-config')).toBeVisible({ timeout: 15_000 })
    const input = page.getByRole('combobox', { name: '제품' })
    await input.fill('AJ')

    const dialog = page.getByRole('dialog', { name: '품목 검색 결과' })
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await expect(dialog.getByRole('table')).toBeVisible()
    await expect(dialog.getByRole('columnheader', { name: '모델명' })).toBeVisible()
    await expect(dialog.getByRole('columnheader', { name: '품목명' })).toBeVisible()
    await expect(dialog.getByRole('columnheader', { name: '규격' })).toBeVisible()
    await expect(dialog.getByRole('columnheader', { name: '단가' })).toBeVisible()
    await expect(dialog.getByText('AJ040RXH4BC1', { exact: true })).toBeVisible()
    await expect(dialog.getByText('1,850,000원', { exact: true })).toBeVisible()
    await expect(dialog).not.toContainText('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa040')

    await dialog.screenshot({ path: test.info().outputPath('01-product-selection-modal.png') })

    await dialog.getByRole('button', { name: '취소' }).click()
    await expect(dialog).toBeHidden()
    await input.fill('AJ040RXH4BC1')
    const dropdown = page.getByRole('listbox', { name: '품목 목록' })
    const option = dropdown.getByRole('option').first()
    await expect(option).toContainText('AJ040RXH4BC1')
    await expect(option).toContainText('시스템에어컨 4Way 4HP')
    const layout = await option.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }))
    expect(layout.clientWidth).toBeGreaterThan(0)
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1)
  })

  test('견적 수정 화면은 처음부터 trailing 빈행을 두고, 확정 후 다음 빈행을 만든다', async ({ page }) => {
    await page.goto('/#/sales/estimates/est-001/edit?mockRole=MASTER', {
      waitUntil: 'domcontentloaded',
    })

    await expect(page.getByTestId('estimate-form-line-0')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('estimate-form-line-1')).toBeVisible()
    await expect(page.getByTestId('estimate-form-line-2')).toBeVisible()
    await page.screenshot({ path: test.info().outputPath('02-edit-open-trailing-blank.png'), fullPage: true })
    await page.getByTestId('estimate-form-line-2-model').fill('AJ040RXH4BC1')
    await page.getByTestId('estimate-form-line-2-model').blur()
    await expect(page.getByTestId('estimate-form-line-3')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[data-testid^="estimate-form-line-"][data-price-source]')).toHaveCount(4)

    await page.screenshot({ path: test.info().outputPath('03-edit-filled-next-blank.png'), fullPage: true })
  })

  test('판매전표 수정 빈행은 ProductAutocomplete로 품목을 확정하고 새 trailing 빈행을 만든다', async ({ page }) => {
    await page.goto('/#/sales/slip-005?mockRole=MASTER', { waitUntil: 'domcontentloaded' })
    await page.getByTestId('sales-slip-edit-button').click()
    const editLines = page.getByTestId('sales-slip-edit-lines')
    await expect(editLines).toBeVisible({ timeout: 15_000 })

    const productInputs = editLines.getByRole('combobox')
    const initialProductInputCount = await productInputs.count()
    const blankProductInput = productInputs.last()
    await blankProductInput.fill('AJ040RXH4BC1')
    await page.waitForTimeout(500)
    await expect(page.getByRole('listbox', { name: '품목 목록' })).toBeVisible()
    await page.getByRole('listbox', { name: '품목 목록' }).getByRole('option').first().click()

    await expect(editLines.getByRole('combobox')).toHaveCount(initialProductInputCount + 1)
    await expect(page.getByRole('dialog', { name: '품목 검색 결과' })).toHaveCount(0)
    await expect(editLines.getByRole('combobox').last()).toHaveValue('')
  })
})
