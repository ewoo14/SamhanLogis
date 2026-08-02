import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/** PR #1004(#1002) 라이브QA — 입금보고서 분할 행 · 자동 빈행 실캡처. */
import { expect, test } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
const _d = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5943'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const SHOTS = resolveQaShotsDir(path.resolve(_d, '../../../../docs/qa/1002-cash-receipt-live'))
fs.mkdirSync(SHOTS, { recursive: true })

test('#1002 입금보고서 — 분할 행과 자동 빈행', async ({ page }) => {
  const res = await page.request.post(`${API_BASE}/auth/login`, {
    data: { loginId: 'dev_master', password: process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!' },
  })
  expect(res.ok(), `로그인 실패 ${res.status()}`).toBeTruthy()
  const d = (await res.json()).data ?? {}
  await page.addInitScript(({ tok, r, uid, name }: { tok: string; r: string; uid: string; name: string }) => {
    Object.defineProperty(window, 'samhanAuth', { configurable: true, value: {
      getToken: async () => ({ token: tok, userId: uid, role: r, fullName: name, partnerCode: null }),
      setToken: async () => undefined, clearToken: async () => undefined } })
  }, { tok: d.token ?? '', r: d.role ?? '', uid: d.userId ?? '', name: d.displayName ?? 'dev_master' })

  await page.goto(`${BASE_URL}/#/accounting/admin/cash-receipts`)
  await page.waitForTimeout(6000)
  await page.screenshot({ path: path.join(SHOTS, '01-list.png'), fullPage: true })

  await page.goto(`${BASE_URL}/#/accounting/admin/cash-receipts/new`)
  await page.waitForTimeout(6000)
  await page.screenshot({ path: path.join(SHOTS, '02-new-blank-row.png'), fullPage: true })
  fs.writeFileSync(path.join(SHOTS, 'new-page-text.txt'), await page.locator('body').innerText(), 'utf8')
})
