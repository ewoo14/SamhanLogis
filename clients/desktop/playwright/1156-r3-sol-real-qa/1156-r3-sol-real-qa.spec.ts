import { expect, test, type APIRequestContext, type BrowserContext, type Page, type Route } from '@playwright/test'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE_URL = process.env['REAL_QA_RENDERER_BASE_URL'] ?? 'http://127.0.0.1:5316'
const AUTH_API = 'http://127.0.0.1:8081'
const HEAD_SLIP_API = 'http://127.0.0.1:18206'
const appUrl = (route: string) => process.env['REAL_QA_WEB_ROUTER'] === '1'
  ? `${BASE_URL}${route}`
  : `${BASE_URL}/#${route}`
const dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = resolveQaShotsDir(path.resolve(dirname, '../../../../docs/qa/2026-08-09-1156-r3'))
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi

const PARTNER_ID = '3fd9b72d-84f4-4777-9faf-252f0bfa5f9f'
const PRODUCT_ID = '6fd28b44-f8e5-4e9d-96ba-d4b9ce9fac89'

type Login = {
  token: string
  role: string
  userId: string
  displayName: string
  groups?: Array<{ id: string }>
}

type NetworkEvidence = {
  method: string
  status: number
  path: string
  destination: 'HEAD-18206' | 'gateway-8080'
}

async function login(request: APIRequestContext, password: string): Promise<Login> {
  const response = await request.post(`${AUTH_API}/auth/login`, {
    data: { loginId: 'dev_master', password },
  })
  expect(response.status(), 'dev_master login').toBe(200)
  return (await response.json()).data as Login
}

function userHeaders(session: Login): Record<string, string> {
  return {
    'x-user-id': session.userId,
    'x-user-name': 'SOL 5.6 R3',
    'x-user-role': session.role,
    'x-user-groups': (session.groups ?? []).map((group) => group.id).join(','),
    'x-is-system-master': 'true',
  }
}

async function proxyApi(route: Route, session: Login, evidence: NetworkEvidence[]): Promise<void> {
  const request = route.request()
  const source = new URL(request.url())
  const useHead = source.pathname === '/slips' || source.pathname.startsWith('/slips/')
  const target = useHead ? `${HEAD_SLIP_API}${source.pathname}${source.search}` : source.href
  const response = await route.fetch({
    url: target,
    headers: { ...request.headers(), ...userHeaders(session) },
  })
  if (useHead || source.pathname === '/admin/partners/search') {
    evidence.push({
      method: request.method(),
      status: response.status(),
      path: source.pathname.replace(UUID_RE, '<redacted-uuid>'),
      destination: useHead ? 'HEAD-18206' : 'gateway-8080',
    })
  }
  await route.fulfill({ response, body: await response.body() })
}

async function appPage(
  context: BrowserContext,
  session: Login,
  evidence: NetworkEvidence[],
): Promise<Page> {
  const page = await context.newPage()
  await page.addInitScript(({ token, role, userId, displayName, groups }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ token, userId, role, fullName: displayName, partnerCode: null, groups }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, session)
  await page.route('http://localhost:8080/**', (route) => proxyApi(route, session, evidence))
  await page.route('http://127.0.0.1:8080/**', (route) => proxyApi(route, session, evidence))
  return page
}

