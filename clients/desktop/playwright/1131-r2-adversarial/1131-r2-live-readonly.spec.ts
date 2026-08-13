import { expect, test } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const APP_BASE = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'
const API_BASE = process.env['API_BASE'] ?? 'http://127.0.0.1:8080'
const SHOTS = resolveQaShotsDir(path.resolve(HERE, '../../../../docs/qa/1131-r2-adversarial/screenshots'))

test('라이브 대표 DRAFT 2026/08/07-41 읽기 전용 화면', async ({ context, page }) => {
  fs.mkdirSync(SHOTS, { recursive: true })
  const password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  const loginResponse = await page.request.post(`${API_BASE}/auth/login`, {
    data: { loginId: 'dev_master', password },
  })
  const loginRaw = await loginResponse.text()
  expect(loginResponse.status(), loginRaw).toBe(200)
  const login = JSON.parse(loginRaw).data
  await context.addInitScript(({ token, userId, role, displayName }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ token, userId, role, fullName: displayName, partnerCode: null }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, login)
  const listed = await page.request.get(`${API_BASE}/slips?slipType=OUTBOUND&status=DRAFT&page=0&size=500`, {
    headers: { Authorization: `Bearer ${login.token}` },
  })
  const listedRaw = await listed.text()
  expect(listed.status(), listedRaw).toBe(200)
  const target = JSON.parse(listedRaw).data.content.find((row: { slipNo?: string }) => row.slipNo === '2026/08/07-41')
  expect(target, '대표 DRAFT 전표').toBeTruthy()
  await page.goto(`${APP_BASE}/#/sales/${target.id}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: /판매전표 상세.*2026\/08\/07-41/ })).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: path.join(SHOTS, '08-live-draft-2026-08-07-41.png'), fullPage: true })
})
