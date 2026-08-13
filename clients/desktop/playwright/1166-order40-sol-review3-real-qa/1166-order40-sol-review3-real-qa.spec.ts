import { randomBytes } from 'node:crypto'
import path from 'node:path'
// Real QA: dedicated services are required; the *-real-qa name keeps this out of the mock hard gate.
import { expect, test, type Page, type Route } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const PARTNER_ORDER_API = 'http://127.0.0.1:28088'
const SLIP_API = 'http://127.0.0.1:28086'
const BROWSER_API = 'http://127.0.0.1:28080'
const DC_CONFIG_API = 'http://127.0.0.1:28085'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = resolveQaShotsDir(path.resolve(HERE, '../../../../docs/qa/2026-08-11-order40-sol3'))
const PRODUCT_ID = '22222222-2222-2222-2222-222222222222'
const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const INTERNAL_TOKEN = process.env['SAMHAN_QA_INTERNAL_TOKEN']?.trim()
if (!INTERNAL_TOKEN) throw new Error('SAMHAN_QA_INTERNAL_TOKEN 환경변수가 필요합니다')
const ISOLATED_BROWSER_TOKEN = randomBytes(32).toString('base64url')

const masterHeaders = {
  'X-User-Id': USER_ID,
  'X-User-Name': encodeURIComponent('SOL3 QA'),
  'X-Is-System-Master': 'true',
}
const partnerHeaders = {
  'X-User-Id': USER_ID,
  'X-User-Name': encodeURIComponent('SOL3 QA'),
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
          role: 'MASTER',
          fullName: 'SOL3 QA',
          partnerCode: null,
        }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, { userId: USER_ID, token: ISOLATED_BROWSER_TOKEN })
}

async function proxy(route: Route, target: string, headers: Record<string, string>): Promise<void> {
  const response = await route.fetch({
    url: target,
    headers: { ...route.request().headers(), ...headers },
  })
  await route.fulfill({ response })
}

async function installLiveRoutes(page: Page): Promise<void> {
  await page.route(`${BROWSER_API}/api/v1/partner-orders/**`, async (route) => {
    const target = route.request().url().replace(BROWSER_API, PARTNER_ORDER_API)
    await proxy(route, target, partnerHeaders)
  })
  await page.route(`${BROWSER_API}/slips/**`, async (route) => {
    const target = route.request().url().replace(BROWSER_API, SLIP_API)
    await proxy(route, target, masterHeaders)
  })
  await page.route(`${BROWSER_API}/api/v1/slips/**`, async (route) => {
    const target = route.request().url().replace(`${BROWSER_API}/api/v1`, SLIP_API)
    await proxy(route, target, masterHeaders)
  })
  await page.route('**/auth/admin/permissions/my', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ success: true, code: 'OK', message: '성공', data: {
        'estimates.list': ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'RESTORE'],
        'sales.partner-order.list': ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'RESTORE'],
        'sales.partner-order.history': ['VIEW'],
      } }),
    })
  })
}

async function visibleInViewport(page: Page, text: string): Promise<void> {
  const locator = page.getByText(text, { exact: false }).first()
  await expect(locator).toBeVisible({ timeout: 30_000 })
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  expect(box, `${text} bounding box 없음`).not.toBeNull()
  expect((box?.width ?? 0) > 0 && (box?.height ?? 0) > 0).toBeTruthy()
}

test.beforeEach(async ({ page }) => {
  await installDesktopAuth(page)
  await installLiveRoutes(page)
})

