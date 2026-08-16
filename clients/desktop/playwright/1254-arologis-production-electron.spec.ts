import { _electron as electron, expect, test } from '@playwright/test'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaShotsDir } from './support/qa-screenshot-dir'
import { resolveQaCredential } from '../../../scripts/lib/qa-credentials.cjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const APP_DIR = path.resolve(HERE, '../../arologis-desktop')
const SHOTS = resolveQaShotsDir(path.resolve(HERE, '../../../docs/qa/1254-notice-banner-layout/scope-reduction-real-qa'))
const ELECTRON_BINARY = path.resolve(APP_DIR, 'node_modules/electron/dist', process.platform === 'win32' ? 'electron.exe' : 'electron')

test('PR #1254 범위 축소 — 배너 밖·내부 버튼 클릭과 네이티브 스크롤만 확인한다', async () => {
  const app = await electron.launch({
    executablePath: ELECTRON_BINARY,
    args: [...(process.platform === 'linux' ? ['--no-sandbox'] : []), APP_DIR],
    env: { ...process.env, CERTIFICATE_FIXTURE: '', AROLOGIS_E2E_SKIP_TRUST_PROMPT: '1' },
  })

  try {
    const page = await app.firstWindow()
    await page.route('http://localhost:8080/**', (route) => route.abort('connectionfailed'))
    await page.route('http://localhost:8097/**', async (route) => {
      if (route.request().method() === 'GET' || route.request().url().includes('/auth/admin/login')) return route.continue()
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) })
    })
    await page.evaluate(async () => window.arologisAuth.clearToken())
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByTestId('login-id-input').fill('admin')
    await page.getByTestId('login-password-input').fill(resolveQaCredential('QA_AROLOGIS_ADMIN_PASSWORD'))
    await page.getByTestId('login-submit').click()
    await expect(page).toHaveURL(/#\/dispatches\/manual/, { timeout: 15_000 })
    await page.goto(`${page.url().split('#')[0]}#/dispatches/unassigned`)
    await expect(page.getByTestId('arologis-unassigned-date')).toBeVisible({ timeout: 15_000 })
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.send('updater:status', { kind: 'error', message: '범위 축소 QA' }))
    const stack = page.locator('[data-app-update-notice-stack]')
    await expect(page.getByTestId('app-auto-update-status')).toBeVisible()

    const date = page.getByTestId('arologis-unassigned-date')
    await date.click()
    const dateFocused = await date.evaluate((element) => document.activeElement === element)
    const retry = stack.getByRole('button', { name: '다시 확인', exact: true })
    const retryCount = await retry.count()
    if (retryCount) await retry.click()
    const stackState = await stack.evaluate((element) => ({
      role: element.getAttribute('role'),
      scrollable: element.getAttribute('data-scrollable'),
      overflowY: getComputedStyle(element).overflowY,
    }))
    const evidence = { dateFocused, retryCount, stackState }
    console.log(`[SCOPE-REDUCTION-QA] ${JSON.stringify(evidence)}`)
    await page.screenshot({ path: path.join(SHOTS, 'scope-reduction-real-qa.png'), fullPage: true })
    expect(dateFocused).toBe(true)
    expect(retryCount).toBeGreaterThanOrEqual(1)
    expect(stackState.role).toBeNull()
    expect(stackState.scrollable).toBeNull()
    expect(['visible', 'auto', 'scroll']).toContain(stackState.overflowY)
  } finally {
    await app.close()
  }
})
