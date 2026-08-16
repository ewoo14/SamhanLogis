import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron, expect, test } from '@playwright/test'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const APP_DIR = path.resolve(HERE, '../../../arologis-desktop')
const ELECTRON = path.resolve(APP_DIR, 'node_modules/electron/dist/electron.exe')

test('PR #1254 SOL R5 — 최신 복원과 날짜 조회의 화면 경쟁 조건을 반복한다', async () => {
  const results: Array<Record<string, unknown>> = []
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), '1254-sol-r5-race-'))
    const app = await electron.launch({
      executablePath: ELECTRON,
      args: [`--user-data-dir=${userDataDir}`, APP_DIR],
      env: { ...process.env, CERTIFICATE_FIXTURE: '', AROLOGIS_E2E_SKIP_TRUST_PROMPT: '1' },
    })
    try {
      const page = await app.firstWindow()
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
      const target = await page.evaluate(() => { const url = new URL(location.href); url.hash = '/dispatches/unassigned'; return url.href })
      await page.goto(target)
      await expect(page.getByTestId('arologis-unassigned-date')).toBeVisible({ timeout: 15_000 })
      const responsePromise = page.waitForResponse((response) => response.url().includes('/admin/arologis/dispatches/unassigned?date=2026-08-08'))
      await page.getByTestId('arologis-unassigned-date').fill('2026-08-08')
      const response = await responsePromise
      const body = await response.json()
      await page.waitForTimeout(2_000)
      const rows = await page.locator('[data-testid^="arologis-unassigned-row-"]').count()
      const inputDate = await page.getByTestId('arologis-unassigned-date').inputValue()
      const result = { attempt, responseEntries: body.data.entries.length, renderedRows: rows, inputDate }
      results.push(result)
      console.log(`[RACE] ${JSON.stringify(result)}`)
    } finally {
      await app.close()
      fs.rmSync(userDataDir, { recursive: true, force: true })
    }
  }
  console.log(`[RACE-SUMMARY] ${JSON.stringify(results)}`)
})
