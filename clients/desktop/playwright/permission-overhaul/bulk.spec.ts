import { expect, test, type Page, type Route } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'
const PAGE_URL = `${BASE_URL}/#/admin/permission-matrix/bulk?mockRole=MASTER`

const ACCOUNT_ONE = 'mock-account-manager'
const ACCOUNT_TWO = 'mock-account-sales'

async function fulfillJson(route: Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

async function installAuthMock(page: Page) {
  await page.addInitScript(() => {
    const auth = {
      token: 'playwright-token',
      userId: '00000000-0000-0000-0000-000000010001',
      role: 'MASTER',
      fullName: '오병승',
      partnerCode: 'P-MOCK-001',
    }
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => auth,
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  })
}

async function mockNotifications(page: Page) {
  await page.route('**/api/notifications/my', async route => {
    await fulfillJson(route, {
      success: true,
      data: [],
    })
  })
}

async function mockPermissionAdmin(page: Page) {
  await page.route('**/permissions/my', async route => {
    await fulfillJson(route, {
      success: true,
      data: {
        'system.permission-admin': ['view', 'update'],
      },
    })
  })
}

async function mockAccounts(page: Page) {
  await page.route('**/permissions/accounts', async route => {
    await fulfillJson(route, {
      success: true,
      data: [
        {
          id: ACCOUNT_ONE,
          displayName: '김관리',
          role: 'MANAGER',
          enabled: true,
        },
        {
          id: ACCOUNT_TWO,
          displayName: '이영업',
          role: 'SALES',
          enabled: true,
        },
      ],
    })
  })
}

async function mockBulkApply(page: Page) {
  await page.route('**/permissions/bulk', async route => {
    await fulfillJson(route, {
      success: true,
      data: { changedCount: 4 },
    })
  })
}

test.describe('Phase 1 Stage 3 Task 13 permission matrix bulk wizard', () => {
  test('계정 다중선택 → 명시 권한 → 미리보기 → 일괄 적용 payload', async ({ page }) => {
    await installAuthMock(page)
    await mockNotifications(page)
    await mockPermissionAdmin(page)
    await mockAccounts(page)
    await mockBulkApply(page)

    await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' })

    await expect(page.getByText('김관리')).toBeVisible()
    await expect(page.getByText(ACCOUNT_ONE)).toHaveCount(0)

    await page.getByTestId(`perm-bulk-account-${ACCOUNT_ONE}`).check()
    await page.getByTestId(`perm-bulk-account-${ACCOUNT_TWO}`).check()
    await page.getByRole('button', { name: '다음' }).click()

    await page.getByTestId('perm-bulk-mode').selectOption('grants')
    await page.getByLabel('페이지').selectOption('dispatch.board')
    await page.getByLabel('보기').check()
    await page.getByLabel('엑셀').check()
    await page.getByRole('button', { name: '미리보기' }).click()

    await expect(page.getByTestId('perm-bulk-preview')).toContainText('2개 계정')
    await expect(page.getByTestId('perm-bulk-preview')).toContainText('dispatch.board')
    await expect(page.getByTestId('perm-bulk-preview')).toContainText('보기')
    await expect(page.getByTestId('perm-bulk-preview')).toContainText('엑셀')

    await page.getByTestId('perm-bulk-apply').click()

    await expect(page.getByRole('alert')).toContainText('4건')
  })
})