test('실 GUI 신규 INBOUND가 HEAD API에 두 거래처 컬럼을 저장한다', async ({ browser, request }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch {
    test.skip(true, 'QA_DEV_DEFAULT_PASSWORD를 해소할 수 없어 라이브 QA를 건너뜁니다.')
    throw new Error('unreachable after test.skip')
  }

  fs.mkdirSync(SHOTS, { recursive: true })
  const evidence: NetworkEvidence[] = []
  const session = await login(request, password)
  expect(session.role).toBe('MASTER')
  const context = await browser.newContext()
  const page = await appPage(context, session, evidence)

  await page.goto(appUrl('/purchases/new'), { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '새 입고전표' }).first()).toBeVisible({ timeout: 30_000 })

  const warehouse = page.getByRole('combobox', { name: '입고 창고' })
  await warehouse.fill('HQ-001')
  await page.waitForTimeout(200)
  await warehouse.press('ArrowDown')
  await warehouse.press('Enter')

  const partner = page.getByRole('combobox', { name: '거래처', exact: true })
  await partner.fill('파인씨엔디')
  const partnerOption = page.getByRole('listbox', { name: '거래처 목록' })
    .getByRole('option')
    .filter({ hasText: '파인씨엔디' })
  await expect(partnerOption).toBeVisible({ timeout: 15_000 })
  await partnerOption.click()

  const product = page.getByRole('combobox', { name: '라인 1 품목' })
  await product.fill('AJ060MXHNBC1')
  await page.waitForTimeout(1_000)
  await expect(product).toHaveValue('AJ060MXHNBC1', { timeout: 15_000 })

  await page.getByLabel('메모').fill('R3 GUI 신규 INBOUND')
  await page.screenshot({ path: path.join(SHOTS, '01-inbound-before-save.png'), fullPage: true })
  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname === '/slips' && response.request().method() === 'POST'
  })
  await page.getByRole('button', { name: '저장', exact: true }).click()
  const response = await responsePromise
  const responseBody = await response.json()
  expect(response.status()).toBe(201)
  expect(responseBody.data.partnerId).toBeTruthy()
  expect(responseBody.data.partnerCode).toBe('00')
  await expect(page).toHaveURL(appUrl('/purchases'), { timeout: 30_000 })
  await page.screenshot({ path: path.join(SHOTS, '02-inbound-after-save.png'), fullPage: true })
  fs.writeFileSync(path.join(SHOTS, 'inbound-gui-evidence.json'), JSON.stringify({
    httpStatus: response.status(),
    slipNo: responseBody.data.slipNo,
    status: responseBody.data.status,
    partnerId: '<redacted-uuid>',
    partnerCode: responseBody.data.partnerCode,
    finalUrl: page.url(),
    network: evidence,
  }, null, 2), 'utf8')
  await page.unrouteAll({ behavior: 'ignoreErrors' })
  await context.close()
})

test('실 GUI 견적 변환이 HEAD API에서 partnerCode snapshot을 남긴다', async ({ browser, request }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch {
    test.skip(true, 'QA_DEV_DEFAULT_PASSWORD를 해소할 수 없어 라이브 QA를 건너뜁니다.')
    throw new Error('unreachable after test.skip')
  }

  fs.mkdirSync(SHOTS, { recursive: true })
  const evidence: NetworkEvidence[] = []
  const session = await login(request, password)
  const headers = userHeaders(session)
  const created = await request.post(`${HEAD_SLIP_API}/slips/estimates`, {
    headers,
    data: {
      partnerId: PARTNER_ID,
      partnerName: '파인씨엔디',
      memo: 'R3 GUI 견적 전표 변환',
      lines: [{
        productId: PRODUCT_ID,
        productName: '실외기_6HP 단배관',
        modelName: 'AJ060MXHNBC1',
        quantity: 1,
        unitPrice: 909,
      }],
    },
  })
  expect(created.status(), await created.text()).toBe(201)
  const createdBody = await created.json()
  const estimateId = createdBody.data.id as string

  const context = await browser.newContext()
  const page = await appPage(context, session, evidence)
  page.on('dialog', (dialog) => dialog.accept())
  await page.goto(appUrl(`/sales/estimates/${estimateId}`), { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('estimate-detail-convert-button')).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: path.join(SHOTS, '03-estimate-before-convert.png'), fullPage: true })
  const convertedResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname.endsWith(`/slips/estimates/${estimateId}/convert`)
      && response.request().method() === 'POST'
  })
  await page.getByTestId('estimate-detail-convert-button').click()
  const convertedResponse = await convertedResponsePromise
  expect(convertedResponse.status()).toBe(200)
  const convertedBody = await convertedResponse.json()
  const slipId = convertedBody.data.convertedSlipId as string
  expect(slipId).toBeTruthy()

  const slipResponse = await request.get(`${HEAD_SLIP_API}/slips/${slipId}`, { headers })
  expect(slipResponse.status()).toBe(200)
  const slipBody = await slipResponse.json()
  expect(slipBody.data.partnerId).toBe(PARTNER_ID)
  expect(slipBody.data.partnerCode).toBe('00')
  await page.screenshot({ path: path.join(SHOTS, '04-estimate-after-convert.png'), fullPage: true })
  fs.writeFileSync(path.join(SHOTS, 'estimate-convert-gui-evidence.json'), JSON.stringify({
    createEstimateHttpStatus: created.status(),
    estimateNo: createdBody.data.estimateNo,
    convertHttpStatus: convertedResponse.status(),
    convertedSlipNo: slipBody.data.slipNo,
    convertedSlipStatus: slipBody.data.status,
    partnerId: '<redacted-uuid>',
    partnerCode: slipBody.data.partnerCode,
    network: evidence,
  }, null, 2), 'utf8')
  await page.unrouteAll({ behavior: 'ignoreErrors' })
  await context.close()
})

