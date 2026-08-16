import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron, expect, test, type Page } from '@playwright/test'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const DATE = '2026-08-08'
const VIEWPORTS = [600, 768, 1024, 1280, 1440, 1920]
const HEIGHTS = [720, 800, 900, 1080]
const HERE = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = resolveQaShotsDir(path.resolve(HERE, '../../../../docs/qa/1254-notice-banner-layout/round-fix-2-screenshots'))

async function overlapMetrics(page: Page, width: number, height: number) {
  return await page.evaluate(({ width, height }) => {
    const stack = document.querySelector<HTMLElement>('[data-app-update-notice-stack]')!
    const stackRect = stack.getBoundingClientRect()
    const interactive = Array.from(document.querySelectorAll<HTMLElement>('a, button, input'))
      .filter((element) => !element.closest('[data-app-update-notice-stack]'))
      .map((element) => {
        const rect = element.getBoundingClientRect()
        const area = Math.max(0, Math.min(stackRect.right, rect.right) - Math.max(stackRect.left, rect.left))
          * Math.max(0, Math.min(stackRect.bottom, rect.bottom) - Math.max(stackRect.top, rect.top))
        return { label: element.textContent?.trim() || element.getAttribute('data-testid') || element.tagName, tag: element.tagName, area, rect: rect.toJSON() }
      })
      .filter((item) => item.area > 0)
    const firstRow = document.querySelector<HTMLElement>('[data-testid^="arologis-unassigned-row-"]')
    const heading = document.querySelector<HTMLElement>('h3')
    return {
      width,
      height,
      stack: stackRect.toJSON(),
      heading: heading?.getBoundingClientRect().toJSON(),
      firstRow: firstRow?.getBoundingClientRect().toJSON(),
      overlap: interactive,
      total: interactive.reduce((sum, item) => sum + item.area, 0),
      order: Array.from(stack.children).map((element) => element.getAttribute('data-testid')),
      gaps: Array.from(stack.children).slice(1).map((element, index) => {
        const previous = stack.children[index].getBoundingClientRect()
        return Number((element.getBoundingClientRect().top - previous.bottom).toFixed(3))
      }),
    }
  }, { width, height })
}

test('PR #1254 라운드 fix 2 — 실 서버 가득 찬 목록에서 높이×폭 배너 불변식을 검증한다', async () => {
  fs.mkdirSync(SHOTS, { recursive: true })
  const app = await electron.launch({
    executablePath: path.resolve(HERE, '../../../arologis-desktop/node_modules/electron/dist/electron.exe'),
    args: [path.resolve(HERE, '../../../arologis-desktop')],
    env: { ...process.env, CERTIFICATE_FIXTURE: '', AROLOGIS_E2E_SKIP_TRUST_PROMPT: '1' },
  })
  const page = await app.firstWindow()
  await page.evaluate(async () => await window.arologisAuth.clearToken())
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('login-id-input')).toBeVisible({ timeout: 10_000 })
  await page.getByTestId('login-id-input').fill('admin')
  await page.getByTestId('login-password-input').fill(resolveQaCredential('QA_AROLOGIS_ADMIN_PASSWORD'))
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/#\/dispatches\/manual/, { timeout: 15_000 })
  await page.evaluate(() => { window.location.hash = '#/dispatches/unassigned' })
  page.on('console', (message) => console.log(`[BROWSER-CONSOLE] ${message.type()} ${message.text()}`))
  page.on('pageerror', (error) => console.log(`[BROWSER-PAGEERROR] ${error.stack ?? error.message}`))
  console.log(`[LIVE-BOOT] url=${page.url()} body=${(await page.locator('body').innerText()).slice(0, 240)}`)
  await expect(page.getByRole('heading', { name: '미배차 리스트' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('arologis-unassigned-date')).toBeVisible()

  const responsePromise = page.waitForResponse((response) => response.url().includes(`/admin/arologis/dispatches/unassigned?date=${DATE}`))
  await page.getByTestId('arologis-unassigned-date').fill(DATE)
  const response = await responsePromise
  const body = await response.json()
  const backendCount = body.data.entries.length
  await expect(page.locator('[data-testid^="arologis-unassigned-row-"]').first()).toBeVisible({ timeout: 15_000 })
  const rowCount = await page.locator('[data-testid^="arologis-unassigned-row-"]').count()
  console.log(`[REAL-DATA] date=${DATE} response=${response.status()} backendEntries=${backendCount} renderedRows=${rowCount}`)
  expect(response.status()).toBe(200)
  expect(backendCount).toBeGreaterThanOrEqual(20)
  expect(rowCount).toBe(backendCount)
  await expect(page.getByTestId('app-trust-root-disabled')).toBeVisible()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.send('updater:status', { kind: 'error', message: '업데이트 검증 상태 확인 실패' }))
  await expect(page.getByTestId('app-auto-update-status')).toBeVisible()

  try {
    for (const height of HEIGHTS) {
    for (const width of VIEWPORTS) {
      await page.setViewportSize({ width, height })
      await page.emulateMedia({ media: 'screen' })
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
      await page.getByTestId('arologis-unassigned-date').focus()
      const measured = await overlapMetrics(page, width, height)
      const y = await page.evaluate(() => {
        const heading = document.querySelector<HTMLElement>('h3')!
        const stack = document.querySelector<HTMLElement>('[data-app-update-notice-stack]')!
        const withBanner = heading.getBoundingClientRect().top
        stack.style.display = 'none'
        const withoutBanner = heading.getBoundingClientRect().top
        stack.style.removeProperty('display')
        return { withBanner, withoutBanner, difference: withoutBanner - withBanner }
      })
      const print = await page.emulateMedia({ media: 'print' }).then(() => page.locator('[data-print-exclude]').evaluateAll((elements) => elements.map((element) => ({ id: element.getAttribute('data-testid'), display: getComputedStyle(element).display }))))
      await page.emulateMedia({ media: 'screen' })
      console.log(`[RED-FIRST] ${JSON.stringify(measured)}`)
      await page.screenshot({ path: path.join(SHOTS, `red-first-${width}x${height}.png`), fullPage: false })
      const shot = path.join(SHOTS, `red-first-${width}x${height}.png`)
      console.log(`[SCREENSHOT] file=${shot} bytes=${fs.statSync(shot).size} 육안 확인=실 앱 화면 캡처`)
      expect(measured.total, `교차 면적: ${width}x${height}`).toBe(0)
      expect(y.difference, `본문 첫 행 y 밀림: ${width}x${height}`).toBe(0)
      expect(measured.gaps).toEqual(new Array(Math.max(0, measured.order.length - 1)).fill(12))
      expect(print.every((item) => item.display === 'none')).toBe(true)
    }
    }
  } finally {
    await app.close()
  }
})
