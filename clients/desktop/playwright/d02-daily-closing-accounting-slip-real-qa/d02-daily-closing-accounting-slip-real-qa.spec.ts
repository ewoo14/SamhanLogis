import { expect, test, type Page } from '@playwright/test'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const here = path.dirname(fileURLToPath(import.meta.url))
const shotsDir = resolveQaShotsDir(here)
const gateway = process.env['API_BASE'] ?? 'http://127.0.0.1:8080'
const isolatedSlip = process.env['ISOLATED_SLIP_API'] ?? 'http://127.0.0.1:18186'
const date = '2026-08-03'

type Login = { token: string; userId: string; role: string; displayName: string; groups?: Array<{ id: string }> }
type Row = { accountingPostedAt?: string | null; slipNo?: string | null; sourceLineNo?: number | null; [key: string]: unknown }

function headers(login: Login): Record<string, string> {
  return {
    Authorization: `Bearer ${login.token}`,
    'X-User-Id': login.userId,
    'X-User-Role': login.role || 'MASTER',
    'X-Is-System-Master': 'true',
    'X-User-Name': 'D02-REAL-QA',
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

async function directRows(page: Page, current: Login, slipType: 'OUTBOUND' | 'INBOUND'): Promise<Row[]> {
  const response = await page.request.get(`${isolatedSlip}/slips/query/daily-closing?slipDate=${date}&slipType=${slipType}`, { headers: headers(current) })
  const raw = await response.text()
  expect(response.status(), raw).toBe(200)
  const rows = (JSON.parse(raw).data ?? []) as Row[]
  console.log(`LIVE|${slipType}|date=${date}|rows=${rows.length}|lineNumbers=${rows.map((row) => row.sourceLineNo ?? '?').join(',')}`)
  return rows
}

async function proxyIsolatedSlip(page: Page, current: Login): Promise<void> {
  await page.route(`${gateway}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const isolated = url.pathname.startsWith('/slips')
      || url.pathname.startsWith('/admin/sales-slips')
      || url.pathname.startsWith('/admin/purchase-slips')
    if (!isolated) return route.continue()
    const response = await route.fetch({
      url: `${isolatedSlip}${url.pathname}${url.search}`,
      method: request.method(),
      headers: { ...request.headers(), ...headers(current) },
      postData: request.postDataBuffer() ?? undefined,
    })
    console.log(`REAL_SLIP_PROXY|${request.method()} ${url.pathname}|HTTP ${response.status()}`)
    await route.fulfill({ response })
  })
}

async function openDateAndKind(page: Page, kind: 'SALES' | 'PURCHASE', tab: 'result' | 'pre_issued'): Promise<number> {
  await expect(page.getByTestId('daily-closing-page')).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('daily-closing-filter-date').fill(date)
  await page.getByTestId('daily-closing-filter-date').press('Enter')
  await page.locator('[data-testid="closing-kind-toggle"]:visible').locator('button').filter({ hasText: kind === 'SALES' ? '매출' : '매입' }).click({ force: true })
  await page.getByTestId(`daily-closing-tab-${tab}`).click()
  await expect(page.getByTestId('daily-closing-table')).toBeVisible({ timeout: 30_000 })
  const rows = page.locator('[data-testid^="daily-closing-data-row-"]')
  const count = await rows.count()
  expect(count, `${kind} ${date} 원본행`).toBeGreaterThan(0)
  console.log(`UI|${kind}|date=${date}|rows=${count}`)
  return count
}

test('D-02 실제 매출·매입 회계전표 생성, 중복 차단, 회계반영 잠금을 확인한다', async ({ page }) => {
  const current = await login(page)
  await proxyIsolatedSlip(page, current)
  const outbound = await directRows(page, current, 'OUTBOUND')
  const inbound = await directRows(page, current, 'INBOUND')
  expect(outbound).toHaveLength(4)
  expect(inbound.length).toBeGreaterThan(0)

  await page.goto(`${process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5942'}/#/accounting/daily-closings`, { waitUntil: 'domcontentloaded' })
  await openDateAndKind(page, 'SALES', 'result')
  const salesButton = page.locator('[data-testid^="daily-closing-accounting-create-"]').first()
  await expect(salesButton).toBeEnabled()
  await salesButton.click()
  await expect(page.getByTestId('daily-closing-accounting-result')).toContainText('회계전표 생성 성공', { timeout: 30_000 })
  await page.screenshot({ path: path.join(shotsDir, '01-sales-accounting-slip-created.png'), fullPage: true })

  await page.locator('[data-testid="closing-kind-toggle"]:visible').locator('button').filter({ hasText: '매입' }).click({ force: true })
  await page.getByTestId('daily-closing-tab-pre_issued').click()
  await expect(page.getByTestId('daily-closing-table')).toBeVisible({ timeout: 30_000 })
  const purchaseButton = page.locator('[data-testid^="daily-closing-accounting-create-"]').first()
  await expect(purchaseButton).toBeEnabled()
  await purchaseButton.click()
  await expect(page.getByTestId('daily-closing-accounting-result')).toContainText('회계전표 생성 성공', { timeout: 30_000 })
  await page.screenshot({ path: path.join(shotsDir, '02-purchase-accounting-slip-created.png'), fullPage: true })

  await page.locator('[data-testid="closing-kind-toggle"]:visible').locator('button').filter({ hasText: '매출' }).click({ force: true })
  await page.getByTestId('daily-closing-tab-result').click()
  await expect(page.getByTestId('daily-closing-table')).toBeVisible({ timeout: 30_000 })
  const duplicateButton = page.locator('[data-testid^="daily-closing-accounting-create-"]').first()
  await expect(duplicateButton).toBeDisabled()
  await page.screenshot({ path: path.join(shotsDir, '03-duplicate-accounting-slip-blocked.png'), fullPage: true })

  const disabledInputs = page.locator('[data-testid^="daily-closing-amount-"]:disabled, input:disabled')
  expect(await disabledInputs.count(), '회계반영 뒤 잠긴 금액 입력').toBeGreaterThan(0)
  await page.screenshot({ path: path.join(shotsDir, '04-accounting-posted-amount-locked.png'), fullPage: true })
})
