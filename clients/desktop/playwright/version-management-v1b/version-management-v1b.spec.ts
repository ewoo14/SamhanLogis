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

    const modal = page.getByTestId('app-version-blocking-modal')
    // B1: CRITICAL은 라우터보다 먼저 차단되어 header-page-title을 기다리면 안 된다.
    await expect(modal).toBeVisible({ timeout: 15_000 })
    await expect(modal).toContainText('9.9.0')
    await expect(modal).toContainText('페이지를 새로고침하면 최신 웹 산출물을 확인합니다.')
    await expect(page.getByRole('button', { name: '페이지 새로고침' })).toBeVisible()
    await expect(page.getByTestId('app-version-blocking-quit')).toHaveCount(0)

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

  test('MAJOR 권고 모달은 닫을 수 있고 세션에서만 나중에 처리한다', async ({ page }) => {
    const url = buildUrl('/', {
      mockRole: 'MANAGER',
      mockAppForce: 'MAJOR',
      mockAppLatestVersion: '9.9.2',
    })

    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await waitForApp(page)

    const recommendModal = page.getByTestId('app-version-recommend-modal')
    await expect(recommendModal).toBeVisible()
    await expect(recommendModal).toContainText('9.9.2')
    await expect(recommendModal).toContainText('필수 업데이트')
    await expect(page.getByTestId('app-version-blocking-modal')).toHaveCount(0)

    await page.getByTestId('app-version-recommend-later').click()
    await expect(recommendModal).toHaveCount(0)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForApp(page)
    await expect(page.getByTestId('app-version-recommend-modal')).toHaveCount(0)

    const localStorageKeys = await page.evaluate(() => Object.keys(window.localStorage))
    // 브라우저 runtime의 구버전 호환 식별자는 WEB으로 유지되며, admin 등록 선택지와는 별개다.
    expect(localStorageKeys.some((key) => key.includes('samhan.app-version.dismissed.WEB.9.9.2'))).toBe(false)
  })

  test('MINOR 권고 배너는 모바일에서 화면 너비와 안전 영역 안에 머문다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(buildUrl('/', {
      mockRole: 'MANAGER',
      mockAppForce: 'MINOR',
      mockAppLatestVersion: '9.9.3',
    }), { waitUntil: 'domcontentloaded' })
    await waitForApp(page)

    const banner = page.getByTestId('app-version-minor-banner')
    await expect(banner).toBeVisible()
    const box = await banner.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(15)
    expect(box!.x + box!.width).toBeLessThanOrEqual(375)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  })

  test('admin 릴리스 관리 화면에서 등록, 수정, 삭제한다', async ({ page }) => {
    const version = `2026/07/25-${Date.now()}`

    await page.goto(buildUrl('/admin/app-releases', { mockRole: 'MANAGER' }), {
      waitUntil: 'domcontentloaded',
    })
    await waitForApp(page)

    await expect(page.getByTestId('app-release-admin-page')).toBeVisible()

    await page.getByTestId('app-release-create-open').click()
    await page.getByTestId('app-release-client-type').selectOption('DESKTOP')
    await page.getByTestId('app-release-force-level').selectOption('MINOR')
    await page.getByTestId('app-release-version').fill(version)
    await page.getByTestId('app-release-min-supported').fill('2026/07/24-1')
    await expect(page.getByTestId('app-release-released-at')).toHaveAttribute('type', 'datetime-local')
    await page.getByTestId('app-release-released-at').fill('2026-06-27T10:00')
    await page.getByTestId('app-release-notes').fill('V1b Playwright 등록 검증')
    await page.getByTestId('app-release-save').click()

    const rowTestId = `app-release-row-DESKTOP-${version}-2026-06-27T10:00:00`

    await expect(page.getByTestId(rowTestId)).toBeVisible()
    await expect(page.getByTestId(rowTestId)).toContainText('2026.06.27')

    await page.getByTestId(`app-release-edit-DESKTOP-${version}`).click()
    await page.getByTestId('app-release-force-level').selectOption('MAJOR')
    await page.getByTestId('app-release-notes').fill('V1b Playwright 수정 검증')
    await page.getByTestId('app-release-save').click()

    const row = page.getByTestId(rowTestId)
    await expect(row).toContainText('필수')
    await expect(row).toContainText('V1b Playwright 수정 검증')

    await page.getByTestId(`app-release-delete-DESKTOP-${version}`).click()
    await expect(page.getByTestId('app-release-delete-dialog')).toContainText(version)
    await page.getByTestId('app-release-delete-confirm').click()

    await expect(page.getByTestId(rowTestId)).toHaveCount(0)
  })

  test('admin 릴리스 관리 폼과 테이블은 모바일에서 1열/우선순위 카드로 표시한다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(buildUrl('/admin/app-releases', { mockRole: 'MANAGER' }), {
      waitUntil: 'domcontentloaded',
    })
    await waitForApp(page)

    await page.getByTestId('app-release-create-open').click()

    const formGrid = page.getByTestId('app-release-primary-grid')
    await expect(formGrid).toBeVisible()
    await expect(formGrid).toHaveCSS('grid-template-columns', /^[0-9.]+px$/)

    const dateInput = page.getByTestId('app-release-released-at')
    await expect(dateInput).toHaveCSS('min-height', /4[0-9]px/)

    await page.keyboard.press('Escape')

    const firstRow = page.locator('[data-testid^="app-release-row-"]').first()
    await expect(firstRow).toBeVisible()
    await expect(firstRow.locator('[data-mobile-priority="primary"]')).toHaveCount(4)
    await expect(firstRow.getByRole('button', { name: /배포|배포 취소/ })).toHaveCSS('min-height', /4[0-9]px/)
    await expect(firstRow.getByRole('button', { name: '수정' })).toHaveCSS('min-height', /4[0-9]px/)
    await expect(firstRow.getByRole('button', { name: '삭제' })).toHaveCSS('min-height', /4[0-9]px/)
  })
})
