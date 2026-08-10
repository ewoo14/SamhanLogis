/**
 * #825 S2 슬라이스 1 — 대표 소비처 3개 공용 입력 계약 mock QA.
 * wrapper 기본값은 건드리지 않고 소비처별 opt-in만 검증한다.
 */
import { expect, test, type Page } from '@playwright/test'

const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i
const BASE = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'

async function gotoMock(page: Page, hash: string, withPermissions = true) {
  const permissions = Buffer.from(JSON.stringify([
    { pageCode: 'accounting.bank-matching', view: true, edit: true },
    { pageCode: 'accounting.bank-transactions', view: true, edit: true },
    { pageCode: 'admin.approval-line-config', view: true, edit: true },
    { pageCode: 'sales.partner-orders', view: true, edit: true },
  ]), 'utf8').toString('base64')
  const query = withPermissions ? `?mockRole=MASTER&mockPerms=${permissions}` : '?mockRole=MASTER'
  await page.goto(`${BASE}/${query}${hash}`, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('main.app-main')).toBeVisible({ timeout: 15_000 })
}

test.describe('#825 S2 슬라이스 1 대표 소비처 contract mock', () => {
  test('거래처 단수 BankTransactionPage — 2건+ 모달에서 하나만 확정하고 UUID는 숨긴다', async ({ page }) => {
    await gotoMock(page, '#/accounting/bank-transactions')
    const filterDates = page.locator('input[type="date"]')
    await filterDates.nth(2).fill('2026-06-01')
    await filterDates.nth(3).fill('2026-06-30')
    await page.getByRole('button', { name: '조회' }).click()
    const input = page
      .getByTestId('bank-transaction-partner-search-CSV_IMPORT-mock-bank-20260624-005')
      .getByRole('combobox')
    await expect(input).toBeVisible({ timeout: 10_000 })
    await input.fill('P')

    const dialog = page.getByRole('dialog', { name: '거래처 검색 결과' })
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await expect(dialog.locator('input[type="radio"]')).not.toHaveCount(0)
    expect(await dialog.locator('input[type="radio"]').count()).toBeGreaterThan(1)
    await dialog.locator('input[type="radio"]').first().check()
    await dialog.getByRole('button', { name: '선택 확정' }).click()
    await expect(dialog).toBeHidden()
    expect((await page.locator('body').textContent()) ?? '').not.toMatch(UUID_PATTERN)
  })

  test('결재자 복수 ApprovalLineConfigPage — 2건+ 모달 일괄확정과 칩을 유지한다', async ({ page }) => {
    await gotoMock(page, '#/admin/approval-line-config')
    const input = page.getByTestId('approval-role-approver-search-출고자')
    await expect(input).toBeVisible({ timeout: 10_000 })
    await input.fill('팀')

    const dialog = page.getByRole('dialog', { name: '출고자 결재자 검색 결과' })
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await expect(dialog.locator('input[type="checkbox"]')).toHaveCount(3)
    await dialog.locator('input[type="checkbox"]').all().then(async (boxes) => {
      await boxes[0]!.check()
      await boxes[1]!.check()
    })
    await dialog.getByRole('button', { name: '선택 확정' }).click()
    await expect(page.getByTestId('approval-role-approver-chip')).toHaveCount(2)
    expect((await page.locator('body').textContent()) ?? '').not.toMatch(UUID_PATTERN)
  })

  test('창고 단수 MergeConvertDialog — 다건 취소 후 1건은 즉시확정한다', async ({ page }) => {
    await gotoMock(page, '#/sales/partner-orders', false)
    await page.getByTestId('merge-convert-open').click()
    await expect(page.getByTestId('merge-convert-dialog-body')).toBeVisible({ timeout: 10_000 })
    const input = page.getByTestId('merge-convert-warehouse').getByRole('combobox')

    await input.fill('창')
    const dialog = page.getByRole('dialog', { name: '출고 창고 검색 결과' })
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await dialog.getByRole('button', { name: '취소' }).click()
    await expect(dialog).toBeHidden()

    await input.fill('HQ')
    await expect(input).toHaveValue(/HQ-001/)
    await expect(dialog).toBeHidden()
    expect((await page.locator('body').textContent()) ?? '').not.toMatch(UUID_PATTERN)
  })
})
