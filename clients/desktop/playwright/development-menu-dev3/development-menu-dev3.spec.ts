import { expect, test } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'

function buildUrl(path: string, params: Record<string, string> = {}) {
  const search = new URLSearchParams(params).toString()
  return `${BASE_URL}/#${path}${search ? `?${search}` : ''}`
}

function mockPerms(perms: Array<{ pageCode: string; view?: boolean; edit?: boolean }>): string {
  return Buffer.from(JSON.stringify(perms), 'utf8').toString('base64')
}

async function waitForApp(page: import('@playwright/test').Page) {
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})
  await page.getByTestId('header-page-title').waitFor({ state: 'visible', timeout: 10_000 })
}

async function closeNoticeIfOpen(page: import('@playwright/test').Page) {
  const modal = page.getByTestId('app-notice-modal')
  if (await modal.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: '닫기' }).last().click()
    await expect(modal).toHaveCount(0)
  }
}

test.describe('DEV-3 개발 메뉴 로그', () => {
  test('DEVELOPER는 개발 그룹에서 로그 화면으로 진입한다', async ({ page }) => {
    await page.goto(buildUrl('/', { mockRole: 'DEVELOPER' }), { waitUntil: 'domcontentloaded' })
    await waitForApp(page)
    await closeNoticeIfOpen(page)

    await page.getByTestId('sidebar-category-toggle-개발').click()
    await expect(page.getByTestId('sidebar-dev-activity-log')).toContainText('로그')
    await page.getByTestId('sidebar-dev-activity-log').click()

    await expect(page).toHaveURL(/\/admin\/activity-logs/)
    await expect(page.getByTestId('activity-log-page')).toBeVisible()
    await expect(page.getByTestId('activity-log-table')).toContainText('메뉴 진입')
    await expect(page.getByTestId('activity-log-table')).not.toContainText('11111111-1111-1111')
  })

  test('필터, 검색, 페이지네이션을 제공한다', async ({ page }) => {
    await page.goto(buildUrl('/admin/activity-logs', { mockRole: 'DEVELOPER' }), { waitUntil: 'domcontentloaded' })
    await waitForApp(page)
    await closeNoticeIfOpen(page)

    await page.getByTestId('activity-log-menu-filter').selectOption('dev.popup-notice')
    await page.getByTestId('activity-log-action-filter').selectOption('MENU_ACCESS')
    await page.getByTestId('activity-log-search-filter').fill('팝업공지')
    await expect(page.getByTestId('activity-log-table')).toContainText('팝업공지')
    await expect(page.getByTestId('activity-log-table')).not.toContainText('버전 관리 릴리스')
    await expect(page.getByTestId('activity-log-page-indicator')).toContainText('1 /')
  })

  test('라우트 변경 시 MENU_ACCESS를 발행해 로그 목록에 누적한다', async ({ page }) => {
    await page.goto(buildUrl('/admin/app-notices', { mockRole: 'DEVELOPER' }), { waitUntil: 'domcontentloaded' })
    await waitForApp(page)
    await closeNoticeIfOpen(page)
    await page.waitForTimeout(1_200)

    await page.goto(buildUrl('/admin/activity-logs', { mockRole: 'DEVELOPER' }), { waitUntil: 'domcontentloaded' })
    await waitForApp(page)
    await closeNoticeIfOpen(page)
    await page.getByTestId('activity-log-menu-filter').selectOption('dev.popup-notice')
    await expect(page.getByTestId('activity-log-table')).toContainText('팝업공지 메뉴 진입')
  })

  test('권한이 없으면 사이드바 미노출 및 직접 진입 403 처리한다', async ({ page }) => {
    const perms = mockPerms([{ pageCode: 'dev.activity-log', view: false, edit: false }])

    await page.goto(buildUrl('/', { mockRole: 'DEVELOPER', mockPerms: perms }), { waitUntil: 'domcontentloaded' })
    await waitForApp(page)
    await closeNoticeIfOpen(page)
    await expect(page.getByTestId('sidebar-dev-activity-log')).toHaveCount(0)

    await page.goto(buildUrl('/admin/activity-logs', { mockRole: 'DEVELOPER', mockPerms: perms }), { waitUntil: 'domcontentloaded' })
    await waitForApp(page)
    await expect(page).toHaveURL(/#\/$/)
    await expect(page.getByTestId('sidebar-dev-activity-log')).toHaveCount(0)
  })

  test('모바일 390px에서 필터와 표가 화면 폭을 넘지 않는다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(buildUrl('/admin/activity-logs', { mockRole: 'DEVELOPER' }), { waitUntil: 'domcontentloaded' })
    await waitForApp(page)
    await closeNoticeIfOpen(page)

    await expect(page.getByTestId('activity-log-filters')).toBeVisible()
    await expect(page.getByTestId('activity-log-table')).toContainText('시각(KST)')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  })
})
