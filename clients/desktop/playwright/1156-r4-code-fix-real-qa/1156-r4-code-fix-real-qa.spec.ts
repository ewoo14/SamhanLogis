import { expect, test, type APIRequestContext, type BrowserContext, type Page, type Route } from '@playwright/test'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE_URL = process.env['REAL_QA_RENDERER_BASE_URL'] ?? 'http://127.0.0.1:5316'
const AUTH_API = 'http://127.0.0.1:8081'
const HEAD_SLIP_API = process.env['REAL_QA_HEAD_SLIP_API'] ?? 'http://127.0.0.1:28186'
const PARTNER_ID = '3fd9b72d-84f4-4777-9faf-252f0bfa5f9f'
const PRODUCT_ID = '6fd28b44-f8e5-4e9d-96ba-d4b9ce9fac89'
const dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = resolveQaShotsDir(path.resolve(dirname, '../../../../docs/qa/2026-08-09-1156-r4'))
const appUrl = (route: string) => `${BASE_URL}/#${route}`

type Login = { token: string; role: string; userId: string; displayName: string; groups?: Array<{ id: string }> }

async function login(request: APIRequestContext, password: string): Promise<Login> {
  const response = await request.post(`${AUTH_API}/auth/login`, { data: { loginId: 'dev_master', password } })
  expect(response.status()).toBe(200)
  return (await response.json()).data as Login
}

function userHeaders(session: Login): Record<string, string> {
  return {
    'x-user-id': session.userId,
    'x-user-name': 'SOL 5.6 R4',
    'x-user-role': session.role,
    'x-user-groups': (session.groups ?? []).map((group) => group.id).join(','),
    'x-is-system-master': 'true',
  }
}

async function proxyApi(route: Route, session: Login): Promise<void> {
  const request = route.request()
  const source = new URL(request.url())
  const target = source.pathname === '/slips' || source.pathname.startsWith('/slips/')
    ? `${HEAD_SLIP_API}${source.pathname}${source.search}`
    : source.href
  const response = await route.fetch({ url: target, headers: { ...request.headers(), ...userHeaders(session) } })
  await route.fulfill({ response, body: await response.body() })
}

async function appPage(context: BrowserContext, session: Login): Promise<Page> {
  const page = await context.newPage()
  await page.addInitScript(({ token, role, userId, displayName, groups }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: { getToken: async () => ({ token, userId, role, fullName: displayName, partnerCode: null, groups }) },
    })
  }, session)
  await page.route('http://localhost:8080/**', (route) => proxyApi(route, session))
  await page.route('http://127.0.0.1:8080/**', (route) => proxyApi(route, session))
  return page
}

test('R4 실 GUI 매입 직접 수정은 거래처코드만 PUT하고 저장한다', async ({ browser, request }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch {
    test.skip(true, 'QA_DEV_DEFAULT_PASSWORD를 해소할 수 없어 라이브 QA를 건너뜁니다.')
    throw new Error('unreachable after test.skip')
  }

  fs.mkdirSync(SHOTS, { recursive: true })
  const session = await login(request, password)
  const headers = userHeaders(session)
  const created = await request.post(`${HEAD_SLIP_API}/slips`, {
    headers,
    data: {
      slipType: 'INBOUND',
      destinationWarehouseId: '11111111-1111-1111-1111-000000000001',
      partnerId: PARTNER_ID,
      partnerName: '파인씨엔디',
      memo: 'R4 GUI direct PUT partnerCode code-fix',
      lines: [{ productId: PRODUCT_ID, productName: '실외기_6HP 단배관', modelName: 'AJ060MXHNBC1', quantity: 1, unitPrice: 909 }],
    },
  })
  expect(created.status()).toBe(201)
  const createdBody = await created.json()
  const slipId = createdBody.data.id as string
  const context = await browser.newContext()
  const page = await appPage(context, session)
  await page.goto(appUrl(`/purchases/${slipId}`), { waitUntil: 'domcontentloaded' })
  await page.getByTestId('purchase-slip-edit-open').click()
  await expect(page.getByTestId('purchase-slip-edit-modal')).toBeVisible({ timeout: 30_000 })
  const partner = page.getByTestId('slip-coedit-field-header-partnerName')
  await partner.fill('서울에어컨')
  const option = page.getByRole('listbox', { name: '거래처 목록' }).getByRole('option').filter({ hasText: '(주)서울에어컨' })
  await expect(option).toBeVisible({ timeout: 15_000 })
  await option.click()
  await expect(partner).toHaveValue('(주)서울에어컨', { timeout: 15_000 })
  await page.screenshot({ path: path.join(SHOTS, '01-direct-put-before-save.png'), fullPage: true })
  let requestPayload: Record<string, unknown> | undefined
  page.on('request', (outgoing) => {
    if (outgoing.method() === 'PUT' && new URL(outgoing.url()).pathname === `/slips/${slipId}`) requestPayload = outgoing.postDataJSON() as Record<string, unknown>
  })
  const updatePromise = page.waitForResponse((response) => response.request().method() === 'PUT' && new URL(response.url()).pathname === `/slips/${slipId}`)
  await page.getByTestId('purchase-slip-edit-submit').click()
  const updated = await updatePromise
  const updatedBody = await updated.json()
  expect(updated.status()).toBe(200)
  expect(requestPayload?.partnerCode).toBe('P-2026-0001')
  expect(requestPayload?.businessNumber).toBe('113-07-10031')
  expect(updatedBody.data.partnerCode).toBe('P-2026-0001')
  expect(updatedBody.data.partnerCode).not.toBe('113-07-10031')
  await page.screenshot({ path: path.join(SHOTS, '02-direct-put-after-save.png'), fullPage: true })
  const persisted = await request.get(`${HEAD_SLIP_API}/slips/${slipId}`, { headers })
  const persistedBody = await persisted.json()
  expect(persistedBody.data.partnerCode).toBe('P-2026-0001')
  fs.writeFileSync(path.join(SHOTS, 'direct-put-code-fix-evidence.json'), JSON.stringify({
    round: 'R4', slipNo: persistedBody.data.slipNo, putHttpStatus: updated.status(),
    partnerId: '<redacted-uuid>', selectedPartnerName: '(주)서울에어컨',
    requestPartnerCode: requestPayload?.partnerCode, requestBusinessNumber: requestPayload?.businessNumber,
    responsePartnerCode: updatedBody.data.partnerCode, persistedPartnerCode: persistedBody.data.partnerCode,
  }, null, 2), 'utf8')
  await page.unrouteAll({ behavior: 'ignoreErrors' })
  await context.close()
})
