import { expect, test, type Page } from '@playwright/test'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
import * as fs from 'node:fs'
import * as path from 'node:path'

const baseUrl = process.env['REAL_QA_RENDERER_BASE_URL'] ?? 'http://localhost:5175'
const apiBase = process.env['API_BASE'] ?? 'http://localhost:8080'
const shots = resolveQaShotsDir(path.resolve(process.cwd(), '../../docs/qa/2026-08-14-1144-sol-validation/screenshots'))
fs.mkdirSync(shots, { recursive: true })

type Session = { token: string; role: string; userId: string; displayName: string }

async function login(page: Page): Promise<Session> {
  const response = await page.request.post(`${apiBase}/auth/login`, {
    data: { loginId: 'dev_master', password: resolveQaCredential('QA_DEV_DEFAULT_PASSWORD') },
  })
  expect(response.status()).toBe(200)
  const data = (await response.json()).data
  return {
    token: data.token,
    role: data.role,
    userId: data.userId,
    displayName: data.displayName ?? 'dev_master',
  }
}

async function installAuth(page: Page, session: Session): Promise<void> {
  await page.addInitScript(({ token, role, userId, displayName }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ token, role, userId, fullName: displayName, displayName }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, session)
}

async function capture(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(shots, name), fullPage: true })
}

test('legacy marker 표시와 eligibility 배선은 실제 renderer에서 호출되고 N+1 없이 동작한다', async ({ page }) => {
  const session = await login(page)
  await installAuth(page, session)
  const requests: Array<{ method: string; url: string }> = []
  page.on('request', (request) => {
    if (request.url().includes('/accounting/slip-links/eligibility')) {
      requests.push({ method: request.method(), url: request.url() })
    }
  })

  await page.goto(`${baseUrl}/#/accounting/tax-invoices`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  const body = await page.locator('body').innerText()
  await capture(page, '05-tax-invoice-legacy-read-only-live.png')
  expect(body).toContain('읽기 전용')
  expect(await page.getByTestId('tax-invoice-legacy-read-only').count()).toBeGreaterThan(0)

  await page.goto(`${baseUrl}/#/accounting/purchase-slips`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  await capture(page, '06-purchase-accounting-eligibility-live.png')
  const purchaseBatchCalls = requests.filter((request) => request.method === 'POST')
  expect(purchaseBatchCalls.length).toBeLessThanOrEqual(1)

  await page.goto(`${baseUrl}/#/accounting/purchase-slips/new`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  await capture(page, '07-purchase-accounting-form-live.png')
  fs.writeFileSync(
    path.join(shots, '1144-live-observations.json'),
    JSON.stringify({
      taxInvoiceReadOnlyBadges: await page.getByTestId('tax-invoice-legacy-read-only').count(),
      eligibilityRequests: requests,
      formBody: (await page.locator('body').innerText()).slice(0, 1000),
    }, null, 2),
    'utf8',
  )
})
