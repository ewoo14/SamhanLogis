import { expect, test } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
)

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

test.describe('DEV-2 개발 메뉴 팝업공지', () => {
  test('DEVELOPER는 개발 그룹에서 팝업공지 화면으로 진입한다', async ({ page }) => {
    await page.goto(buildUrl('/', { mockRole: 'DEVELOPER' }), { waitUntil: 'domcontentloaded' })
    await waitForApp(page)
    await closeNoticeIfOpen(page)

    const developmentToggle = page.getByTestId('sidebar-category-toggle-개발')
    await expect(developmentToggle).toBeVisible()
    await developmentToggle.click()
    await expect(page.getByTestId('sidebar-dev-popup-notice')).toContainText('팝업공지')

    await page.getByTestId('sidebar-dev-popup-notice').click()
    await expect(page).toHaveURL(/\/admin\/app-notices/)
    await expect(page.getByTestId('app-notice-admin-page')).toBeVisible()
  })

  test('admin 팝업공지 화면에서 등록, 수정, 이미지 업로드, 삭제한다', async ({ page }) => {
    const title = `DEV-2 공지 ${Date.now()}`

    await page.goto(buildUrl('/admin/app-notices', { mockRole: 'DEVELOPER' }), { waitUntil: 'domcontentloaded' })
    await waitForApp(page)
    await closeNoticeIfOpen(page)

    await page.getByTestId('app-notice-create-open').click()
    await page.getByTestId('app-notice-title').fill(title)
    await page.getByTestId('app-notice-start-at').fill('2026-06-28T09:00')
    await page.getByTestId('app-notice-end-at').fill('2026-06-30T18:00')
    await page.getByTestId('app-notice-display-order').fill('7')
    await expect(page.getByTestId('app-notice-start-at')).toHaveAttribute('type', 'datetime-local')
    await expect(page.getByText('공지 저장 후 이미지를 추가할 수 있습니다')).toBeVisible()
    await page.getByRole('button', { name: '저장' }).click()

    const row = page.getByTestId(`app-notice-row-${title}`)
    await expect(row).toBeVisible()
    await expect(row).toContainText('게시')
    await expect(page.getByText('파일을 끌어다 놓거나 클릭해서 이미지를 선택합니다.')).toBeVisible()

    await page.getByTestId('app-notice-image-input').setInputFiles({
      name: 'notice.png',
      mimeType: 'image/png',
      buffer: Buffer.from('png'),
    })
    await page.getByLabel('이미지 캡션').fill('Playwright 배너')
    await page.getByTestId('app-notice-image-upload').click()
    await expect(page.getByTestId('app-notice-image-list')).toContainText('Playwright 배너')
    await expect(page.getByTestId('app-notice-image-list')).toContainText('ffffff.png')
    await expect(page.getByTestId('app-notice-image-list')).not.toContainText('app-notices/')

    await page.getByTestId('app-notice-title').fill(`${title} 수정`)
    await page.getByTestId('app-notice-is-active').uncheck()
    await page.getByRole('button', { name: '저장' }).click()
    await page.getByRole('button', { name: '닫기' }).last().click()

    const updatedRow = page.getByTestId(`app-notice-row-${title} 수정`)
    await expect(updatedRow).toBeVisible()
    await expect(updatedRow).toContainText('중지')

    await updatedRow.getByRole('button', { name: '삭제' }).click()
    await page.getByTestId('app-notice-delete-confirm').click()
    await expect(updatedRow).toHaveCount(0)
  })

  test('클라이언트 팝업은 캐러셀과 공지별 다시 보지 않기 영속 처리를 제공한다', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => window.localStorage.clear())

    let holdFirstImage = true
    let releaseFirstImage: (() => void) | null = null
    await page.route('https://dummyimage.com/**', async (route) => {
      if (holdFirstImage) {
        holdFirstImage = false
        await new Promise<void>((resolve) => {
          releaseFirstImage = resolve
        })
      }
      await route.fulfill({ contentType: 'image/png', body: ONE_PIXEL_PNG })
    })

    await page.goto(buildUrl('/', { mockRole: 'DEVELOPER' }), { waitUntil: 'domcontentloaded' })
    await page.getByTestId('header-page-title').waitFor({ state: 'visible', timeout: 10_000 })

    const modal = page.getByTestId('app-notice-modal')
    await expect(modal).toBeVisible()
    await expect(page.getByTestId('app-notice-image-loading')).toBeVisible()
    releaseFirstImage?.()
    await expect(page.getByTestId('app-notice-image-loading')).toHaveCount(0)
    await expect(modal).toContainText('개발 그룹에서 팝업공지')
    await expect(page.getByTestId('app-notice-indicator')).toHaveAttribute('aria-label', '이미지 1 / 2')
    await expect(page.getByTestId('app-notice-indicator')).not.toContainText('1 / 2')
    await expect(page.getByTestId('app-notice-indicator').locator('span')).toHaveCount(2)
    const nextBox = await page.getByTestId('app-notice-next').boundingBox()
    expect(nextBox?.width ?? 0).toBeGreaterThanOrEqual(44)
    expect(nextBox?.height ?? 0).toBeGreaterThanOrEqual(44)

    await page.getByTestId('app-notice-next').click()
    await expect(modal).toContainText('다시 보지 않기는 공지별로 저장됩니다.')
    await expect(page.getByTestId('app-notice-indicator')).toHaveAttribute('aria-label', '이미지 2 / 2')

    await page.getByTestId('app-notice-dismiss-forever').click()
    await expect(modal).toHaveCount(0)
    const dismissed = await page.evaluate(() => window.localStorage.getItem('samhan.appNotice.dismissed.00000000-0000-4000-8000-000000000201'))
    expect(dismissed).toBe('true')

    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForApp(page)
    await expect(page.getByTestId('app-notice-modal')).toHaveCount(0)
  })

  test('view-only 권한은 admin 수정 버튼을 비활성화한다', async ({ page }) => {
    const perms = mockPerms([{ pageCode: 'dev.popup-notice', view: true, edit: false }])

    await page.goto(
      buildUrl('/admin/app-notices', { mockRole: 'DEVELOPER', mockPerms: perms }),
      { waitUntil: 'domcontentloaded' },
    )
    await waitForApp(page)
    await closeNoticeIfOpen(page)

    await expect(page.getByRole('button', { name: '수정' }).first()).toBeDisabled()
    await expect(page.getByTestId('app-notice-create-open')).toBeDisabled()
  })

  test('모바일에서 팝업과 admin 폼은 화면 폭을 넘지 않는다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(buildUrl('/', { mockRole: 'DEVELOPER' }), { waitUntil: 'domcontentloaded' })
    await waitForApp(page)

    await expect(page.getByTestId('app-notice-modal')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    await page.getByRole('button', { name: '닫기' }).last().click()

    await page.goto(buildUrl('/admin/app-notices', { mockRole: 'DEVELOPER' }), { waitUntil: 'domcontentloaded' })
    await waitForApp(page)
    await closeNoticeIfOpen(page)
    await page.getByTestId('app-notice-create-open').click()
    await expect(page.getByTestId('app-notice-form')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  })
})
