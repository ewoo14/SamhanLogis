import { _electron as electron, expect, test } from '@playwright/test'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const APP_DIR = path.resolve(HERE, '../../arologis-desktop')
const SHOTS = path.resolve(HERE, '../../../docs/qa/1254-notice-banner-layout/screenshots')
mkdirSync(SHOTS, { recursive: true })

test('PR #1254 production Electron에서 배너 도달성·모달·print·폭별 상단 조작을 실측한다', async () => {
  const app = await electron.launch({
    executablePath: path.resolve(APP_DIR, 'node_modules/electron/dist/electron.exe'),
    args: [APP_DIR],
    env: { ...process.env, CERTIFICATE_FIXTURE: '', AROLOGIS_E2E_SKIP_TRUST_PROMPT: '1' },
  })
  try {
    const page = await app.firstWindow()
    await page.evaluate(async () => { await window.arologisAuth.clearToken() })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('login-id-input')).toBeVisible({ timeout: 10000 })
    await page.route('http://localhost:8097/**', async (route) => {
      const url = route.request().url()
      if (url.includes('/auth/admin/login')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ accessToken: 'qa-local-only', refreshToken: 'qa-local-refresh', role: 'AROLOGIS_MASTER', expiresAt: '2099-01-01T00:00:00Z', loginId: 'qa', fullName: '적대검증자' }) })
      if (url.includes('/auth/me')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ userId: '00000000-0000-0000-0000-000000010001', role: 'AROLOGIS_MASTER', loginId: 'qa', fullName: '적대검증자' }) })
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) })
    })
    await page.route('**/auth/admin/login', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ accessToken: 'qa-local-only', refreshToken: 'qa-local-refresh', role: 'AROLOGIS_MASTER', expiresAt: '2099-01-01T00:00:00Z', loginId: 'qa', fullName: '적대검증자' }) }))
    await page.route('**/auth/me', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ userId: '00000000-0000-0000-0000-000000010001', role: 'AROLOGIS_MASTER', loginId: 'qa', fullName: '적대검증자' }) }))
    await page.route('http://localhost:8080/**', async (route) => route.abort())
    await page.route('**/admin/arologis/dispatches/unassigned**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { date: '2026-08-16', totalOutbound: 0, unassignedCount: 0, entries: [] } }) }))
    await page.getByTestId('login-id-input').fill('qa')
    await page.getByTestId('login-password-input').fill('qa-password')
    await page.getByTestId('login-submit').click()
    await page.waitForTimeout(1000)
    console.log(`[AUTH-DEBUG] url=${page.url()} body=${(await page.locator('body').innerText()).slice(0, 200)}`)
    await page.evaluate(async () => {
      await window.arologisAuth.setToken({ accessToken: 'qa-local-only', refreshToken: 'qa-local-refresh', userId: '00000000-0000-0000-0000-000000010001', role: 'AROLOGIS_MASTER', loginId: 'qa', fullName: '적대검증자', expiresAt: '2099-01-01T00:00:00Z' })
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)
    await page.evaluate(() => { window.location.hash = '#/dispatches/unassigned' })
    await expect(page.getByTestId('arologis-unassigned-date')).toBeVisible({ timeout: 15000 })
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('updater:status', { kind: 'error', message: '업데이트 검증 상태 확인 실패' })
    })
    await expect(page.getByTestId('app-version-policy-error')).toBeVisible()
    await expect(page.getByTestId('app-auto-update-status')).toBeVisible()

    const metrics: Array<Record<string, unknown>> = []
    for (const width of [1024, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 })
      await page.emulateMedia({ media: 'screen' })
      await page.waitForTimeout(500)
      const input = page.getByTestId('arologis-unassigned-date')
      // Electron의 native date picker는 headless BrowserWindow를 닫을 수 있어 실제 입력 포커스 도달을 단정한다.
      await input.focus()
      const measured = await page.evaluate((width) => {
        const date = document.querySelector<HTMLInputElement>('[data-testid="arologis-unassigned-date"]')!
        const notice = document.querySelector<HTMLElement>('[data-testid="app-auto-update-status"]')
        const stack = document.querySelector<HTMLElement>('[data-app-update-notice-stack]')
        const h1 = document.querySelector<HTMLElement>('h3')
        const actions = notice?.querySelector<HTMLElement>('[class*="actions"]')
        const button = actions?.querySelector<HTMLElement>('button')
        let hit: string | null = null
        if (actions && button) {
          const ar = actions.getBoundingClientRect(); const br = button.getBoundingClientRect()
          hit = document.elementFromPoint(Math.min(ar.right - 1, br.right + 24), ar.top + ar.height / 2)?.className || null
        }
        return {
          width, active: document.activeElement?.getAttribute('data-testid'),
          hit, notice: notice?.getBoundingClientRect().toJSON(), stack: stack?.getBoundingClientRect().toJSON(),
          h1: h1?.getBoundingClientRect().toJSON(),
          order: stack ? Array.from(stack.children).map((el) => el.getAttribute('data-testid')) : [],
          gaps: stack ? Array.from(stack.children).slice(1).map((el, index) => {
            const previous = stack.children[index].getBoundingClientRect()
            return Number((el.getBoundingClientRect().top - previous.bottom).toFixed(3))
          }) : [],
        }
      }, width)
      await page.screenshot({ path: path.join(SHOTS, `${width}px.png`), fullPage: true })
      await page.emulateMedia({ media: 'print' })
      const printDisplay = await page.locator('.no-print, [data-print-exclude]').evaluateAll((els) => els.map((el) => ({ id: el.getAttribute('data-testid'), display: getComputedStyle(el).display, visibility: getComputedStyle(el).visibility })))
      const result = { ...measured, printDisplay }
      metrics.push(result)
      console.log(`[GREEN] ${JSON.stringify(result)}`)
      expect(result.active).toBe('arologis-unassigned-date')
      if (result.hit !== null) expect(String(result.hit)).not.toContain('actions')
      expect(result.order).toEqual(['app-version-policy-error', 'app-trust-root-disabled', 'app-auto-update-status'])
      expect(result.gaps).toEqual([12, 12])
      expect(result.printDisplay.length).toBeGreaterThan(0)
      expect(result.printDisplay.every((item) => item.display === 'none')).toBe(true)
    }

    const at1024 = metrics.find((item) => item.width === 1024)
    if (at1024?.stack && at1024.h1) {
      const stack = at1024.stack as { top: number }
      const h1 = at1024.h1 as { top: number; bottom: number }
      expect(stack.top).toBeGreaterThanOrEqual(h1.bottom)
    }

    await page.evaluate(() => {
      const modal = document.createElement('section')
      modal.dataset.testid = 'app-version-blocking-modal'
      modal.style.position = 'relative'; modal.style.zIndex = '1000'; modal.textContent = '긴급 업데이트'
      document.body.appendChild(modal)
    })
    const stackZ = await page.locator('[data-app-update-notice-stack]').evaluate((el) => getComputedStyle(el).zIndex)
    const modalZ = await page.getByTestId('app-version-blocking-modal').evaluate((el) => getComputedStyle(el).zIndex)
    console.log(`[GREEN-②] modal.z-index=${modalZ} stack.z-index=${stackZ}`)
    expect(Number(modalZ)).toBeGreaterThan(Number(stackZ))

    await page.emulateMedia({ media: 'screen' })
    await page.setViewportSize({ width: 1024, height: 900 })
    const bodyY = await page.evaluate(() => {
      const heading = document.querySelector<HTMLElement>('h3')!
      const stack = document.querySelector<HTMLElement>('[data-app-update-notice-stack]')!
      const withBanner = heading.getBoundingClientRect().top
      stack.style.display = 'none'
      const withoutBanner = heading.getBoundingClientRect().top
      stack.style.removeProperty('display')
      return { withBanner, withoutBanner, difference: withoutBanner - withBanner }
    })
    console.log(`[GREEN-INVARIANT] body-first-y=${JSON.stringify(bodyY)}`)
    expect(bodyY.difference).toBe(0)
  } finally {
    await app.close()
  }
})
