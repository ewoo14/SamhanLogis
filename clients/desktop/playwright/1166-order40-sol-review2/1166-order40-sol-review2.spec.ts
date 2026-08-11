import { createHmac } from 'node:crypto'
import path from 'node:path'
import { expect, test, type Page, type Route } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const API = 'http://127.0.0.1:28080'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = resolveQaShotsDir(path.resolve(HERE, '../../../../docs/qa/2026-08-11-order40-sol2'))
const SECRET = 'qa-isolated-jwt-secret-2026-08-11-at-least-32-bytes'
const PRODUCT_ID = '22222222-2222-2222-2222-222222222222'

function jwt(claims: Record<string, unknown>): string {
  const now = Math.floor(Date.now() / 1000)
  const enc = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const unsigned = `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc({ ...claims, iat: now, exp: now + 3600 })}`
  return `${unsigned}.${createHmac('sha256', SECRET).update(unsigned).digest('base64url')}`
}

const masterToken = jwt({
  sub: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  isSystemMaster: true,
  name: 'SOL2 QA',
})
const partnerToken = jwt({
  sub: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  partnerCode: 'P-QA-40',
})

const envelope = (data: unknown) => ({ success: true, code: 'OK', message: '성공', data })

async function installDesktopAuth(page: Page): Promise<void> {
  await page.addInitScript(({ token }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({
          token,
          userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          role: 'MASTER',
          fullName: 'SOL2 QA',
          partnerCode: null,
        }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, { token: masterToken })
}

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(body),
  })
}

async function installAuxiliaryFixtures(page: Page): Promise<void> {
  await page.route('**/auth/admin/permissions/my', async (route) => {
    await fulfillJson(route, envelope({
      'estimates.list': ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'RESTORE'],
      'sales.partner-order.list': ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'RESTORE'],
      'sales.partner-order.edit': ['VIEW', 'CREATE', 'UPDATE', 'DELETE'],
      'sales.partner-order.convert': ['VIEW', 'CREATE', 'UPDATE'],
      'sales.partner-order.history': ['VIEW'],
    }))
  })
  // Desktop은 legacy `/slips/**`를 사용한다. 격리 gateway의 표준 v1 route로만 URL을
  // 바꾸고 응답은 실제 TCP/Flyway/PostgreSQL 서비스에서 받아 브라우저에 전달한다.
  await page.route(`${API}/slips/**`, async (route) => {
    const requestUrl = route.request().url()
    const target = requestUrl.replace(`${API}/slips/`, `${API}/api/v1/slips/`)
    const response = await route.fetch({ url: target })
    await route.fulfill({ response })
  })
}

async function visibleInViewport(page: Page, text: string): Promise<void> {
  const locator = page.getByText(text, { exact: false }).first()
  await expect(locator).toBeVisible({ timeout: 30_000 })
  const box = await locator.boundingBox()
  expect(box, `${text} bounding box 없음`).not.toBeNull()
  expect((box?.width ?? 0) > 0 && (box?.height ?? 0) > 0, `${text} 크기 0`).toBeTruthy()
  await locator.scrollIntoViewIfNeeded()
}

async function dismissUnrelatedUpdateBanner(page: Page): Promise<void> {
  const close = page.getByTestId('app-auto-update-dismiss')
  const visible = await close.waitFor({ state: 'visible', timeout: 2_000 })
    .then(() => true)
    .catch(() => false)
  if (visible) await close.click()
}

test.beforeEach(async ({ page }) => {
  await installDesktopAuth(page)
  await installAuxiliaryFixtures(page)
})

