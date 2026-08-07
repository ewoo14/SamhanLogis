import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/** PR #1023(#1017) 라이브QA 보강 — 정정된 전표의 화면 금액. */
import { expect, test } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
const _dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5941'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const SLIP_ID = process.env['SLIP_ID'] ?? ''
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/1017-vat-correction-live'))
fs.mkdirSync(SHOTS, { recursive: true })

test('#1017 정정된 전표 상세 — 화면 금액', async ({ page }) => {
  const res = await page.request.post(`${API_BASE}/auth/login`, {
    data: { loginId: 'dev_manager', password: resolveQaCredential('QA_DEV_DEFAULT_PASSWORD') },
  })
  expect(res.ok(), `로그인 실패 ${res.status()}`).toBeTruthy()
  const d = (await res.json()).data ?? {}
  await page.addInitScript(({ tok, r, uid, name }: { tok: string; r: string; uid: string; name: string }) => {
    Object.defineProperty(window, 'samhanAuth', { configurable: true, value: {
      getToken: async () => ({ token: tok, userId: uid, role: r, fullName: name, partnerCode: null }),
      setToken: async () => undefined, clearToken: async () => undefined } })
  }, { tok: d.token ?? '', r: d.role ?? '', uid: d.userId ?? '', name: d.displayName ?? 'dev_manager' })
  await page.goto(`${BASE_URL}/#/sales/${SLIP_ID}`)
  await page.waitForTimeout(7000)
  await page.screenshot({ path: path.join(SHOTS, '01-corrected-slip-detail.png'), fullPage: true })
})
