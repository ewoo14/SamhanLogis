import { expect, test, type APIRequestContext, type BrowserContext, type Route } from '@playwright/test'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const AUTH_API = 'http://127.0.0.1:8081'
const HEAD_SLIP_API = 'http://127.0.0.1:28186'
const dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = resolveQaShotsDir(path.resolve(dirname, '../../../../docs/qa/2026-08-09-1156-r5'))
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi

type Login = { token: string; role: string; userId: string; displayName: string; groups?: Array<{ id: string }> }

async function login(request: APIRequestContext, password: string): Promise<Login> {
  const response = await request.post(`${AUTH_API}/auth/login`, { data: { loginId: 'dev_master', password } })
  expect(response.status(), 'dev_master login').toBe(200)
  return (await response.json()).data as Login
}

function userHeaders(session: Login): Record<string, string> {
  return {
    'x-user-id': session.userId,
    'x-user-name': 'SOL 5.6 R5',
    'x-user-role': session.role,
    'x-user-groups': (session.groups ?? []).map((group) => group.id).join(','),
    'x-is-system-master': 'true',
  }
}

async function proxyApi(route: Route, session: Login, network: Array<Record<string, unknown>>): Promise<void> {
  const incoming = route.request()
  const source = new URL(incoming.url())
  const useHead = source.pathname === '/slips' || source.pathname.startsWith('/slips/')
  const target = useHead ? `${HEAD_SLIP_API}${source.pathname}${source.search}` : source.href
  const response = await route.fetch({ url: target, headers: { ...incoming.headers(), ...userHeaders(session) } })
  if (useHead) {
    network.push({ method: incoming.method(), status: response.status(), path: source.pathname.replace(UUID_RE, '<redacted-uuid>'), target: 'HEAD-28186' })
  }
  await route.fulfill({ response, body: await response.body() })
}

async function appContext(browserContext: BrowserContext, session: Login, network: Array<Record<string, unknown>>) {
  const page = await browserContext.newPage()
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
  await page.route('http://localhost:8080/**', (route) => proxyApi(route, session, network))
  await page.route('http://127.0.0.1:8080/**', (route) => proxyApi(route, session, network))
  return page
}

