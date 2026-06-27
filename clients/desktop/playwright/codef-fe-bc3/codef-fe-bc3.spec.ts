import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'
const URL = `${BASE_URL}/#/accounting/bank-transactions?mockRole=ACCOUNTANT`

async function expectNoTechnicalLabels(page: Page): Promise<void> {
  await expect(page.getByText('CODEF')).toHaveCount(0)
  await expect(page.getByText('DRY_RUN')).toHaveCount(0)
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement
    return Math.max(doc.scrollWidth, document.body.scrollWidth) - window.innerWidth
  })
  expect(overflow, `가로 오버플로 ${overflow}px`).toBeLessThanOrEqual(1)
}

test.describe('BC3 CODEF 계좌/카드/대출 선택 가져오기', () => {
  test('카드 다중 선택을 저장하고 저장 기준으로 가져온다', async ({ page }) => {
    await page.goto(URL, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: '거래내역 가져오기', exact: true })).toBeVisible()

    await expect(page.getByTestId('codef-scope-list')).toBeVisible()
    await expect(page.getByTestId('codef-bank-scope')).toBeVisible()
    await expect(page.getByTestId('codef-card-scope')).toBeVisible()
    await expect(page.getByTestId('codef-loan-scope')).toBeVisible()

    await page.getByTestId('codef-import-type').selectOption('CARD')
    await expect(page.getByTestId('codef-bank-scope')).toHaveCount(0)
    await expect(page.getByTestId('codef-loan-scope')).toHaveCount(0)
    await expect(page.getByTestId('codef-card-scope')).toBeVisible()

    await page.getByTestId('codef-card-0').check()
    await page.getByTestId('codef-card-1').check()
    await expect(page.getByTestId('codef-selected-chip')).toHaveCount(2)

    await page.getByTestId('codef-save-scope-button').click()
    await expect(page.getByRole('status').filter({ hasText: '가져오기 선택을 저장했습니다.' })).toBeVisible()
    await expect(page.getByText('저장된 선택을 복원했습니다.')).toBeVisible()

    await page.getByTestId('codef-import-from').fill('2026-06-01')
    await page.getByTestId('codef-import-to').fill('2026-06-26')
    await page.getByTestId('codef-import-button').click()
    await expect(page.getByTestId('codef-import-result')).toContainText('조회')
    await expect(page.getByTestId('codef-import-result')).toContainText('적재')

    await page.getByTestId('codef-tab-CODEF_CARD').click()
    await expect(page.getByText('삼한 물류카드').first()).toBeVisible()
    await expect(page.getByText('삼한 정비카드').first()).toBeVisible()
    await expectNoTechnicalLabels(page)
  })

  test('모바일 viewport 에서 가져오기 폼과 거래 리스트가 가로로 넘치지 않는다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(URL, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: '거래내역 가져오기', exact: true })).toBeVisible()

    await page.getByTestId('codef-import-type').selectOption('BANK')
    await page.getByTestId('codef-bank-account-select-all').check()
    await page.getByTestId('codef-import-from').fill('2026-06-01')
    await page.getByTestId('codef-import-to').fill('2026-06-26')
    await page.getByTestId('codef-import-button').click()
    await expect(page.getByTestId('codef-import-result')).toContainText('조회')

    await expectNoHorizontalOverflow(page)
    await expectNoTechnicalLabels(page)
  })
})
