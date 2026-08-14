import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const SHOTS = resolveQaShotsDir(
  path.resolve(process.cwd(), '../../docs/qa/2026-08-12-1068-sol-review-real-qa'),
)
const UUID_TEXT = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i

async function openNewSalesSlip(page: Page, query = '') {
  await page.goto(`/#/sales/new${query}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '새 출고전표' }).last()).toBeVisible()
  await expect(page.getByTestId('slip-partner-header-autofill')).toBeVisible()
}

async function selectPartner(page: Page) {
  const input = page.getByRole('combobox', { name: '거래처' })
  await input.fill('1234567890')
  await expect(page.getByText('엘에이시스템에어')).toBeVisible()
  await page.getByText('엘에이시스템에어').last().click()
}

async function fillRequiredFields(page: Page) {
  const warehouse = page.getByRole('combobox', { name: '출고 창고' })
  await warehouse.fill('HQ')
  await warehouse.press('ArrowDown')
  await warehouse.press('Enter')

  const product = page.getByRole('combobox', { name: '라인 1 품목' })
  await product.fill('AJ')
  const dialog = page.getByRole('dialog', { name: '품목 검색 결과' })
  await expect(dialog).toBeVisible({ timeout: 15_000 })
  await dialog.getByRole('radio').first().check()
  await dialog.getByRole('button', { name: '선택 확정' }).click()
  await expect(product).toHaveValue('AJ040RXH4BC1', { timeout: 15_000 })
}

test.describe('1068 SOL 적대검증 real-qa', () => {
  test('0원은 금액 문자열로 보인다', async ({ page }) => {
    await openNewSalesSlip(page, '?mockAccountingZero=1')
    await selectPartner(page)
    await expect(page.getByTestId('slip-form-opening-balance')).toHaveText('0원')
    await page.screenshot({ path: path.join(SHOTS, '01-zero-balance-real-qa.png'), fullPage: true })
  })

  test('조회 실패는 0원이 아닌 별도 문자열로 보인다', async ({ page }) => {
    await openNewSalesSlip(page, '?mockAccountingFailure=1')
    await selectPartner(page)
    await expect(page.getByTestId('slip-form-opening-balance')).toHaveText('조회 실패')
    await expect(page.getByTestId('slip-form-opening-balance')).not.toHaveText('0원')
    await page.screenshot({ path: path.join(SHOTS, '02-accounting-failure-real-qa.png'), fullPage: true })
  })

  test('accounting 장애 중에도 필수 입력 후 저장되어 목록으로 이동한다', async ({ page }) => {
    await openNewSalesSlip(page, '?mockAccountingFailure=1')
    await selectPartner(page)
    await fillRequiredFields(page)
    const save = page.getByRole('button', { name: '저장', exact: true })
    await expect(save).toBeEnabled({ timeout: 15_000 })
    await save.click()
    await expect(page).toHaveURL(/\/#\/sales\/new-slip-\d+$/, { timeout: 15_000 })
    await page.screenshot({ path: path.join(SHOTS, '03-accounting-down-save-real-qa.png'), fullPage: true })
  })

  test('partner 상세 장애도 저장을 막지 않는다', async ({ page }) => {
    await openNewSalesSlip(page, '?mockPartnerDetailFailure=1')
    await selectPartner(page)
    await expect(page.getByRole('alert')).toContainText('거래처 상세 정보 조회에 실패했습니다')
    await fillRequiredFields(page)
    const save = page.getByRole('button', { name: '저장', exact: true })
    await expect(save).toBeEnabled({ timeout: 15_000 })
    await save.click()
    await expect(page).toHaveURL(/\/#\/sales\/new-slip-\d+$/, { timeout: 15_000 })
  })

  test('거래처 없는 화면과 기존 헤더 표면은 깨지지 않고 UUID를 노출하지 않는다', async ({ page }) => {
    await openNewSalesSlip(page)
    await expect(page.getByTestId('slip-form-opening-balance')).toHaveText('거래처 없음')
    await expect(page.getByRole('combobox', { name: '출고 창고' })).toBeVisible()
    await expect(page.getByTestId('slip-form-delivery-address')).toBeVisible()
    await expect(page.getByTestId('slip-form-supervision-address')).toBeVisible()
    await expect(page.getByRole('combobox', { name: '라인 1 품목' })).toBeVisible()
    await expect(page.locator('body')).not.toContainText(UUID_TEXT)
    await page.screenshot({ path: path.join(SHOTS, '04-partnerless-red-b-real-qa.png'), fullPage: true })
  })
})
