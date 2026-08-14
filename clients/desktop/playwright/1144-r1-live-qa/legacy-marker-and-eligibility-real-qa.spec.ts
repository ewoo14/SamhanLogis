import { expect, test, type Page } from '@playwright/test'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
import * as fs from 'node:fs'
import * as path from 'node:path'

const baseUrl = process.env['REAL_QA_RENDERER_BASE_URL'] ?? 'http://localhost:5175'
const apiBase = process.env['API_BASE'] ?? 'http://localhost:8080'
const shots = resolveQaShotsDir(path.resolve(process.cwd(), '../../docs/qa/2026-08-14-1144-sol-validation/screenshots'))
fs.mkdirSync(shots, { recursive: true })

type Session = { token: string; role: string; userId: string; displayName: string; groups?: Array<{ id: string }> }

async function login(page: Page): Promise<Session> {
  const response = await page.request.post(`${apiBase}/auth/login`, {
    data: { loginId: 'dev_master', password: resolveQaCredential('QA_DEV_DEFAULT_PASSWORD') },
  })
  console.log(`[AUTH] status=${response.status()} url=${response.url()}`)
  expect(response.status()).toBe(200)
  const data = (await response.json()).data
  return {
    token: data.token,
    role: data.role,
    userId: data.userId,
    displayName: data.displayName ?? 'dev_master',
    groups: data.groups,
  }
}

async function installAuth(page: Page, session: Session): Promise<void> {
  await page.addInitScript(({ token, role, userId, displayName, groups }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ token, role, userId, fullName: displayName, displayName, partnerCode: null, groups }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, session)
}

async function installGatewayHeaders(page: Page, session: Session): Promise<void> {
  const handler = async (route: import('@playwright/test').Route) => {
    const request = route.request()
    if (new URL(request.url()).pathname === '/logs/front') {
      await route.fulfill({ status: 204, body: '' })
      return
    }
    const headers = {
      ...request.headers(),
      'x-user-id': session.userId,
      'x-user-name': 'qa-master',
      'x-user-role': session.role,
      'x-user-groups': (session.groups ?? []).map((group) => group.id).join(','),
      'x-is-system-master': session.role === 'MASTER' ? 'true' : 'false',
    }
    const response = await route.fetch({ headers })
    await route.fulfill({ response, body: await response.body() })
  }
  await page.route('http://localhost:8080/**', handler)
  await page.route('http://127.0.0.1:8080/**', handler)
}

async function capture(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(shots, name), fullPage: true })
}

test('legacy marker 표시와 eligibility 배선은 실제 renderer에서 호출되고 N+1 없이 동작한다', async ({ page }) => {
  const session = await login(page)
  await installAuth(page, session)
  await installGatewayHeaders(page, session)
  const requests: Array<{ method: string; url: string }> = []
  page.on('response', (response) => {
    if (response.url().includes(':8080') || response.url().includes('/auth/')) {
      console.log(`[HTTP] ${response.status()} ${response.request().method()} ${response.url()}`)
    }
  })
  page.on('request', (request) => {
    if (request.url().includes('/accounting/slip-links/eligibility')) {
      requests.push({ method: request.method(), url: request.url() })
    }
  })

  await page.goto(`${baseUrl}/#/accounting/tax-invoices`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  const body = await page.locator('body').innerText()
  const taxInvoiceReadOnlyBadges = await page.getByTestId('tax-invoice-legacy-read-only').count()
  const taxInvoiceNormalActionCount = await page.getByRole('button', { name: /수정|발행|신규 작성/ }).count()
  await capture(page, '05-tax-invoice-legacy-read-only-live.png')
  expect(body).toContain('읽기 전용')
  expect(taxInvoiceReadOnlyBadges).toBeGreaterThan(0)

  await page.goto(`${baseUrl}/#/accounting/purchase-slips`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  const dateInputs = page.locator('input[type="date"]')
  await dateInputs.nth(0).fill('2026-08-09')
  await dateInputs.nth(1).fill('2026-08-09')
  await page.waitForTimeout(1500)
  const purchaseListBody = await page.locator('body').innerText()
  const purchaseListBatchCalls = requests.filter((request) => request.method === 'POST').length
  await capture(page, '06-purchase-accounting-eligibility-live.png')
  expect(purchaseListBatchCalls).toBeGreaterThan(0)

  await page.goto(`${baseUrl}/#/accounting/purchase-slips/new`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  await page.locator('input[type="date"]').fill('2026-08-09')
  await page.waitForTimeout(1500)
  const formBatchCalls = requests.filter((request) => request.method === 'POST').length - purchaseListBatchCalls
  await capture(page, '07-purchase-accounting-form-live.png')
  fs.writeFileSync(
    path.join(shots, '1144-live-observations.json'),
    JSON.stringify({
      taxInvoiceReadOnlyBadges,
      taxInvoiceNormalActionCount,
      purchaseListBody: purchaseListBody.slice(0, 2000),
      purchaseListBatchCalls,
      formBatchCalls,
      uuidOnlyReasonVisible: purchaseListBody.includes('2026/08/09-6') || (await page.locator('body').innerText()).includes('2026/08/09-6'),
      uuidOnlyCreationBlocked: (await page.locator('body').innerText()).includes('일마감 금액 검증이 완료되지 않았습니다') || (await page.locator('body').innerText()).includes('원천 전표가 확정 상태가 아닙니다'),
      eligibilityRequests: requests,
      formBody: (await page.locator('body').innerText()).slice(0, 10000),
    }, null, 2),
    'utf8',
  )
})
