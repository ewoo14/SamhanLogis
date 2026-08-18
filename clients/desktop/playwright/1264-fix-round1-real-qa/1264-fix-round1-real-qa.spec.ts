import { expect, test, type Page } from '@playwright/test'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const here = path.dirname(fileURLToPath(import.meta.url))
const shotsDir = resolveQaShotsDir(here)
const gateway = process.env['API_BASE'] ?? 'http://127.0.0.1:8080'
const app = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5943'

type Login = { token: string; userId: string; role: string; groups?: Array<{ id: string }> }
function headers(login: Login): Record<string, string> {
  return {
    Authorization: `Bearer ${login.token}`,
    'X-User-Id': login.userId,
    'X-User-Role': login.role || 'MASTER',
    'X-Is-System-Master': 'true',
    'X-User-Groups': (login.groups ?? []).map((group) => group.id).join(','),
    'X-Samhan-Gateway-Attestation': resolveQaCredential('SAMHAN_GATEWAY_ATTESTATION'),
  }
}

async function login(page: Page): Promise<Login> {
  const response = await page.request.post(`${gateway}/auth/login`, {
    data: { loginId: 'dev_master', password: resolveQaCredential('QA_DEV_DEFAULT_PASSWORD') },
  })
  expect(response.status(), await response.text()).toBe(200)
  return (await response.json()).data as Login
}

async function capture(page: Page, loginState: Login, date: string, kind: '매출' | '매입', file: string): Promise<number> {
  await page.getByTestId('daily-closing-filter-date').fill(date)
  await page.getByTestId('daily-closing-filter-date').press('Enter')
  await page.locator('[data-testid="closing-kind-toggle"] button').filter({ hasText: kind }).evaluate((element) => (element as HTMLButtonElement).click())
  await page.getByTestId('daily-closing-tab-result').click()
  await expect(page.getByTestId('daily-closing-table')).toBeVisible({ timeout: 30_000 })
  const rows = page.locator('[data-testid^="daily-closing-data-row-"]')
  await expect.poll(() => rows.count(), { timeout: 30_000 }).toBeGreaterThan(0)
  const count = await rows.count()
  const slipType = kind === '매입' ? 'INBOUND' : 'OUTBOUND'
  const api = await page.request.get(`${gateway}/slips/query/daily-closing?slipDate=${date}&slipType=${slipType}`, { headers: headers(loginState) })
  expect(api.status(), await api.text()).toBe(200)
  const apiRows = ((await api.json()).data ?? []) as unknown[]
  console.log(`LIVE|${kind}|date=${date}|apiRows=${apiRows.length}|uiRows=${count}|file=${file}`)
  await page.screenshot({ path: path.join(shotsDir, file), fullPage: true })
  return count
}

test('PR1264 fix 실제 조회 — 매출·매입 생성 전/기존 생성 후 화면과 행 수', async ({ page }) => {
  const current = await login(page)
  await page.goto(`${app}/#/accounting/daily-closings`, { waitUntil: 'domcontentloaded' })
  if (await page.getByRole('heading', { name: 'Samhan Public 로그인' }).isVisible().catch(() => false)) {
    await page.getByRole('textbox', { name: '사용자 ID (필수)' }).fill('dev_master')
    await page.getByRole('textbox', { name: '비밀번호 (필수)' }).fill(resolveQaCredential('QA_DEV_DEFAULT_PASSWORD'))
    await page.getByRole('button', { name: '로그인' }).click()
  }
  await expect(page.getByTestId('daily-closing-page')).toBeVisible({ timeout: 30_000 })
  await capture(page, current, '2026-08-14', '매출', '01-sales-before-existing-generation.png')
  await capture(page, current, '2026-08-14', '매입', '02-purchase-before-existing-generation.png')
  await capture(page, current, '2026-08-14', '매출', '03-sales-after-existing-generation.png')
  await capture(page, current, '2026-08-14', '매입', '04-purchase-after-existing-generation.png')
})
