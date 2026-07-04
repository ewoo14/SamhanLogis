import { expect, test, type Page } from '@playwright/test'

// Mock 기반 실 컴포넌트 렌더 QA. 실 백엔드/CODEF sandbox 검증은 기관 자격과 암호화 키가 필요해 별도 real QA로 수행한다.
// (구 CodefConnectionPage(MASTER 전용) → BankCardAdminPage(계좌/카드 관리, 회계 실무자 화면)로 이관됨.)
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'

function urlFor(role: string): string {
  return `${BASE_URL}/#/accounting/bank-card-admin?mockRole=${role}`
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

test.describe('계좌/카드 관리 페이지', () => {
  test('MASTER가 기관 등록·목록·해제·검증 조회를 수행한다', async ({ page }) => {
    await page.goto(urlFor('MASTER'), { waitUntil: 'domcontentloaded' })

    await expect(page.getByTestId('header-page-title')).toHaveText('계좌/카드 관리')
    await page.getByTestId('bank-card-admin-business-type').selectOption('BANK')
    await page.getByTestId('bank-card-admin-organization').fill('0004')
    await page.getByTestId('bank-card-admin-login-type').selectOption('5')
    await page.getByTestId('bank-card-admin-credential-id').fill('samhan-bank-user')
    await page.getByTestId('bank-card-admin-credential-password').fill('secret-pass')
    await page.getByTestId('bank-card-admin-register-button').click()

    await expect(page.getByRole('status').filter({ hasText: '금융기관 등록을 완료했습니다.' })).toBeVisible()
    await expect(page.getByTestId('bank-card-admin-credential-id')).toHaveValue('')
    await expect(page.getByTestId('bank-card-admin-credential-password')).toHaveValue('')
    await expect(page.getByTestId('bank-card-admin-institution-table')).toContainText('국민은행')
    await expect(page.getByTestId('bank-card-admin-institution-table')).toContainText('정상')

    await page.getByTestId('bank-card-admin-list-accounts').click()
    await expect(page.getByTestId('bank-card-admin-result-table')).toContainText('국민 운영계좌')
    await expect(page.getByTestId('bank-card-admin-result-table')).toContainText('국민은행')

    await page.getByTestId('bank-card-admin-list-cards').click()
    await expect(page.getByTestId('bank-card-admin-result-table')).toContainText('삼한 물류카드')
    await expect(page.getByTestId('bank-card-admin-result-table')).toContainText('신한카드')

    await page.getByTestId('bank-card-admin-list-loans').click()
    await expect(page.getByTestId('bank-card-admin-result-table')).toContainText('운전자금 대출')
    await expect(page.getByTestId('bank-card-admin-result-table')).toContainText('국민은행')

    // 해제(신규 기능): 등록기관 목록의 해제 버튼 → 소프트 삭제.
    await page.getByTestId('bank-card-admin-institution-table')
      .getByRole('button', { name: '해제' }).first().click()
    await expect(page.getByRole('status').filter({ hasText: '금융기관 등록을 해제했습니다.' })).toBeVisible()

    await visibleTextHasNoInternalIds(page)
  })

  test('ACCOUNTANT는 VIEW 권한으로 진입하나 등록 버튼이 비활성이다', async ({ page }) => {
    // 구 RoleGuard(MASTER 전용) 제거 — ACCOUNTANT 는 VIEW 로 진입 가능하되 CREATE 권한이 없어 등록 불가.
    await page.goto(urlFor('ACCOUNTANT'), { waitUntil: 'domcontentloaded' })

    await expect(page.getByTestId('header-page-title')).toHaveText('계좌/카드 관리')
    await expect(page.getByTestId('bank-card-admin-institution-table')).toBeVisible()
    await expect(page.getByTestId('bank-card-admin-register-button')).toBeDisabled()
  })

  test('ACCOUNTANT 회계 메뉴에 계좌/카드 관리 링크가 노출된다(VIEW)', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/?mockRole=ACCOUNTANT`, { waitUntil: 'domcontentloaded' })

    await expect(page.getByTestId('sidebar-accounting-bank-card-admin')).toHaveCount(1)
  })
})
