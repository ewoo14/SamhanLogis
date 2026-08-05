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
    // 단일 후보는 R29에서 목록을 거치지 않고 즉시 확정된다.
    await expect(input).toHaveValue('AJ040RXH4BC1')
    await expect(page.getByRole('listbox', { name: '품목 목록' })).not.toBeVisible()
  })

  test('견적 신규 화면은 trailing 빈행을 두고, 후보 확정 후 다음 빈행을 만든다', async ({ page }) => {
    await page.goto('/#/sales/estimates/new?mockRole=MASTER', {
      waitUntil: 'domcontentloaded',
    })

    await expect(page.getByTestId('estimate-form-line-0')).toBeVisible({ timeout: 15_000 })
    const partner = page.getByRole('combobox', { name: '거래처 검색' })
    await partner.fill('삼')
    const partnerOptions = page.getByRole('listbox', { name: '거래처 목록' }).locator('li[id^="ds-aac-list-"]')
    await expect(partnerOptions.first()).toBeVisible({ timeout: 10_000 })
    await partner.press('ArrowDown')
    await partner.press('Enter')
    await page.screenshot({ path: test.info().outputPath('02-new-open-trailing-blank.png'), fullPage: true })
    const lineModel = page.getByTestId('estimate-form-line-0').getByRole('combobox', { name: '라인 1 모델명' })
    await lineModel.click()
    await lineModel.fill('AJ')
    const productDialog = page.getByRole('dialog', { name: '품목 검색 결과' })
    await expect(productDialog).toBeVisible({ timeout: 10_000 })
    await productDialog.getByRole('radio').first().check()
    await productDialog.getByRole('button', { name: '선택 확정' }).click()
    await expect(page.getByTestId('estimate-form-line-1')).toBeVisible({ timeout: 10_000 })
    await expect(lineModel).toHaveValue('AJ040RXH4BC1')
    // 현재 mock 후보의 규격 값은 데이터 fixture에 따라 공란일 수 있으므로,
    // 현재 사용자 계약인 규격 입력 surface가 확정 라인에 유지되는지 단정한다.
    await expect(page.getByRole('textbox', { name: '라인 1 규격' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: '라인 1 단가' })).toHaveValue('1850000')

    await page.screenshot({ path: test.info().outputPath('03-new-filled-next-blank.png'), fullPage: true })
  })
})
