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

test.describe('V1b 버전관리 데스크탑/웹', () => {
  test('CRITICAL 버전 응답은 닫을 수 없는 차단 모달로 앱을 가린다', async ({ page }) => {
    await page.goto(buildUrl('/', {
      mockRole: 'MANAGER',
      mockAppForce: 'CRITICAL',
      mockAppLatestVersion: '9.9.0',
    }), { waitUntil: 'domcontentloaded' })
    await waitForApp(page)

    const modal = page.getByTestId('app-version-blocking-modal')
    await expect(modal).toBeVisible()
    await expect(modal).toContainText('9.9.0')
    await expect(modal).toContainText('업데이트 전까지 앱 사용은 차단됩니다')

    await page.keyboard.press('Escape')
    await expect(modal).toBeVisible()
    await expect(page.getByTestId('ds-modal-backdrop')).toBeVisible()
  })

  test('MINOR 권고 배너는 지금 보기와 다시 보지 않기 영속 처리를 제공한다', async ({ page }) => {
    const url = buildUrl('/', {
      mockRole: 'MANAGER',
      mockAppForce: 'MINOR',
      mockAppLatestVersion: '9.9.1',
    })

    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => window.localStorage.clear())
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForApp(page)

    const banner = page.getByTestId('app-version-minor-banner')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('9.9.1')

    await page.getByTestId('app-version-minor-view').click()
    const detailDialog = page.getByRole('dialog', { name: '업데이트 안내' })
    await expect(detailDialog).toBeVisible()
    await detailDialog.getByRole('button', { name: '닫기' }).last().click()

    await page.getByTestId('app-version-minor-dismiss').click()
    await expect(banner).toHaveCount(0)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForApp(page)
    await expect(page.getByTestId('app-version-minor-banner')).toHaveCount(0)
  })

  test('admin 릴리스 관리 화면에서 등록, 수정, 삭제한다', async ({ page }) => {
    const version = `0.3.${Date.now()}`

    await page.goto(buildUrl('/admin/app-releases', { mockRole: 'MANAGER' }), {
      waitUntil: 'domcontentloaded',
    })
    await waitForApp(page)

    await expect(page.getByTestId('app-release-admin-page')).toBeVisible()

    await page.getByTestId('app-release-create-open').click()
    await page.getByTestId('app-release-client-type').selectOption('WEB')
    await page.getByTestId('app-release-force-level').selectOption('MINOR')
    await page.getByTestId('app-release-version').fill(version)
    await page.getByTestId('app-release-min-supported').fill('0.1.0')
    await page.getByTestId('app-release-released-at').fill('2026-06-27T10:00:00+09:00')
    await page.getByTestId('app-release-notes').fill('V1b Playwright 등록 검증')
    await page.getByTestId('app-release-save').click()

    await expect(page.getByTestId(`app-release-row-WEB-${version}`)).toBeVisible()

    await page.getByTestId(`app-release-edit-WEB-${version}`).click()
    await page.getByTestId('app-release-force-level').selectOption('MAJOR')
    await page.getByTestId('app-release-notes').fill('V1b Playwright 수정 검증')
    await page.getByTestId('app-release-save').click()

    const row = page.getByTestId(`app-release-row-WEB-${version}`)
    await expect(row).toContainText('필수')
    await expect(row).toContainText('V1b Playwright 수정 검증')

    await page.getByTestId(`app-release-delete-WEB-${version}`).click()
    await expect(page.getByTestId('app-release-delete-dialog')).toContainText(version)
    await page.getByTestId('app-release-delete-confirm').click()

    await expect(page.getByTestId(`app-release-row-WEB-${version}`)).toHaveCount(0)
  })
})
