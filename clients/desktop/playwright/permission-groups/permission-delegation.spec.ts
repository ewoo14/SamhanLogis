import { expect, test } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'
const DELEGATION_URL = `${BASE_URL}/#/admin/permission-groups/delegation?mockRole=MASTER`
const MANAGER_DELEGATION_URL = `${BASE_URL}/#/admin/permission-groups/delegation?mockRole=MANAGER`
const MANAGER_HOME_URL = `${BASE_URL}/#/?mockRole=MANAGER`

async function installAuthMock(page: import('@playwright/test').Page, role: string) {
  await page.addInitScript((mockRole) => {
    const auth = {
      token: `playwright-token-${mockRole}`,
      userId: '00000000-0000-0000-0000-000000010001',
      role: mockRole,
      fullName: mockRole === 'MASTER' ? '오병승' : '김관리',
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
  }, role)
}

test.describe('Permission Groups Phase B Delegation', () => {
  test('그룹 선택 → 위임 토글 → 저장 → 현황 표시', async ({ page }) => {
    await installAuthMock(page, 'MASTER')
    await page.goto(DELEGATION_URL, { waitUntil: 'domcontentloaded' })

    await expect(page.getByTestId('perm-delegation-page')).toBeVisible()

    const groupSelect = page.getByTestId('perm-delegation-group-select')
    await expect(groupSelect).toBeVisible()
    await groupSelect.selectOption({ label: '영업팀' })

    await expect(page.getByTestId('perm-delegation-status-permission-admin')).toContainText('미위임')
    await expect(page.getByTestId('perm-delegation-status-hr-role-management')).toContainText('미위임')
    await expect(page.getByTestId('perm-delegation-status-permission-groups')).toContainText('미위임')

    await page.getByTestId('perm-delegation-toggle-permission-admin').check()
    await page.getByTestId('perm-delegation-toggle-hr-role-management').check()
    await page.getByTestId('perm-delegation-save-btn').click()

    await expect(page.getByRole('alert')).toContainText('권한 위임을 저장했습니다')
    await expect(page.getByTestId('perm-delegation-status-permission-admin')).toContainText('위임됨')
    await expect(page.getByTestId('perm-delegation-status-hr-role-management')).toContainText('위임됨')
    await expect(page.getByTestId('perm-delegation-status-permission-groups')).toContainText('미위임')
  })

  test('MASTER 전용 메뉴 노출과 비-MASTER 직접 접근 차단', async ({ page }) => {
    await installAuthMock(page, 'MASTER')
    await page.goto(DELEGATION_URL, { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('sidebar-hr-permission-delegation')).toBeVisible()

    await installAuthMock(page, 'MANAGER')
    await page.goto(MANAGER_HOME_URL, { waitUntil: 'domcontentloaded' })
    await page.reload()
    await expect(page.getByTestId('sidebar-hr-permission-delegation')).toBeHidden()

    await page.goto(MANAGER_DELEGATION_URL, { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('perm-delegation-page')).toBeHidden()
    await expect(page.getByText('접근 권한이 없습니다')).toBeVisible()
    await expect(page.getByText('현재 role: MANAGER')).toBeVisible()
  })
})
