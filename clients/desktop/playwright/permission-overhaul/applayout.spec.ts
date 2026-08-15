import { expect, test, type Page, type Route } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'
type MockPerm = { pageCode: string; view?: boolean; edit?: boolean }

function mockPerms(perms: MockPerm[]): string {
  return btoa(JSON.stringify(perms))
}

function withMockPerms(url: string, perms: MockPerm[]): string {
  return `${url}&mockPerms=${encodeURIComponent(mockPerms(perms))}`
}

const MATRIX_URL = withMockPerms(
  `${BASE_URL}/#/admin/permission-matrix?mockRole=MASTER`,
  [{ pageCode: 'system.permission-admin', view: true, edit: true }],
)

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

async function mockAccounts(page: Page) {
  await page.route('**/permissions/accounts', async route => {
    await fulfillJson(route, {
      success: true,
      data: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          displayName: '김관리',
          role: 'MANAGER',
          enabled: true,
        },
      ],
    })
  })
}

async function mockAccountMatrix(page: Page) {
  await page.route('**/permissions/account/**', async route => {
    await fulfillJson(route, {
      success: true,
      data: {},
    })
  })
}

async function openSidebarCategory(page: Page, label: string): Promise<void> {
  const toggle = page.getByTestId(`sidebar-category-toggle-${label.replace(/\s+/g, '')}`)
  await expect(toggle, `${label} 그룹 토글 버튼`).toBeVisible({ timeout: 10_000 })
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click()
  }
  await expect(toggle, `${label} 그룹 펼침 상태`).toHaveAttribute('aria-expanded', 'true')
}

test.describe('Phase 1 Stage 3 Task 14 AppLayout permission gates', () => {
  test('권한 응답 후 matrix/bulk 진입 링크가 동작한다', async ({ page }) => {
    await installAuthMock(page)
    await mockNotifications(page)
    await mockAccounts(page)
    await mockAccountMatrix(page)

    await page.goto(MATRIX_URL, { waitUntil: 'domcontentloaded' })

    await openSidebarCategory(page, '인사')
    await expect(page.getByRole('link', { name: '권한설정' })).toBeVisible()
    await expect(page.getByRole('link', { name: '권한 일괄 적용' })).toBeVisible()

    await page.getByRole('link', { name: '권한 일괄 적용' }).click()
    await expect(page).toHaveURL(/#\/admin\/permission-matrix\/bulk(?:\?.*)?$/)

    await page.getByRole('link', { name: '권한설정' }).click()
    await expect(page).toHaveURL(/#\/admin\/permission-matrix(?:\?.*)?$/)
  })

  // fail-closed 게이트: system.permission-admin 미보유 시 권한 관리 진입점 미노출.
  // (응답-전 hidden 은 in-process mock 즉시응답이라 재현 불가 → 권한-거부 음성 시나리오로 가드 보존.)
  test('system.permission-admin 권한 없으면 권한 관리 메뉴 미노출(fail-closed)', async ({ page }) => {
    await installAuthMock(page)
    await mockNotifications(page)
    await mockAccounts(page)
    await mockAccountMatrix(page)

    const noAdminUrl = withMockPerms(
      `${BASE_URL}/#/?mockRole=MANAGER`,
      [{ pageCode: 'dashboard', view: true }],
    )
    await page.goto(noAdminUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})

    await expect(page.getByRole('link', { name: '권한설정' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: '권한 일괄 적용' })).toHaveCount(0)
  })
})
