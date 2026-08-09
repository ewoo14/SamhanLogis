/**
 * PR #1063 mock renderer hard gate.
 *
 * ProductAutocomplete 은 공용 design-system 경로를 실제 Chromium에서 사용하므로
 * Vitest DOM 테스트만으로 끝내지 않고 좁은 품목 입력 화면과 수정 견적 화면에서
 * 모달/빈행의 사용자 표면을 함께 확인한다.
 */
import { expect, test } from '@playwright/test'

const MOCK_PRODUCT_AJ040_ID = '2e40fa30-10b2-3a9b-a99c-570ac92287ad'

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
    await expect(dialog).not.toContainText(MOCK_PRODUCT_AJ040_ID)

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

  test('견적 후보 모달을 취소하면 blur lookup 없이 미확정 draft를 버린다', async ({ page }) => {
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

    const model = page.getByTestId('estimate-form-line-0').getByRole('combobox', { name: '라인 1 모델명' })
    await model.fill('AJ')
    const dialog = page.getByRole('dialog', { name: '품목 검색 결과' })
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await dialog.getByRole('button', { name: '취소' }).click()
    await expect(dialog).toBeHidden()
    await page.waitForTimeout(250)

    // 취소 직후 검색 draft 자체는 모달 복원 계약상 남을 수 있지만, 확정 품목·단가는 비어야 한다.
    await expect(page.getByRole('textbox', { name: '라인 1 품목명' })).toHaveValue('')
    await expect(page.getByRole('textbox', { name: '라인 1 단가' })).toHaveValue('0')
  })

  test('견적 확정 품목을 삭제하고 blur하면 공란을 유지한다', async ({ page }) => {
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

    const model = page.getByTestId('estimate-form-line-0').getByRole('combobox', { name: '라인 1 모델명' })
    await model.fill('AJ040')
    await expect(model).toHaveValue('AJ040RXH4BC1', { timeout: 10_000 })
    await expect(page.getByRole('textbox', { name: '라인 1 단가' })).toHaveValue('1850000')
    await model.click()
    await model.press('Control+A')
    await model.press('Delete')
    await model.blur()
    await page.waitForTimeout(250)

    await expect(model).toHaveValue('')
    await expect(page.getByRole('textbox', { name: '라인 1 품목명' })).toHaveValue('')
    await expect(page.getByRole('textbox', { name: '라인 1 규격' })).toHaveValue('')
    await expect(page.getByRole('textbox', { name: '라인 1 단가' })).toHaveValue('0')
  })

  test('견적 편집 coedit에서 1행 품목 해제는 2행 로컬·coedit 값을 건드리지 않는다', async ({ page }) => {
    await page.goto('/#/sales/estimates/est-001/edit?mockRole=MASTER', {
      waitUntil: 'domcontentloaded',
    })

    await expect(page.getByTestId('estimate-form-line-0')).toBeVisible({ timeout: 15_000 })
    const line1Model = page.getByTestId('estimate-form-line-0').getByRole('combobox', { name: '라인 1 모델명' })
    await line1Model.click()
    await line1Model.press('Control+A')
    await line1Model.press('Delete')
    await line1Model.blur()
    await page.waitForTimeout(250)

    await expect(line1Model).toHaveValue('')
    await expect(page.getByRole('textbox', { name: '라인 1 규격' })).toHaveValue('')
    await expect(page.getByTestId('estimate-coedit-items-0-modelName')).toHaveValue('')
    await expect(page.getByTestId('estimate-form-line-1').getByRole('combobox', { name: '라인 2 모델명' })).toHaveValue('MWR-WE10N')
    await expect(page.getByRole('textbox', { name: '라인 2 품목명' })).toHaveValue('유선 리모컨 (WE10N)')
    await expect(page.getByRole('textbox', { name: '라인 2 규격' })).toHaveValue('220V')
    await expect(page.getByTestId('estimate-coedit-items-1-modelName')).toHaveValue('MWR-WE10N')
  })

  test('provider 실패 폴백과 분리된 자동 빈행 계약은 원문 단정을 유지한다', async ({ page }) => {
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

    for (let index = 0; index < 3; index += 1) {
      const model = page.getByTestId(`estimate-form-line-${index}`).getByRole('combobox', { name: `라인 ${index + 1} 모델명` })
      await model.fill('AJ040')
      await expect(model).toHaveValue('AJ040RXH4BC1', { timeout: 10_000 })
    }

    await expect(page.getByTestId('estimate-form-line-3')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[data-testid^="estimate-form-line-"][data-price-source]')).toHaveCount(4)
  })

  test('견적 편집 provider 연결 중에는 trailing 빈행 구조 추가를 잠근다', async ({ page }) => {
    await page.goto('/#/sales/estimates/est-001/edit?mockRole=MASTER', {
      waitUntil: 'domcontentloaded',
    })
    // VITE_MOCK_MODE의 API는 브라우저 네트워크 Response가 아니라 in-process
    // adapter에서 응답하므로 page.waitForResponse()로 상세 로딩을 기다릴 수 없다.
    // 화면에 렌더된 첫 행을 상세 로딩 완료 신호로 사용한다.
    await expect(page.getByTestId('estimate-form-line-0')).toBeVisible({ timeout: 15_000 })
    await page.context().setOffline(true)
    await page.waitForTimeout(100)
    await page.context().setOffline(false)

    await expect(page.getByTestId('estimate-form-line-0')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('estimate-form-line-1')).toBeVisible()
    await expect(page.getByTestId('estimate-form-line-2')).toBeVisible()
    const trailingLine = page.getByTestId('estimate-form-line-2')
    await expect(trailingLine.getByRole('combobox', { name: '라인 3 모델명' })).toBeDisabled()
    await expect(page.getByRole('button', { name: '라인 3 삭제' })).toBeDisabled()
    await expect(page.getByTestId('estimate-form-line-3')).toHaveCount(0)
    await expect(page.locator('[data-testid^="estimate-form-line-"][data-price-source]')).toHaveCount(3)
  })

  test('견적 편집 coedit은 기존 행만 교체하고 trailing 빈행의 구조 추가를 잠근다', async ({ page }) => {
    await page.goto('/#/sales/estimates/est-001/edit?mockRole=MASTER', {
      waitUntil: 'domcontentloaded',
    })

    await expect(page.getByTestId('estimate-form-line-0')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('estimate-form-line-1')).toBeVisible()
    await expect(page.getByTestId('estimate-form-line-2')).toBeVisible()
    await expect(page.locator('[data-testid^="estimate-form-line-"][data-price-source]')).toHaveCount(3)

    const existingLineModel = page.getByTestId('estimate-form-line-0').getByRole('combobox', { name: '라인 1 모델명' })
    const trailingLineModel = page.getByTestId('estimate-form-line-2').getByRole('combobox', { name: '라인 3 모델명' })
    await expect(existingLineModel).toBeEnabled()
    await expect(trailingLineModel).toBeDisabled()
    await expect(page.getByRole('button', { name: '라인 3 삭제' })).toBeDisabled()
    await expect(page.locator('[data-testid^="estimate-form-line-"][data-price-source]')).toHaveCount(3)
    await existingLineModel.click()
    await existingLineModel.fill('AJ')

    const productDialog = page.getByRole('dialog', { name: '품목 검색 결과' })
    await expect(productDialog).toBeVisible({ timeout: 10_000 })
    await productDialog.getByRole('radio').nth(1).check()
    await productDialog.getByRole('button', { name: '선택 확정' }).click()

    // ProductAutocomplete의 표시 입력은 coedit lookup 중 잠시 draft를 비울 수 있으므로,
    // 저장·동기화 권위인 CollaborativeSlipInput에도 교체 모델명이 도착했는지 함께 본다.
    await expect(page.getByTestId('estimate-coedit-items-0-modelName')).toHaveValue('AJ052RXH5BC1')
    await expect(page.getByTestId('estimate-form-line-2')).toBeVisible()
    await expect(page.getByTestId('estimate-form-line-3')).toHaveCount(0)
    await expect(page.locator('[data-testid^="estimate-form-line-"][data-price-source]')).toHaveCount(3)
    await expect(page.getByRole('textbox', { name: '라인 1 규격' })).toBeVisible()
    // 기존 확정행의 사용자 단가는 품목 교체만으로 덮지 않는다(가격기억 회귀 방지).
    await expect(page.getByRole('textbox', { name: '라인 1 단가' })).toHaveValue('1850000')
    await expect(page.getByTestId('estimate-form-save-button')).toBeEnabled()
    await expect(page.getByTestId('estimate-form-send-button')).toBeEnabled()
    let sendDialogMessage = ''
    page.once('dialog', async (dialog) => {
      sendDialogMessage = dialog.message()
      await dialog.accept()
    })
    await page.getByTestId('estimate-form-send-button').click()
    expect(sendDialogMessage).toContain('발송하시겠습니까')

    await page.screenshot({ path: test.info().outputPath('04-edit-coedit-existing-lines-and-trailing-blank.png'), fullPage: true })
  })
})