test('R5 fix 전후 동일 R4 DRAFT의 직접 수정 버튼 렌더 가드를 확정한다', async ({ browser, request }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch {
    test.skip(true, 'QA_DEV_DEFAULT_PASSWORD를 해소할 수 없어 라이브 QA를 건너뜁니다.')
    throw new Error('unreachable after test.skip')
  }

  fs.mkdirSync(SHOTS, { recursive: true })
  const session = await login(request, password)
  expect(session.role).toBe('MASTER')
  const headers = userHeaders(session)
  const listed = await request.get(`${HEAD_SLIP_API}/slips?slipType=INBOUND&status=DRAFT&page=0&size=100`, { headers })
  expect(listed.status(), await listed.text()).toBe(200)
  const listBody = await listed.json()
  const candidates = (listBody.data.content as Array<Record<string, unknown>>)
    .filter((row) => String(row.memo ?? '').includes('R4 GUI direct PUT partnerCode code-fix'))
  expect(candidates.length, 'R4가 생성한 DRAFT 표본').toBeGreaterThan(0)
  const candidate = candidates[0]!
  const slipId = String(candidate.id)
  const detailResponse = await request.get(`${HEAD_SLIP_API}/slips/${slipId}`, { headers })
  expect(detailResponse.status()).toBe(200)
  const detail = (await detailResponse.json()).data as Record<string, unknown>

  const renderers = [
    { label: 'fix-before-5316', baseUrl: 'http://127.0.0.1:5316', expectedNewMapping: false },
    { label: 'r4-web-5328', baseUrl: 'http://127.0.0.1:5328', expectedNewMapping: true },
    { label: 'r5-renderer-5330', baseUrl: 'http://127.0.0.1:5330', expectedNewMapping: true },
  ]
  const observations: Array<Record<string, unknown>> = []

  for (const renderer of renderers) {
    const sourceResponse = await request.get(`${renderer.baseUrl}/routes/SlipDetailPage.tsx`)
    expect(sourceResponse.status()).toBe(200)
    const servedSource = await sourceResponse.text()
    const network: Array<Record<string, unknown>> = []
    const context = await browser.newContext()
    const page = await appContext(context, session, network)
    const requestedUrl = `${renderer.baseUrl}/#/purchases/${slipId}`
    await page.goto(requestedUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(12_000)
    const editButtonCount = await page.getByTestId('purchase-slip-edit-open').count()
    const dashboardVisible = await page.getByText('환영합니다,', { exact: false }).count()
    const bodyText = (await page.locator('body').innerText()).replace(UUID_RE, '<redacted-uuid>').slice(0, 1200)
    await page.screenshot({ path: path.join(SHOTS, `${renderer.label}.png`), fullPage: true })
    observations.push({
      round: 'R5',
      renderer: renderer.label,
      requestedUrl: requestedUrl.replace(UUID_RE, '<redacted-uuid>'),
      finalUrl: page.url().replace(UUID_RE, '<redacted-uuid>'),
      servedCurrentMapping: servedSource.includes('nextPartnerCode'),
      servedOldMapping: servedSource.includes('setCode(nextBizNo)'),
      expectedNewMapping: renderer.expectedNewMapping,
      editButtonCount,
      dashboardVisible,
      detailStatus: detail.status,
      slipType: detail.slipType,
      sessionRole: session.role,
      network,
      bodyText,
    })
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await context.close()
  }

  fs.writeFileSync(path.join(SHOTS, 'edit-gate-evidence.json'), JSON.stringify({
    round: 'R5',
    listHttpStatus: listed.status(),
    detailHttpStatus: detailResponse.status(),
    sample: { id: '<redacted-uuid>', slipNo: detail.slipNo, status: detail.status, slipType: detail.slipType, memo: detail.memo },
    observations,
  }, null, 2), 'utf8')
})

test('R5 매입·매출 direct edit의 저장 직전 PUT 식별자 체계를 실 GUI에서 검증한다', async ({ browser, request }) => {
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
  const cases = [
    { type: 'INBOUND', route: 'purchases', open: 'purchase-slip-edit-open', modal: 'purchase-slip-edit-modal', save: 'purchase-slip-edit-submit' },
    { type: 'OUTBOUND', route: 'sales', open: 'sales-slip-edit-button', modal: 'sales-slip-edit-modal', save: 'sales-slip-edit-save' },
  ] as const
  const results: Array<Record<string, unknown>> = []

  for (const current of cases) {
    const listed = await request.get(`${HEAD_SLIP_API}/slips?slipType=${current.type}&status=DRAFT&page=0&size=100`, { headers })
    expect(listed.status()).toBe(200)
    const listBody = await listed.json()
    const rows = listBody.data.content as Array<Record<string, unknown>>
    expect(rows.length, `${current.type} DRAFT 표본`).toBeGreaterThan(0)
    let detail: Record<string, unknown> | undefined
    let slipId = ''
    for (const row of rows.slice(0, 20)) {
      const candidateId = String(row.id)
      const response = await request.get(`${HEAD_SLIP_API}/slips/${candidateId}`, { headers })
      if (response.status() !== 200) continue
      const candidate = (await response.json()).data as Record<string, unknown>
      if (Array.isArray(candidate.lines) && candidate.lines.length > 0) {
        detail = candidate
        slipId = candidateId
        break
      }
    }
    expect(detail, `${current.type} 라인 보유 DRAFT 상세`).toBeTruthy()

    const network: Array<Record<string, unknown>> = []
    const context = await browser.newContext()
    const page = await appContext(context, session, network)
    await page.goto(`http://127.0.0.1:5330/#/${current.route}/${slipId}`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId(current.open).click()
    await expect(page.getByTestId(current.modal)).toBeVisible({ timeout: 30_000 })
    const partner = page.getByTestId('slip-coedit-field-header-partnerName')
    await expect(partner).toBeEnabled({ timeout: 30_000 })
    await partner.fill('서울에어컨')
    const option = page.getByRole('listbox', { name: '거래처 목록' }).getByRole('option').filter({ hasText: '(주)서울에어컨' })
    await expect(option).toBeVisible({ timeout: 15_000 })
    await option.click()
    await expect(partner).toHaveValue('(주)서울에어컨', { timeout: 15_000 })
    await expect(page.getByTestId(current.save)).toBeEnabled({ timeout: 30_000 })
    await page.screenshot({ path: path.join(SHOTS, `direct-${current.type.toLowerCase()}-before-put.png`), fullPage: true })

    let putBody: Record<string, unknown> | undefined
    const putPath = current.type === 'OUTBOUND' ? `/slips/${slipId}/sales` : `/slips/${slipId}`
    await page.route(`**${putPath}`, async (route) => {
      if (route.request().method() !== 'PUT') return route.fallback()
      putBody = route.request().postDataJSON() as Record<string, unknown>
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { ...detail, ...putBody } }),
      })
    })
    const putRequest = page.waitForRequest((outgoing) => outgoing.method() === 'PUT' && new URL(outgoing.url()).pathname === putPath)
    await page.getByTestId(current.save).click()
    await putRequest
    expect(putBody?.partnerCode).toBe('P-2026-0001')
    expect(putBody?.businessNumber).toBe('113-07-10031')
    results.push({
      round: 'R5',
      slipType: current.type,
      slipNo: detail?.slipNo,
      slipId: '<redacted-uuid>',
      renderer: 'r5-renderer-5330',
      requestPartnerCode: putBody?.partnerCode,
      requestBusinessNumber: putBody?.businessNumber,
      putDisposition: '브라우저에서 200 synthetic fulfill — 공유 DB write 금지로 HEAD-28186에는 전달하지 않음',
      realNetworkBeforePut: network,
    })
    fs.writeFileSync(path.join(SHOTS, 'direct-put-payload-evidence.json'), JSON.stringify({ round: 'R5', results }, null, 2), 'utf8')
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await context.close()
  }

})
