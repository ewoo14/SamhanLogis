import { expect, test, type APIRequestContext, type BrowserContext, type Page, type Route } from '@playwright/test'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const RENDERER = 'http://127.0.0.1:5330'
const AUTH_API = 'http://127.0.0.1:8081'
const GATEWAY_API = 'http://127.0.0.1:8080'
const SLIP_API = 'http://127.0.0.1:28206'
const ACCOUNTING_API = 'http://127.0.0.1:28208'
const PRODUCT_ID = '8011ee54-a0ad-4731-9173-d437d1e2c039'
const WAREHOUSE_ID = '11111111-1111-1111-1111-000000000001'
const dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = resolveQaShotsDir(path.resolve(dirname, '../../../../docs/qa/2026-08-10-1156-r10'))

type Session = { token: string; role: string; userId: string; displayName: string; groups?: Array<{ id: string }> }
type Partner = { partnerId: string; partnerCode: string; name: string; bizNo?: string | null }

async function login(request: APIRequestContext, loginId: string, password: string): Promise<Session> {
  const response = await request.post(`${AUTH_API}/auth/login`, { data: { loginId, password } })
  const raw = await response.text()
  expect(response.status(), raw).toBe(200)
  return JSON.parse(raw).data as Session
}

function headers(session: Session, actor = 'SOL 5.6 R10'): Record<string, string> {
  return {
    authorization: `Bearer ${session.token}`,
    'x-user-id': session.userId,
    'x-user-name': actor,
    'x-user-role': session.role,
    'x-user-groups': (session.groups ?? []).map((group) => group.id).join(','),
    'x-is-system-master': 'true',
  }
}

async function searchPartners(request: APIRequestContext, session: Session): Promise<Partner[]> {
  const response = await request.get(`${GATEWAY_API}/admin/partners/search?q=&size=10000`, { headers: headers(session) })
  const raw = await response.text()
  expect(response.status(), raw).toBe(200)
  return JSON.parse(raw).data.items as Partner[]
}

async function ensureConfirmed(
  request: APIRequestContext,
  session: Session,
  inspector: Session,
  partner: Partner,
  memo: string,
  unitPrice: number,
): Promise<Record<string, any>> {
  const authHeaders = headers(session)
  const listed = await request.get(`${SLIP_API}/slips?slipType=OUTBOUND&page=0&size=200`, { headers: authHeaders })
  expect(listed.status()).toBe(200)
  let slip = ((await listed.json()).data.content as Array<Record<string, any>>).find((row) => row.memo === memo)
  if (!slip) {
    const created = await request.post(`${SLIP_API}/slips`, {
      headers: authHeaders,
      data: {
        slipType: 'OUTBOUND', sourceWarehouseId: WAREHOUSE_ID,
        partnerId: partner.partnerId, partnerName: partner.name, memo,
        lines: [{ productId: PRODUCT_ID, productName: '한경희 선풍기', modelName: '0000098', quantity: 1, unitPrice }],
      },
    })
    const raw = await created.text()
    expect(created.status(), raw).toBe(201)
    slip = JSON.parse(raw).data
  }
  const detail = await request.get(`${SLIP_API}/slips/${slip!.id}`, { headers: authHeaders })
  expect(detail.status()).toBe(200)
  slip = (await detail.json()).data
  const actions: Record<string, string> = {
    DRAFT: 'save', SAVED: 'send', SENT: 'accept', ACCEPTED: 'process', PROCESSING: 'complete',
    INSPECTING: 'inspect', COMPLETED: 'ship', SHIPPING: 'deliver', DELIVERED: 'confirm',
  }
  while (slip.status !== 'CONFIRMED') {
    const action = actions[String(slip.status)]
    expect(action, `예상하지 못한 상태: ${slip.status}`).toBeTruthy()
    const response = await request.post(`${SLIP_API}/slips/${slip.id}/${action}`, {
      headers: action === 'inspect' ? headers(inspector, 'SOL 5.6 R10 inspector') : authHeaders,
    })
    const raw = await response.text()
    expect(response.ok(), `${action}: ${raw}`).toBeTruthy()
    slip = JSON.parse(raw).data
  }
  return slip
}

async function proxy(route: Route, session: Session): Promise<void> {
  const incoming = route.request()
  const source = new URL(incoming.url())
  const base = source.pathname.startsWith('/accounting/hometax-export') ? ACCOUNTING_API
    : source.pathname.startsWith('/slips') ? SLIP_API : GATEWAY_API
  const response = await route.fetch({ url: `${base}${source.pathname}${source.search}`, headers: { ...incoming.headers(), ...headers(session) } })
  await route.fulfill({ response, body: await response.body() })
}

async function appPage(context: BrowserContext, session: Session): Promise<Page> {
  const page = await context.newPage()
  await page.addInitScript(({ token, role, userId, displayName, groups }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: { getToken: async () => ({ token, userId, role, fullName: displayName, partnerCode: null, groups }), setToken: async () => undefined, clearToken: async () => undefined },
    })
  }, session)
  await page.route('http://localhost:8080/**', (route) => proxy(route, session))
  await page.route('http://127.0.0.1:8080/**', (route) => proxy(route, session))
  return page
}

