import { expect, test, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = resolveQaShotsDir(path.resolve(HERE, '../../../../docs/qa/1241-component-price-parity/screenshots'))
fs.mkdirSync(SHOTS, { recursive: true })
const API = process.env['REAL_QA_API_BASE_URL'] ?? 'http://127.0.0.1:8080'
const BASE = process.env['REAL_QA_RENDERER_BASE_URL'] ?? 'http://127.0.0.1:5198'
const BUNDLE = process.env['REAL_QA_1241_BUNDLE_CODE'] ?? 'AC060CS6PBH1SY'
async function login(page: Page): Promise<void> {
  const response = await page.request.post(`${API}/auth/login`, { data: { loginId: 'dev_master', password: resolveQaCredential('QA_DEV_DEFAULT_PASSWORD') } })
  if (!response.ok()) throw new Error(`로그인 실패 HTTP ${response.status()}: ${await response.text()}`)
  const session = (await response.json())?.data
  if (!session?.token) throw new Error(`로그인 응답 token 누락: ${JSON.stringify(session)}`)
  await page.addInitScript((snapshot) => { Object.defineProperty(window, 'samhanAuth', { configurable: true, value: { getToken: async () => snapshot, setToken: async () => undefined, clearToken: async () => undefined } }) }, { token: session.token, userId: session.userId, role: session.role, fullName: session.displayName, partnerCode: session.partnerCode ?? null, groups: session.groups ?? [] })
}
test('싱글중대형 세트의 판넬·리모컨 정본 금액과 구성품 행 수', async ({ page }) => {
  await login(page)
  await page.goto(`${BASE}/#/products/${BUNDLE}/edit`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('product-form-components-editor').waitFor({ state: 'visible', timeout: 30_000 })
  const rows = page.locator('[data-testid^="product-form-component-row-"]')
  const rowCount = await rows.count()
  const panel = rows.filter({ hasText: 'PC6NUNK1NW' })
  const remote = rows.filter({ hasText: 'AR-EH05' })
  await expect(panel).toHaveCount(1)
  await expect(remote).toHaveCount(1)
  await expect(panel.locator('input[type="text"]:not([disabled])')).toHaveValue('128000')
  await expect(remote.locator('input[type="text"]:not([disabled])')).toHaveValue('16000')
  await page.screenshot({ path: path.join(SHOTS, '01-single-set-component-prices.png'), fullPage: true })
  console.log(`ROWS ${rowCount}; PANEL PC6NUNK1NW 128000; REMOTE AR-EH05 16000`)
})
