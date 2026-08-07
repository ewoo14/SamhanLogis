import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/** PR #1026(#1008) 라이브QA — 일마감 화면 실캡처. */
import { expect, test } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
const _d = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5942'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const SHOTS = resolveQaShotsDir(path.resolve(_d, '../../../../docs/qa/1008-daily-closing-live'))
fs.mkdirSync(SHOTS, { recursive: true })

test('#1008 일마감 화면 — 재검증 결과 표시', async ({ page }) => {
  const res = await page.request.post(`${API_BASE}/auth/login`, {
    data: { loginId: 'dev_master', password: process.env['DEV_PASSWORD'] ?? (process.env.DEV_PASSWORD ?? '') },
  })
  expect(res.ok(), `로그인 실패 ${res.status()}`).toBeTruthy()
  const d = (await res.json()).data ?? {}
  await page.addInitScript(({ tok, r, uid, name }: { tok: string; r: string; uid: string; name: string }) => {
    Object.defineProperty(window, 'samhanAuth', { configurable: true, value: {
      getToken: async () => ({ token: tok, userId: uid, role: r, fullName: name, partnerCode: null }),
      setToken: async () => undefined, clearToken: async () => undefined } })
  }, { tok: d.token ?? '', r: d.role ?? '', uid: d.userId ?? '', name: d.displayName ?? 'dev_master' })
  await page.goto(`${BASE_URL}/#/accounting/daily-closings`)
  await page.waitForTimeout(4000)
  // 마감 데이터가 있는 날짜로 조회
  const dateInputs = page.locator('input[type="date"]')
  const n = await dateInputs.count()
  for (let i = 0; i < n; i++) await dateInputs.nth(i).fill(process.env['QA_DATE'] ?? '2020-01-02')
  await page.waitForTimeout(6000)
  await page.screenshot({ path: path.join(SHOTS, '01-daily-closing-list.png'), fullPage: true })
  const bodyText = await page.locator('body').innerText()
  fs.writeFileSync(path.join(SHOTS, 'page-text.txt'), bodyText, 'utf8')
})