test('dc-config 정상 — 주문 확정 40%, 600,000원 실제 저장과 화면', async ({ page }) => {
  const requestBody = {
    lines: [{ modelCode: 'QA-HVAC-001', categoryKey: 'homemulti', quantity: 1,
      remark: 'SOL3 dc-config 정상 · 서버 40% · 600,000원' }],
    deliveryAddress: 'SOL3 dc-config 정상 · 서버 40% · 600,000원',
  }
  const preview = await page.request.post(`${PARTNER_ORDER_API}/api/v1/partner-orders/price-preview`, {
    headers: partnerHeaders,
    data: requestBody,
  })
  const previewRaw = await preview.text()
  expect(preview.status(), previewRaw).toBe(200)
  const previewData = JSON.parse(previewRaw).data
  expect(previewData.lines[0].appliedRate).toBe(0.4)
  expect(previewData.lines[0].finalPrice).toBe(600000)

  const draft = await page.request.post(`${PARTNER_ORDER_API}/api/v1/partner-orders/drafts`, {
    headers: partnerHeaders,
    data: { label: 'SOL3 정상 주문', payloadJson: '{}' },
  })
  const draftRaw = await draft.text()
  expect(draft.status(), draftRaw).toBe(201)
  const draftId = JSON.parse(draftRaw).data.draftId
  const confirmed = await page.request.post(
    `${PARTNER_ORDER_API}/api/v1/partner-orders/${draftId}/confirm`, {
      headers: { ...partnerHeaders, 'X-Biz-Code': '1234567890' },
      data: requestBody,
    },
  )
  const confirmedRaw = await confirmed.text()
  expect(confirmed.status(), confirmedRaw).toBe(200)
  const order = JSON.parse(confirmedRaw).data
  expect(order.totalAmount).toBe(600000)
  expect(order.totalAmount).toBe(previewData.totalFinalAmount)

  await page.goto(`/#/sales/partner-orders/${String(order.orderNo).replaceAll('/', '-')}`,
    { waitUntil: 'domcontentloaded' })
  await visibleInViewport(page, order.orderNo)
  await visibleInViewport(page, 'QA-HVAC-001')
  await visibleInViewport(page, '600,000')
  await expect(page.getByRole('textbox', { name: '배송지' }))
    .toHaveValue('SOL3 dc-config 정상 · 서버 40% · 600,000원')
  await page.screenshot({ path: path.join(SHOTS, '01-order-confirm-600000-visible.png'), fullPage: true })
  await page.unrouteAll({ behavior: 'ignoreErrors' })
  console.log(`NORMAL orderNo=${order.orderNo} preview=${previewData.totalFinalAmount} confirm=${order.totalAmount}`)
})

test('견적 caller — 실제 dc-config 7%, 930,000원 계산 후 견적 실제 저장과 화면', async ({ page }) => {
  const calculation = await page.request.post(`${DC_CONFIG_API}/internal/price-calculations`, {
    headers: { 'X-Internal-Token': INTERNAL_TOKEN },
    data: {
      partnerCode: 'P-QA-40',
      callerService: 'estimate-service',
      lines: [{
        lineId: 'estimate-0', modelCode: 'QA-HVAC-001', listPrice: 1000000,
        category: 'HOMEMULTI', quantity: 1,
        is360: false, is4Way: false, is1Way: false, isStand: false,
        isDeluxe: false, isFirstGrade: false, fixedDiscountRate: null,
        hasVariableDiscount: true, physicalCategoryCode: 'HVAC',
      }],
    },
  })
  const calculationRaw = await calculation.text()
  expect(calculation.status(), calculationRaw).toBe(200)
  const calculatedLine = JSON.parse(calculationRaw).data.lines[0]
  expect(calculatedLine.appliedRate).toBe(0.07)
  expect(calculatedLine.finalPrice).toBe(930000)

  const created = await page.request.post(`${SLIP_API}/slips/estimates`, {
    headers: masterHeaders,
    data: {
      estimateDate: '2026-08-11', partnerName: '격리 QA 거래처',
      partnerBusinessNo: '123-45-67890', validUntil: '2026-09-10',
      memo: 'SOL3 실제 dc-config estimate caller 7% · 930,000원',
      lines: [{ productId: PRODUCT_ID, productName: '격리 QA 전열교환기',
        modelName: 'QA-HVAC-001', quantity: 1, unitPrice: calculatedLine.finalPrice,
        priceVatInclusive: true, note: '실제 dc-config 견적 7% · 930,000원' }],
    },
  })
  const createdRaw = await created.text()
  expect(created.status(), createdRaw).toBe(201)
  const estimate = JSON.parse(createdRaw).data

  await page.goto(`/#/sales/estimates/${estimate.id}`, { waitUntil: 'domcontentloaded' })
  await visibleInViewport(page, estimate.estimateNo)
  await visibleInViewport(page, 'QA-HVAC-001')
  await visibleInViewport(page, '930,000')
  await page.screenshot({ path: path.join(SHOTS, '03-estimate-7-percent-930000-visible.png'), fullPage: true })
  await page.unrouteAll({ behavior: 'ignoreErrors' })
  console.log(`ESTIMATE estimateNo=${estimate.estimateNo} rate=${calculatedLine.appliedRate} price=${calculatedLine.finalPrice}`)
})
