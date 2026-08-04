import { expect, test } from '@playwright/test'

test.describe('R18 기존 판매전표 SlipFormPage 편집', () => {
  test('DRAFT 전표는 trailing 빈행에서 품목을 추가하고 기존 수정 PUT 후 상세로 돌아온다', async ({ page }) => {
    await page.goto('/#/sales/slip-005/edit?mockRole=MASTER', { waitUntil: 'domcontentloaded' })

    const form = page.locator('.sales-form-polish')
    await expect(form.getByRole('heading', { name: '판매전표 수정' })).toBeVisible({ timeout: 15_000 })
    await expect(form.getByRole('combobox', { name: '라인 4 품목' })).toBeVisible()

    const blankProduct = form.getByRole('combobox', { name: '라인 4 품목' })
    await blankProduct.scrollIntoViewIfNeeded()
    await blankProduct.fill('AJ040RXH4BC1')
    await expect(page.getByRole('listbox', { name: '품목 목록' })).toBeVisible({ timeout: 10_000 })
    await blankProduct.press('ArrowDown')
    await blankProduct.press('Enter')

    await expect(form.getByRole('combobox', { name: '라인 5 품목' })).toBeVisible()
    await form.getByRole('button', { name: '저장' }).click()
    await expect(page).toHaveURL(/\/\#\/sales\/slip-005$/)

    const update = await page.evaluate(() => (globalThis as { __SAMHAN_LAST_SLIP_UPDATE?: { lines?: unknown[] } }).__SAMHAN_LAST_SLIP_UPDATE)
    expect(update?.lines).toHaveLength(4)
    expect(update?.lines?.every((line: any) => line.productId && line.quantity > 0)).toBe(true)
  })

  test('DRAFT가 아닌 전표는 편집 진입 시 상태와 사유를 보여준다', async ({ page }) => {
    await page.goto('/#/sales/slip-001/edit?mockRole=MASTER', { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('alert')).toContainText('현재 상태(PROCESSING)에서는 전표를 수정할 수 없습니다')
    await expect(page.getByRole('alert')).toContainText('DRAFT')
    await expect(page.getByRole('button', { name: '저장' })).toHaveCount(0)
  })

  test('상세의 행 추가는 실제 SlipFormPage 편집 라우트로 이동한다', async ({ page }) => {
    await page.goto('/#/sales/slip-005?mockRole=MASTER', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.slip-line-no-btn').first()).toBeVisible({ timeout: 15_000 })
    await page.locator('.slip-line-no-btn').first().click()
    await page.getByRole('toolbar', { name: '선택 라인 액션' }).getByRole('button', { name: '행 추가' }).click()
    await expect(page).toHaveURL(/\/\#\/sales\/slip-005\/edit$/)
    await expect(page.locator('.sales-form-polish').getByRole('heading', { name: '판매전표 수정' })).toBeVisible()
  })
})
