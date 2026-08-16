import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron, expect, test } from '@playwright/test'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const APP_DIR = path.resolve(HERE, '../../../arologis-desktop')
const OUT = resolveQaShotsDir(path.resolve(HERE, '../../../../docs/qa/1254-notice-banner-layout/sol-r5-final'))

test('PR #1254 SOL R5 — 45행 및 0px stack 캡처', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), '1254-sol-r5-shot-'))
  const app = await electron.launch({
    executablePath: path.resolve(APP_DIR, 'node_modules/electron/dist/electron.exe'),
    args: [`--user-data-dir=${userDataDir}`, APP_DIR],
    env: { ...process.env, CERTIFICATE_FIXTURE: '', AROLOGIS_E2E_SKIP_TRUST_PROMPT: '1' },
  })
  try {
    const page = await app.firstWindow()
    await page.route('http://localhost:8080/**', (route) => route.abort('connectionfailed'))
    await page.route('http://localhost:8097/**', (route) => {
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
    const target = await page.evaluate(() => { const url = new URL(location.href); url.hash = '/dispatches/unassigned'; return url.href })
    await page.goto(target)
    await expect(page.getByRole('heading', { name: '미배차 리스트' })).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(2_000)
    const responsePromise = page.waitForResponse((response) => response.url().includes('/admin/arologis/dispatches/unassigned?date=2026-08-08'))
    await page.getByTestId('arologis-unassigned-date').fill('2026-08-08')
    const response = await responsePromise
    const body = await response.json()
    const backend = body.data.entries.length as number
    const rows = page.locator('[data-testid^="arologis-unassigned-row-"]')
    await expect(rows).toHaveCount(backend, { timeout: 15_000 })
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('updater:status', { kind: 'error', message: '업데이트 검증 상태 확인 실패' })
    })
    await expect(page.getByTestId('app-auto-update-status')).toBeVisible()
    const stack = page.locator('[data-app-update-notice-stack]')
    await page.setViewportSize({ width: 600, height: 720 })
    await stack.evaluate((element) => { (element as HTMLElement).scrollTop = (element as HTMLElement).scrollHeight })
    const shot600 = path.join(OUT, '600x720-three-banners-final-real-qa.png')
    await page.screenshot({ path: shot600, fullPage: false })
    console.log(`[CAPTURE-600] file=${shot600} bytes=${fs.statSync(shot600).size} selectedDate=${await page.getByTestId('arologis-unassigned-date').inputValue()} response=${response.status()} backendEntries=${backend} renderedRows=${await rows.count()} bannerDomCount=${await stack.locator(':scope > *').count()}`)
    await page.setViewportSize({ width: 320, height: 480 })
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    const zero = await stack.evaluate((element) => ({ top: element.getBoundingClientRect().top, bottom: element.getBoundingClientRect().bottom, clientHeight: (element as HTMLElement).clientHeight, scrollHeight: (element as HTMLElement).scrollHeight }))
    const shot320 = path.join(OUT, '320x480-zero-height-stack-final-real-qa.png')
    await page.screenshot({ path: shot320, fullPage: false })
    console.log(`[CAPTURE-320] file=${shot320} bytes=${fs.statSync(shot320).size} stack=${JSON.stringify(zero)}`)
    await page.setViewportSize({ width: 600, height: 720 })
    const rowAction = rows.nth(Math.min(20, backend - 1)).getByRole('button', { name: '수동 배차로 이동' })
    const rowTestId = await rows.nth(Math.min(20, backend - 1)).getAttribute('data-testid')
    await rowAction.scrollIntoViewIfNeeded()
    await rowAction.click()
    await expect(page.getByRole('heading', { name: '수동 배차' })).toBeVisible({ timeout: 15_000 })
    console.log(`[SCROLLED-ROW-CLICK] row=${rowTestId} target=수동 배차로 이동 hash=${new URL(page.url()).hash}`)
  } finally {
    await app.close()
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
})
