import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'
const URL = `${BASE_URL}/#/accounting/bank-transactions?mockRole=ACCOUNTANT`

async function visibleTextHasNoUuid(page: Page): Promise<void> {
  const uuids = await page.evaluate(() => {
    const uuidRegex = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const found: string[] = []
    let node: Node | null
    while ((node = walker.nextNode())) {
      const parent = node.parentElement
      if (!parent) continue
      if (['script', 'style'].includes(parent.tagName.toLowerCase())) continue
      const matches = (node.textContent ?? '').match(uuidRegex)
      if (matches) found.push(...matches)
    }
    return found
  })
  expect(uuids, `화면에 UUID가 노출됨: ${uuids.join(', ')}`).toHaveLength(0)
}

test.describe('CODEF FE BC2 거래내역 import + source 탭 + 매칭', () => {
  test('CODEF import 후 계좌/카드/대출 탭과 매칭 정책을 표시한다', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))

    await page.goto(URL, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: '입출금 매칭', exact: true }).last()).toBeVisible()

    await expect(page.getByTestId('codef-import-type')).toBeVisible()
    await page.getByTestId('codef-import-type').selectOption('ALL')
    await page.getByTestId('codef-import-from').fill('2026-06-01')
    await page.getByTestId('codef-import-to').fill('2026-06-26')
    await page.getByTestId('codef-import-button').click()

    await expect(page.getByTestId('codef-import-result')).toContainText('조회')
    await expect(page.getByTestId('codef-import-result')).toContainText('적재')
    await expect(page.getByTestId('codef-tab-CODEF_BANK')).toBeVisible()
    await expect(page.getByTestId('codef-tab-CODEF_CARD')).toBeVisible()
    await expect(page.getByTestId('codef-tab-CODEF_LOAN')).toBeVisible()
    await expect(page.getByRole('columnheader', { name: '법인카드' })).toHaveCount(0)
    await expect(page.getByRole('columnheader', { name: '승인번호' })).toHaveCount(0)
    await expect(page.getByRole('columnheader', { name: '대출명' })).toHaveCount(0)

    await page.getByTestId('codef-tab-CODEF_BANK').click()
    await expect(page.getByRole('columnheader', { name: '법인카드' })).toHaveCount(0)
    await expect(page.getByRole('columnheader', { name: '승인번호' })).toHaveCount(0)
    await expect(page.getByRole('columnheader', { name: '대출명' })).toHaveCount(0)

    await page.getByTestId('codef-tab-CODEF_CARD').click()
    await expect(page.getByRole('columnheader', { name: '법인카드' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: '승인번호' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: '대출명' })).toHaveCount(0)
    await expect(page.getByText('삼한 물류카드').first()).toBeVisible()
    await expect(page.locator('[data-testid^="bank-transaction-partner-search-CODEF_CARD-"]').first()).toBeVisible()

    await page.getByTestId('codef-tab-CODEF_LOAN').click()
    await expect(page.getByRole('columnheader', { name: '법인카드' })).toHaveCount(0)
    await expect(page.getByRole('columnheader', { name: '승인번호' })).toHaveCount(0)
    await expect(page.getByRole('columnheader', { name: '대출명' })).toBeVisible()
    await expect(page.getByRole('note')).toContainText('대출 거래는 거래처 매칭 대상이 아닙니다')
    await expect(page.getByText('운전자금 대출').first()).toBeVisible()
    await expect(page.locator('[data-testid^="bank-transaction-partner-search-CODEF_LOAN-"]')).toHaveCount(0)

    await visibleTextHasNoUuid(page)
    expect(pageErrors).toHaveLength(0)
  })
})
