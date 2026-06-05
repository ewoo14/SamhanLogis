import { expect, test } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'
const MATRIX_URL = `${BASE_URL}/#/admin/permission-groups/matrix?mockRole=MASTER`
const MANAGE_URL = `${BASE_URL}/#/admin/permission-groups/manage?mockRole=MASTER`

async function installAuthMock(page: import('@playwright/test').Page) {
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

test.describe('Permission Groups Phase A', () => {
  test.beforeEach(async ({ page }) => {
    await installAuthMock(page)
  })

  test('그룹 선택 → 매트릭스 토글 → 저장 토스트', async ({ page }) => {
    await page.goto(MATRIX_URL, { waitUntil: 'domcontentloaded' })

    const groupSelect = page.getByTestId('perm-group-select')
    await expect(groupSelect).toBeVisible()
    await groupSelect.selectOption({ label: '영업팀' })

    const cell = page.getByTestId('perm-group-matrix-cell-accounting-deposit-match-delete')
    await expect(cell).toBeVisible()
    await cell.check()

    await expect(page.getByTestId('perm-group-matrix-change-count')).toContainText('1')
    await page.getByTestId('perm-group-matrix-save-btn').click()
    await expect(page.getByRole('alert')).toContainText('권한 변경을 저장했습니다')
    await expect(page.getByTestId('perm-group-matrix-change-count')).toContainText('0')
  })

  test('그룹 목록 표시·추가·개명·삭제와 빌트인 잠금', async ({ page }) => {
    await page.goto(MANAGE_URL, { waitUntil: 'domcontentloaded' })

    await expect(page.getByTestId('perm-group-manage-table')).toContainText('마스터')
    await expect(page.getByTestId('perm-group-lock-master')).toContainText('잠금')

    await page.getByTestId('perm-group-add-btn').click()
    await page.getByTestId('perm-group-form-name').fill('임시검증그룹')
    await page.getByTestId('perm-group-form-description').fill('Playwright mock 검증')
    await page.getByTestId('perm-group-form-submit').click()
    await expect(page.getByTestId('perm-group-manage-table')).toContainText('임시검증그룹')

    await page.getByTestId('perm-group-edit-임시검증그룹').click()
    await page.getByTestId('perm-group-form-name').fill('임시검증그룹-변경')
    await page.getByTestId('perm-group-form-submit').click()
    await expect(page.getByTestId('perm-group-manage-table')).toContainText('임시검증그룹-변경')

    await page.getByTestId('perm-group-delete-임시검증그룹-변경').click()
    await page.getByTestId('perm-group-delete-confirm').click()
    await expect(page.getByTestId('perm-group-manage-table')).not.toContainText('임시검증그룹-변경')
  })

  test('계정 그룹 다중 배속과 해제', async ({ page }) => {
    await page.goto(MANAGE_URL, { waitUntil: 'domcontentloaded' })

    await page.getByTestId('perm-group-account-select').selectOption({ label: '이영업 / SALES' })
    await expect(page.getByTestId('perm-group-account-assigned')).toContainText('영업팀')
    await expect(page.getByTestId('perm-group-assign-master')).toBeHidden()

    await page.getByTestId('perm-group-assign-배차팀').click()
    await expect(page.getByTestId('perm-group-account-assigned')).toContainText('배차팀')

    await page.getByTestId('perm-group-unassign-영업팀').click()
    await expect(page.getByTestId('perm-group-account-assigned')).not.toContainText('영업팀')
    await expect(page.getByTestId('perm-group-account-assigned')).toContainText('배차팀')
  })
})