test('R10 홈택스 결과표 전 열이 DTO와 일치하고 실제 값으로 표시된다', async ({ browser, request }) => {
  let password: string
  let inspectorPassword: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
    inspectorPassword = resolveQaCredential('QA_MASTER_PASSWORD')
  } catch {
    test.skip(true, '라이브 QA 자격을 해소할 수 없습니다.')
    throw new Error('unreachable after test.skip')
  }

  fs.mkdirSync(SHOTS, { recursive: true })
  const session = await login(request, 'dev_master', password)
  const inspector = await login(request, 'kimeunji', inspectorPassword)
  const partners = await searchPartners(request, session)
  const withBusinessNumber = partners.find((partner) => partner.name === '(주)서울에어컨')
  const withoutBusinessNumber = partners.find((partner) => partner.name === '이상덕기사님(경기퀵)')
  expect(withBusinessNumber?.bizNo).toBe('113-07-10031')
  expect(String(withoutBusinessNumber?.bizNo ?? '').replace(/[-\s]/g, '')).toBe('')

  const normal = await ensureConfirmed(request, session, inspector, withBusinessNumber!, 'R10 HOMETAX view fields business number', 929)
  const missing = await ensureConfirmed(request, session, inspector, withoutBusinessNumber!, 'R10 HOMETAX view fields missing business number', 939)
  const direct = await request.post(`${ACCOUNTING_API}/accounting/hometax-export/preview`, {
    headers: headers(session), data: { fromDate: '2026-08-10', toDate: '2026-08-10', includeUnconfirmed: false },
  })
  const directRaw = await direct.text()
  expect(direct.status(), directRaw).toBe(200)
  const directRows = JSON.parse(directRaw).data.rows as Array<Record<string, any>>
  const normalDto = directRows.find((row) => row.slipNo === normal.slipNo)
  const missingDto = directRows.find((row) => row.slipNo === missing.slipNo)
  expect(normalDto).toBeTruthy()
  expect(missingDto).toBeTruthy()
  expect(normalDto!.writeDate).toBeTruthy()
  expect(normalDto!.supplierRegNo).toBe('2148720659')
  expect(normalDto!.buyerName).toBe('(주)서울에어컨')
  expect(normalDto!.buyerRegNo).toBe('1130710031')
  expect(normalDto!.partnerCode).toBe('P-2026-0001')
  expect(missingDto!.buyerRegNo).toBe('')

  const context = await browser.newContext()
  const page = await appPage(context, session)
  await page.goto(`${RENDERER}/#/accounting/hometax-export`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('hometax-export-tab-preview')).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('hometax-export-tab-preview').click()
  await page.getByTestId('batch-preview-from').fill('2026-08-10')
  await page.getByTestId('batch-preview-to').fill('2026-08-10')
  await page.getByTestId('batch-preview-execute').click()
  await expect(page.getByTestId('batch-result-table')).toBeVisible({ timeout: 60_000 })
  const normalRow = page.getByTestId('batch-result-table').locator('tbody tr').filter({ hasText: normal.slipNo }).first()
  const missingRow = page.getByTestId('batch-result-table').locator('tbody tr').filter({ hasText: missing.slipNo }).first()
  const normalCells = await normalRow.locator('td').allTextContents()
  const missingCells = await missingRow.locator('td').allTextContents()
  expect(normalCells[2]).toBe(normalDto!.writeDate)
  expect(normalCells[3]).toBe(normalDto!.supplierName)
  expect(normalCells[4]).toBe(normalDto!.supplierRegNo)
  expect(normalCells[5]).toBe(normalDto!.buyerName)
  expect(normalCells[6]).toBe(normalDto!.buyerRegNo)
  expect(normalCells[11]).toBe(normalDto!.itemName1)
  expect(normalCells[15]).toBe(normalDto!.partnerCode)
  expect(missingCells[5]).toBe(missingDto!.buyerName)
  expect(missingCells[6]).toBe('')
  expect(missingCells[15]).toBe(missingDto!.partnerCode)
  await page.screenshot({ path: path.join(SHOTS, '02-hometax-after-fix.png'), fullPage: true })
  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('batch-result-download-0').click()
  const download = await downloadPromise
  await download.saveAs(path.join(SHOTS, 'r10-hometax-after-fix.xlsx'))
  fs.writeFileSync(path.join(SHOTS, 'r10-after-fix-evidence.json'), JSON.stringify({
    round: 'R10', phase: 'GREEN-after-fix', deployment: { renderer: RENDERER, accountingApi: ACCOUNTING_API, sourceHead: 'c701051a2' },
    samples: [normal, missing].map((row) => ({ slipNo: row.slipNo, status: row.status })),
    dtoRows: { normal: normalDto, missing: missingDto },
    uiCells: { normal: normalCells, missing: missingCells },
    dtoToUiAssertions: { writeDate: normalCells[2], supplierRegNo: normalCells[4], buyerName: normalCells[5], buyerRegNo: normalCells[6], itemName1: normalCells[11], partnerCode: normalCells[15] },
    credentials: '<redacted>', ids: '<redacted-uuid>',
  }, null, 2), 'utf8')
  await context.close()
})
