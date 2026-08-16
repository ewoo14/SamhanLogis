import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron, expect, test } from '@playwright/test'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const APP_DIR = path.resolve(HERE, '../../../arologis-desktop')
const SHOTS = resolveQaShotsDir(path.resolve(HERE, '../../../../docs/qa/1254-notice-banner-layout/luna-final'))

async function gotoHash(page: import('@playwright/test').Page, route: string): Promise<void> {
  const target = await page.evaluate((nextRoute) => {
    const url = new URL(window.location.href)
    url.hash = nextRoute
    return url.href
  }, route)
  await page.goto(target)
}

test('PR #1254 LUNA 마감 — 배너 스크롤 컨테이너 4건', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), '1254-luna-final-'))
  const app = await electron.launch({
    executablePath: path.resolve(APP_DIR, 'node_modules/electron/dist/electron.exe'),
    args: [`--user-data-dir=${userDataDir}`, APP_DIR],
    env: { ...process.env, CERTIFICATE_FIXTURE: '', AROLOGIS_E2E_SKIP_TRUST_PROMPT: '1' },
  })
  try {
    const page = await app.firstWindow()
    await page.route('http://localhost:8080/**', (route) => route.abort('connectionfailed'))
    await page.route('http://localhost:8097/**', async (route) => {
      if (route.request().method() === 'POST' && route.request().url().includes('/admin/arologis/dispatches/history')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { id: 'blocked', savedAt: '2026-08-16T00:00:00Z' } }) })
      }
      return route.continue()
    })
    await page.evaluate(async () => { await window.arologisAuth.clearToken() })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByTestId('login-id-input').fill('admin')
    await page.getByTestId('login-password-input').fill(resolveQaCredential('QA_AROLOGIS_ADMIN_PASSWORD'))
    await page.getByTestId('login-submit').click()
    await expect(page).toHaveURL(/#\/dispatches\/manual/, { timeout: 15_000 })
    await gotoHash(page, '/dispatches/unassigned')
    await expect(page.getByRole('heading', { name: '미배차 리스트' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('arologis-unassigned-date')).toBeVisible()
    await page.waitForTimeout(1_500)
    const responsePromise = page.waitForResponse((response) => response.url().includes('/admin/arologis/dispatches/unassigned?date=2026-08-08'))
    await page.getByTestId('arologis-unassigned-date').fill('2026-08-08')
    const response = await responsePromise
    const body = await response.json()
    await expect(page.locator('[data-testid^="arologis-unassigned-row-"]')).toHaveCount(Number(body.data.entries.length), { timeout: 15_000 })
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('updater:status', { kind: 'error', message: '업데이트 검증 상태 확인 실패' })
    })
    for (const id of ['app-version-policy-error', 'app-trust-root-disabled', 'app-auto-update-status']) await expect(page.getByTestId(id)).toBeVisible()

    const stack = page.locator('[data-app-update-notice-stack]')
    await page.setViewportSize({ width: 600, height: 720 })
    const baseline = await stack.evaluate((element) => {
      const root = element as HTMLElement
      const children = Array.from(root.children) as HTMLElement[]
      return {
        order: children.map((child) => child.dataset.testid),
        gaps: children.slice(1).map((child, index) => Number((child.getBoundingClientRect().top - children[index]!.getBoundingClientRect().bottom).toFixed(3))),
      }
    })
    expect(baseline.order).toEqual(['app-version-policy-error', 'app-trust-root-disabled', 'app-auto-update-status'])
    expect(baseline.gaps).toEqual([12, 12])

    for (const [width, height] of [[320, 480], [480, 480], [320, 600], [600, 720]] as const) {
      await page.setViewportSize({ width, height })
      const size = await stack.evaluate((element) => {
        const root = element as HTMLElement
        const style = getComputedStyle(root)
        return { top: root.getBoundingClientRect().top, bottom: root.getBoundingClientRect().bottom, clientHeight: root.clientHeight, offsetHeight: root.offsetHeight, scrollHeight: root.scrollHeight, height: style.height, maxBlockSize: style.maxBlockSize, minBlockSize: style.minBlockSize, paddingBottom: style.paddingBottom, display: style.display }
      })
      console.log(`[SMALL-VIEWPORT] ${width}x${height} ${JSON.stringify(size)}`)
      expect(size.clientHeight, `${width}x${height} stack 높이`).toBeGreaterThan(0)
      expect(size.scrollHeight).toBeGreaterThan(0)
    }

    await page.setViewportSize({ width: 600, height: 720 })
    const main = page.locator('main').first()
    await page.evaluate(() => { (window as typeof window & { __lunaScrollbarClicks?: number }).__lunaScrollbarClicks = 0 })
    await main.evaluate((element) => element.addEventListener('click', () => { (window as typeof window & { __lunaScrollbarClicks?: number }).__lunaScrollbarClicks = ((window as typeof window & { __lunaScrollbarClicks?: number }).__lunaScrollbarClicks ?? 0) + 1 }, { capture: true }))
    const scrollbar = await stack.evaluate((element) => { const root = element as HTMLElement; root.scrollTop = 0; const rect = root.getBoundingClientRect(); return { x: rect.right - 3, y: rect.top + rect.height * 0.8 } })
    await page.mouse.click(scrollbar.x, scrollbar.y)
    const scrollbarResult = await page.evaluate(() => ({ clicks: (window as typeof window & { __lunaScrollbarClicks?: number }).__lunaScrollbarClicks ?? 0, hit: document.elementFromPoint(innerWidth - 3, 635)?.closest('[data-testid]')?.getAttribute('data-testid') ?? null }))
    console.log(`[SCROLLBAR-CLICK-FINAL] ${JSON.stringify({ scrollbar, ...scrollbarResult })}`)
    expect(scrollbarResult.clicks).toBe(0)

    const wheelBefore = await stack.evaluate((element) => {
      const root = element as HTMLElement
      root.scrollTop = root.scrollHeight
      const content = document.querySelector<HTMLElement>('main')!
      content.scrollTop = 100
      return { stack: root.scrollTop, main: content.scrollTop, x: root.getBoundingClientRect().left + root.getBoundingClientRect().width / 2, y: root.getBoundingClientRect().top + root.getBoundingClientRect().height / 2 }
    })
    await page.mouse.move(wheelBefore.x, wheelBefore.y)
    await page.mouse.wheel(0, 240)
    const wheelAfter = await page.evaluate(() => ({ stack: document.querySelector<HTMLElement>('[data-app-update-notice-stack]')!.scrollTop, main: document.querySelector<HTMLElement>('main')!.scrollTop }))
    console.log(`[WHEEL-BOUNDARY-FINAL] ${JSON.stringify({ before: wheelBefore, after: wheelAfter })}`)
    expect(wheelAfter.main).toBeGreaterThan(wheelBefore.main)

    const buttonReach = await stack.locator('button').evaluateAll((buttons) => buttons.map((button) => {
      const element = button as HTMLElement
      element.scrollIntoView({ block: 'nearest' })
      const root = element.closest<HTMLElement>('[data-app-update-notice-stack]')!
      const rect = element.getBoundingClientRect()
      const stackRect = root.getBoundingClientRect()
      return { text: element.textContent?.trim(), top: rect.top, bottom: rect.bottom, stackBottom: stackRect.bottom, within: rect.top >= stackRect.top && rect.bottom <= stackRect.bottom }
    }))
    console.log(`[BUTTON-BOUNDARY-FINAL] ${JSON.stringify(buttonReach)}`)
    expect(buttonReach.every((item) => item.within)).toBe(true)

    await page.screenshot({ path: path.join(SHOTS, '600x720-three-banners-final-real-qa.png'), fullPage: false })
  } finally {
    await app.close()
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
})
