import { randomBytes } from 'node:crypto'
import path from 'node:path'
// Real QA: dedicated services are required; the *-real-qa name keeps this out of the mock hard gate.
import { expect, test, type Page, type Route } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const PARTNER_ORDER_API = 'http://127.0.0.1:28088'
const BROWSER_API = 'http://127.0.0.1:28080'
const STUB_API = 'http://127.0.0.1:28084'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = resolveQaShotsDir(path.resolve(HERE, '../../../../docs/qa/2026-08-11-order40-fix3'))
const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const ISOLATED_BROWSER_TOKEN = randomBytes(32).toString('base64url')

const partnerHeaders = {
  'X-User-Id': USER_ID,
  'X-User-Name': encodeURIComponent('LUNA FIX3 QA'),
  'X-Is-Partner': 'true',
  'X-Partner-Code': 'P-QA-40',
}

async function installDesktopAuth(page: Page): Promise<void> {
  await page.addInitScript(({ userId, token }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({
          token,
          userId,
          role: 'PARTNER',
          fullName: 'LUNA FIX3 QA',
          partnerCode: 'P-QA-40',
        }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, { userId: USER_ID, token: ISOLATED_BROWSER_TOKEN })
}

async function proxy(route: Route, target: string): Promise<void> {
  const response = await route.fetch({
    url: target,
    headers: { ...route.request().headers(), ...partnerHeaders },
  })
  await route.fulfill({ response })
}

async function installRoutes(page: Page): Promise<void> {
  await page.route(`${BROWSER_API}/api/v1/partner-orders/**`, async (route) => {
    await proxy(route, route.request().url().replace(BROWSER_API, PARTNER_ORDER_API))
  })
  await page.route('**/auth/admin/permissions/my', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ success: true, code: 'OK', message: '성공', data: {
        'sales.partner-order.list': ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'RESTORE'],
      } }),
    })
  })
}

test.beforeEach(async ({ page }) => {
  await installDesktopAuth(page)
  await installRoutes(page)
})

test('fixedDiscountSource NONE + 보조 endpoint 500도 주문 600,000원을 화면에 확정한다', async ({ page, request, baseURL }) => {
  const body = {
    lines: [{ modelCode: 'QA-HVAC-001', categoryKey: 'homemulti', quantity: 1,
      remark: 'LUNA FIX3 · source NONE · helper 500 · 600,000원' }],
    deliveryAddress: 'LUNA FIX3 source NONE · helper 500 정상 경로',
  }
  await request.post(`${STUB_API}/__qa/fixed-fail/on`)
  try {
    const draft = await request.post(`${PARTNER_ORDER_API}/api/v1/partner-orders/drafts`, {
      headers: partnerHeaders,
      data: { label: 'LUNA FIX3 NONE 정상 주문', payloadJson: '{}' },
    })
    expect(draft.status(), await draft.text()).toBe(201)
    const draftId = (await draft.json()).data.draftId

    const confirmed = await request.post(`${PARTNER_ORDER_API}/api/v1/partner-orders/${draftId}/confirm`, {
      headers: { ...partnerHeaders, 'X-Biz-Code': '1234567890' },
      data: body,
    })
    const confirmedRaw = await confirmed.text()
    expect(confirmed.status(), confirmedRaw).toBe(200)
    const order = JSON.parse(confirmedRaw).data
    expect(order.totalAmount).toBe(600000)

    await page.goto(`${baseURL}/#/sales/partner-orders/${String(order.orderNo).replaceAll('/', '-')}`, {
      waitUntil: 'domcontentloaded',
    })
    const orderNumber = page.getByText(order.orderNo, { exact: false }).first()
    await expect(orderNumber, '주문 상세 화면 미도달').toBeVisible({ timeout: 30_000 })
    const price = page.getByText('600,000', { exact: false }).first()
    await expect(price, '주문 상세의 600,000원 표시 없음').toBeVisible({ timeout: 30_000 })
    await price.scrollIntoViewIfNeeded()
    const box = await price.boundingBox()
    expect(box, '600,000원 bounding box 없음').not.toBeNull()
    expect((box?.width ?? 0) > 0 && (box?.height ?? 0) > 0).toBeTruthy()
    await page.screenshot({ path: path.join(SHOTS, '01-none-helper-500-order-600000.png'), fullPage: true })
    console.log(`FIX3 NONE helper500 confirm=200 total=${order.totalAmount} orderNo=${order.orderNo}`)
  } finally {
    await request.post(`${STUB_API}/__qa/fixed-fail/off`)
  }
})
