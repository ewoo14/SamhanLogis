import { expect, test, type APIRequestContext, type BrowserContext, type Route } from '@playwright/test'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const AUTH_API = 'http://127.0.0.1:8081'
const SLIP_API = 'http://127.0.0.1:28186'
const dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = resolveQaShotsDir(path.resolve(dirname, '../../../../docs/qa/2026-08-09-1156-r6'))
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi
type Login = { token: string; role: string; userId: string; displayName: string; groups?: Array<{ id: string }> }

async function login(request: APIRequestContext, password: string): Promise<Login> {
  const response = await request.post(`${AUTH_API}/auth/login`, { data: { loginId: 'dev_master', password } })
  expect(response.status(), 'dev_master login').toBe(200)
  return (await response.json()).data as Login
}

function headers(session: Login): Record<string, string> {
  return { 'x-user-id': session.userId, 'x-user-name': 'SOL 5.6 R6', 'x-user-role': session.role, 'x-user-groups': (session.groups ?? []).map((g) => g.id).join(','), 'x-is-system-master': 'true' }
}

async function appPage(context: BrowserContext, session: Login, network: Array<Record<string, unknown>>) {
  const page = await context.newPage()
  await page.addInitScript(({ token, role, userId, displayName, groups }) => {
    Object.defineProperty(window, 'samhanAuth', { configurable: true, value: { getToken: async () => ({ token, userId, role, fullName: displayName, partnerCode: null, groups }), setToken: async () => undefined, clearToken: async () => undefined } })
  }, session)
  const proxy = async (route: Route) => {
    const incoming = route.request()
    const source = new URL(incoming.url())
    const target = source.pathname === '/slips' || source.pathname.startsWith('/slips/') ? `${SLIP_API}${source.pathname}${source.search}` : source.href
    const response = await route.fetch({ url: target, headers: { ...incoming.headers(), ...headers(session) } })
    if (source.pathname.startsWith('/slips')) network.push({ method: incoming.method(), status: response.status(), path: source.pathname.replace(UUID_RE, '<redacted-uuid>') })
    await route.fulfill({ response, body: await response.body() })
  }
  await page.route('http://localhost:8080/**', proxy)
  await page.route('http://127.0.0.1:8080/**', proxy)
  return page
}

test('R6 renderer 5330에서 fix 후 화면·요청 본문을 확인한다', async ({ browser, request }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch {
    test.skip(true, 'QA_DEV_DEFAULT_PASSWORD를 해소할 수 없어 라이브 QA를 건너뜁니다.')
    throw new Error('unreachable after test.skip')
  }
  fs.mkdirSync(SHOTS, { recursive: true })
  const session = await login(request, password)
  const authHeaders = headers(session)
  const results: Array<Record<string, unknown>> = []
  for (const current of [
    { type: 'INBOUND', route: 'purchases', open: 'purchase-slip-edit-open', modal: 'purchase-slip-edit-modal', save: 'purchase-slip-edit-submit', path: (id: string) => `/slips/${id}` },
    { type: 'OUTBOUND', route: 'sales', open: 'sales-slip-edit-button', modal: 'sales-slip-edit-modal', save: 'sales-slip-edit-save', path: (id: string) => `/slips/${id}/sales` },
  ] as const) {
    const listed = await request.get(`${SLIP_API}/slips?slipType=${current.type}&status=DRAFT&page=0&size=100`, { headers: authHeaders })
    expect(listed.status()).toBe(200)
    const rows = (await listed.json()).data.content as Array<Record<string, unknown>>
    let detail: Record<string, unknown> | undefined
    let slipId = ''
    for (const row of rows.slice(0, 20)) {
      const id = String(row.id)
      const response = await request.get(`${SLIP_API}/slips/${id}`, { headers: authHeaders })
      if (response.status() !== 200) continue
      const candidate = (await response.json()).data as Record<string, unknown>
      if (Array.isArray(candidate.lines) && candidate.lines.length > 0) { detail = candidate; slipId = id; break }
    }
    expect(detail, `${current.type} 라인 보유 DRAFT 상세`).toBeTruthy()
    const beforeContext = await browser.newContext()
    const beforeNetwork: Array<Record<string, unknown>> = []
    const beforePage = await appPage(beforeContext, session, beforeNetwork)
    await beforePage.goto(`http://127.0.0.1:5316/#/${current.route}/${slipId}`, { waitUntil: 'domcontentloaded' })
    await beforePage.waitForTimeout(8_000)
    await beforePage.screenshot({ path: path.join(SHOTS, `fix-before-5316-${current.type.toLowerCase()}.png`), fullPage: true })
    await beforePage.unrouteAll({ behavior: 'ignoreErrors' })
    await beforeContext.close()
    const network: Array<Record<string, unknown>> = []
    const context = await browser.newContext()
    const page = await appPage(context, session, network)
    await page.goto(`http://127.0.0.1:5330/#/${current.route}/${slipId}`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId(current.open).click()
    await expect(page.getByTestId(current.modal)).toBeVisible({ timeout: 30_000 })
    const partner = page.getByTestId('slip-coedit-field-header-partnerName')
    await expect(partner).toBeEnabled({ timeout: 30_000 })
    await partner.fill('서울에어컨')
    const option = page.getByRole('listbox', { name: '거래처 목록' }).getByRole('option').filter({ hasText: '(주)서울에어컨' })
    await expect(option).toBeVisible({ timeout: 15_000 })
    await option.click()
    await expect(page.getByTestId(current.save)).toBeEnabled({ timeout: 30_000 })
    await page.screenshot({ path: path.join(SHOTS, `fix-after-${current.type.toLowerCase()}.png`), fullPage: true })
    let putBody: Record<string, unknown> | undefined
    const putPath = current.path(slipId)
    await page.route(`**${putPath}`, async (route) => {
      if (route.request().method() !== 'PUT') return route.fallback()
      putBody = route.request().postDataJSON() as Record<string, unknown>
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ...detail, ...putBody } }) })
    })
    const putRequest = page.waitForRequest((outgoing) => outgoing.method() === 'PUT' && new URL(outgoing.url()).pathname === putPath)
    await page.getByTestId(current.save).click()
    await putRequest
    expect(putBody?.partnerCode).toBe('P-2026-0001')
    expect(putBody?.businessNumber).toBe('113-07-10031')
    results.push({ round: 'R6', slipType: current.type, slipNo: detail?.slipNo, slipId: '<redacted-uuid>', renderer: 'renderer-5330', requestPartnerCode: putBody?.partnerCode, requestBusinessNumber: putBody?.businessNumber, putDisposition: '200 synthetic fulfill; 공유 DB write 없음', realNetworkBeforePut: network })
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await context.close()
  }
  fs.writeFileSync(path.join(SHOTS, 'direct-put-payload-evidence.json'), JSON.stringify({ round: 'R6', results }, null, 2), 'utf8')
})