test('견적 실제 저장 — estimate caller HVAC는 7%, 930,000원 가시화', async ({ page, browser }) => {
  console.log(`chromium executable=${browser.browserType().executablePath()}`)
  const created = await page.request.post(`${API}/api/v1/slips/estimates`, {
    headers: { Authorization: `Bearer ${masterToken}` },
    data: {
      estimateDate: '2026-08-11',
      partnerName: '격리 QA 거래처',
      partnerBusinessNo: '123-45-67890',
      validUntil: '2026-09-10',
      memo: 'estimate + HVAC + variable=true — 주문 40% 제외 · 견적 적용 7% · 최종 930,000원',
      lines: [{
        productId: PRODUCT_ID,
        productName: '격리 QA 전열교환기',
        modelName: 'QA-HVAC-001',
        quantity: 1,
        unitPrice: 930000,
        priceVatInclusive: true,
        note: '기준가 1,000,000원 · 견적 적용 7% · 최종 930,000원',
      }],
    },
  })
  const raw = await created.text()
  expect(created.status(), `견적 저장 HTTP ${created.status()} ${raw}`).toBe(201)
  const data = JSON.parse(raw).data
  expect(data.lines[0].unitPriceWithVat).toBe(930000)

  await page.goto(`/#/sales/estimates/${data.id}`, { waitUntil: 'domcontentloaded' })
  await dismissUnrelatedUpdateBanner(page)
  await visibleInViewport(page, data.estimateNo)
  await visibleInViewport(page, 'QA-HVAC-001')
  await visibleInViewport(page, '930,000')
  await visibleInViewport(page, '견적 적용 7%')
  await page.screenshot({ path: path.join(SHOTS, '01-estimate-7-percent-saved-visible.png'), fullPage: true })
  console.log(`estimate saved no=${data.estimateNo} unitPriceWithVat=${data.lines[0].unitPriceWithVat} appliedRate=7%`)
})

test('주문 실제 저장 — 미리보기와 확정 40%, 600,000원 일치 가시화', async ({ page }) => {
  const partnerHeaders = { Authorization: `Bearer ${partnerToken}` }
  const lines = [{
    modelCode: 'QA-HVAC-001',
    categoryKey: 'homemulti',
    quantity: 1,
    remark: '서버 미리보기 40% · 확정 40% · 최종 600,000원',
  }]
  const requestBody = {
    lines,
    deliveryAddress: '서버 미리보기 40% · 확정 40% · 최종 600,000원',
  }
  const preview = await page.request.post(`${API}/api/v1/partner-orders/price-preview`, {
    headers: partnerHeaders,
    data: requestBody,
  })
  const previewRaw = await preview.text()
  expect(preview.status(), `미리보기 HTTP ${preview.status()} ${previewRaw}`).toBe(200)
  const previewData = JSON.parse(previewRaw).data
  expect(previewData.lines[0].appliedRate).toBe(0.4)
  expect(previewData.lines[0].finalPrice).toBe(600000)

  const draft = await page.request.post(`${API}/api/v1/partner-orders/drafts`, {
    headers: partnerHeaders,
    data: { label: 'SOL2 Playwright 주문', payloadJson: '{}' },
  })
  const draftRaw = await draft.text()
  expect(draft.status(), `draft HTTP ${draft.status()} ${draftRaw}`).toBe(201)
  const draftId = JSON.parse(draftRaw).data.draftId
  const confirmed = await page.request.post(`${API}/api/v1/partner-orders/${draftId}/confirm`, {
    headers: { ...partnerHeaders, 'X-Biz-Code': '1234567890' },
    data: requestBody,
  })
  const confirmedRaw = await confirmed.text()
  expect(confirmed.status(), `confirm HTTP ${confirmed.status()} ${confirmedRaw}`).toBe(200)
  const order = JSON.parse(confirmedRaw).data
  expect(order.totalAmount).toBe(600000)
  expect(order.totalAmount).toBe(previewData.totalFinalAmount)

  const routeId = String(order.orderNo).replaceAll('/', '-')
  await page.goto(`/#/sales/partner-orders/${routeId}`, { waitUntil: 'domcontentloaded' })
  await dismissUnrelatedUpdateBanner(page)
  await visibleInViewport(page, order.orderNo)
  await visibleInViewport(page, 'QA-HVAC-001')
  await visibleInViewport(page, '600,000')
  const deliveryEvidence = page.locator('input[value*="서버 미리보기 40%"]')
  await expect(deliveryEvidence).toBeVisible({ timeout: 30_000 })
  const deliveryBox = await deliveryEvidence.boundingBox()
  expect(deliveryBox, '서버 미리보기 40% 배송지 가시 영역 없음').not.toBeNull()
  expect((deliveryBox?.width ?? 0) > 0 && (deliveryBox?.height ?? 0) > 0).toBeTruthy()
  await page.screenshot({ path: path.join(SHOTS, '02-order-preview-confirm-40-percent-visible.png'), fullPage: true })
  console.log(`order saved no=${order.orderNo} preview=${previewData.totalFinalAmount} confirm=${order.totalAmount} appliedRate=${previewData.lines[0].appliedRate}`)
})
