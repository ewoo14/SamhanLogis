import { expect, test } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'

function buildUrl(path: string, params: Record<string, string> = {}) {
  const search = new URLSearchParams(params).toString()
  return `${BASE_URL}/#${path}${search ? `?${search}` : ''}`
}

async function waitForApp(page: import('@playwright/test').Page) {
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})
  await page.getByTestId('header-page-title').waitFor({ state: 'visible', timeout: 10_000 })
}

test.describe('DEV-1 개발 메뉴 그룹', () => {
  test('admin.app-release 권한자는 인사 아래 개발 그룹에서 버전 관리로 진입한다', async ({ page }) => {
    await page.goto(buildUrl('/', { mockRole: 'DEVELOPER' }), { waitUntil: 'domcontentloaded' })
    await waitForApp(page)

    const developmentToggle = page.getByTestId('sidebar-category-toggle-개발')
    await expect(developmentToggle).toBeVisible()

    await developmentToggle.click()
    await expect(page.getByTestId('sidebar-dev-app-releases')).toContainText('버전 관리')

    await page.getByTestId('sidebar-dev-app-releases').click()
    await expect(page).toHaveURL(/\/admin\/app-releases/)
    await expect(page.getByTestId('app-release-admin-page')).toBeVisible()
  })

  test('버전 관리 테이블에서 배포 상태를 전환한다', async ({ page }) => {
    await page.goto(buildUrl('/admin/app-releases', { mockRole: 'DEVELOPER' }), { waitUntil: 'domcontentloaded' })
    await waitForApp(page)

    const firstRow = page.locator('[data-testid^="app-release-row-"]').first()
    await expect(firstRow).toBeVisible()
    await expect(firstRow).toContainText('배포됨')

    await firstRow.getByRole('button', { name: '배포 취소' }).click()
    await expect(firstRow).toContainText('테스트')
    await expect(firstRow.getByRole('button', { name: '배포' })).toBeVisible()

    await firstRow.getByRole('button', { name: '배포' }).click()
    await expect(firstRow).toContainText('배포됨')
    await expect(firstRow.getByRole('button', { name: '배포 취소' })).toBeVisible()
  })
})
