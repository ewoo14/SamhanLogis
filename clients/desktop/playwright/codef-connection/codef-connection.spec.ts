import { expect, test, type Page } from '@playwright/test'

// Mock 기반 실 컴포넌트 렌더 QA. 실 백엔드/CODEF sandbox 검증은 기관 자격과 암호화 키가 필요해 별도 real QA로 수행한다.
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'

function urlFor(role: string): string {
  return `${BASE_URL}/#/accounting/codef-connection?mockRole=${role}`
}

async function visibleTextHasNoInternalIds(page: Page): Promise<void> {
  const leaks = await page.evaluate(() => {
    const uuidRegex = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const found: string[] = []
    let node: Node | null
    while ((node = walker.nextNode())) {
      const parent = node.parentElement
      if (!parent || ['script', 'style'].includes(parent.tagName.toLowerCase())) continue
      const text = node.textContent ?? ''
      if (text.includes('connectedId')) found.push('connectedId')
      const uuids = text.match(uuidRegex)
      if (uuids) found.push(...uuids)
    }
    return found
  })
  expect(leaks, `내부 식별자가 화면에 노출됨: ${leaks.join(', ')}`).toHaveLength(0)
}

test.describe('CODEF 금융연동 페이지', () => {
  test('MASTER가 기관 등록 후 목록과 계좌 검증 결과를 조회한다', async ({ page }) => {
    await page.goto(urlFor('MASTER'), { waitUntil: 'domcontentloaded' })

    await expect(page.getByTestId('header-page-title')).toHaveText('CODEF 금융연동')
    await page.getByTestId('codef-connection-business-type').selectOption('BANK')
    await page.getByTestId('codef-connection-organization').fill('0004')
    await page.getByTestId('codef-connection-login-type').selectOption('ID_PASSWORD')
    await page.getByTestId('codef-connection-credential-id').fill('samhan-bank-user')
    await page.getByTestId('codef-connection-credential-password').fill('secret-pass')
    await page.getByTestId('codef-connection-register-button').click()

    await expect(page.getByRole('status').filter({ hasText: '금융기관 등록을 완료했습니다.' })).toBeVisible()
    await expect(page.getByTestId('codef-connection-credential-id')).toHaveValue('')
    await expect(page.getByTestId('codef-connection-credential-password')).toHaveValue('')
    await expect(page.getByTestId('codef-connection-institution-table')).toContainText('국민은행')
    await expect(page.getByTestId('codef-connection-institution-table')).toContainText('정상')

    await page.getByTestId('codef-connection-list-accounts').click()
    await expect(page.getByTestId('codef-connection-result-table')).toContainText('국민 운영계좌')
    await expect(page.getByTestId('codef-connection-result-table')).toContainText('국민은행')

    await page.getByTestId('codef-connection-list-cards').click()
    await expect(page.getByTestId('codef-connection-result-table')).toContainText('삼한 물류카드')
    await expect(page.getByTestId('codef-connection-result-table')).toContainText('신한카드')

    await page.getByTestId('codef-connection-list-loans').click()
    await expect(page.getByTestId('codef-connection-result-table')).toContainText('운전자금 대출')
    await expect(page.getByTestId('codef-connection-result-table')).toContainText('국민은행')

    await visibleTextHasNoInternalIds(page)
  })

  test('비-MASTER는 회계 메뉴에서 CODEF 금융연동 링크가 보이지 않는다', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/?mockRole=ACCOUNTANT`, { waitUntil: 'domcontentloaded' })

    await expect(page.getByTestId('sidebar-accounting-codef-connection')).toHaveCount(0)
  })

  test('비-MASTER는 직접 URL 진입도 RoleGuard에서 차단된다', async ({ page }) => {
    await page.goto(urlFor('ACCOUNTANT'), { waitUntil: 'domcontentloaded' })

    await expect(page.getByText('접근 권한이 없습니다')).toBeVisible()
    await expect(page.getByTestId('codef-connection-register-button')).toHaveCount(0)
  })
})