test('실 GUI 매입 direct PUT이 partnerId 변경 때 businessNumber를 partnerCode로 저장한다', async ({ browser, request }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch {
    test.skip(true, 'QA_DEV_DEFAULT_PASSWORD를 해소할 수 없어 라이브 QA를 건너뜁니다.')
    throw new Error('unreachable after test.skip')
  }

  fs.mkdirSync(SHOTS, { recursive: true })
  const evidence: NetworkEvidence[] = []
  const session = await login(request, password)
  const headers = userHeaders(session)
  const created = await request.post(`${HEAD_SLIP_API}/slips`, {
    headers,
    data: {
      slipType: 'INBOUND',
      destinationWarehouseId: '11111111-1111-1111-1111-000000000001',
      partnerId: PARTNER_ID,
      partnerName: '파인씨엔디',
      memo: 'R3 GUI direct PUT partnerCode 축',
      lines: [{
        productId: PRODUCT_ID,
        productName: '실외기_6HP 단배관',
        modelName: 'AJ060MXHNBC1',
        quantity: 1,
        unitPrice: 909,
      }],
    },
  })
  expect(created.status(), await created.text()).toBe(201)
  const createdBody = await created.json()
  const slipId = createdBody.data.id as string

  const context = await browser.newContext()
  const page = await appPage(context, session, evidence)
  await page.goto(appUrl(`/purchases/${slipId}`), { waitUntil: 'domcontentloaded' })
  await page.getByTestId('purchase-slip-edit-open').click()
  await expect(page.getByTestId('purchase-slip-edit-modal')).toBeVisible({ timeout: 30_000 })

  const partner = page.getByTestId('slip-coedit-field-header-partnerName')
  await partner.fill('서울에어컨')
  const option = page.getByRole('listbox', { name: '거래처 목록' })
    .getByRole('option')
    .filter({ hasText: '(주)서울에어컨' })
  await expect(option).toBeVisible({ timeout: 15_000 })
  await partner.press('ArrowDown')
  await partner.press('Enter')
  await expect(partner).toHaveValue('(주)서울에어컨', { timeout: 15_000 })
  await expect(page.getByTestId('purchase-slip-edit-submit')).toBeEnabled({ timeout: 30_000 })
  await page.screenshot({ path: path.join(SHOTS, '05-direct-put-before-save.png'), fullPage: true })

  let requestPayload: Record<string, unknown> | undefined
  page.on('request', (outgoing) => {
    if (outgoing.method() === 'PUT' && new URL(outgoing.url()).pathname === `/slips/${slipId}`) {
      requestPayload = outgoing.postDataJSON() as Record<string, unknown>
    }
  })
  const updatePromise = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return response.request().method() === 'PUT' && url.pathname === `/slips/${slipId}`
  })
  await page.getByTestId('purchase-slip-edit-submit').click()
  const updated = await updatePromise
  expect(updated.status()).toBe(200)
  const updatedBody = await updated.json()
  expect(requestPayload?.['partnerId']).toBeTruthy()
  expect(requestPayload?.['partnerCode']).toBe('113-07-10031')
  expect(updatedBody.data.partnerCode).toBe('113-07-10031')
  expect(updatedBody.data.partnerCode).not.toBe('P-2026-0001')
  await page.screenshot({ path: path.join(SHOTS, '06-direct-put-after-save.png'), fullPage: true })
  fs.writeFileSync(path.join(SHOTS, 'direct-put-partner-code-defect.json'), JSON.stringify({
    createHttpStatus: created.status(),
    slipNo: updatedBody.data.slipNo,
    putHttpStatus: updated.status(),
    partnerId: '<redacted-uuid>',
    selectedPartnerName: '(주)서울에어컨',
    expectedPartnerCodeFromPartnerService: 'P-2026-0001',
    requestPartnerCode: requestPayload?.['partnerCode'],
    responsePartnerCode: updatedBody.data.partnerCode,
    memo: updatedBody.data.memo,
    network: evidence,
  }, null, 2), 'utf8')
  await page.unrouteAll({ behavior: 'ignoreErrors' })
  await context.close()
})
