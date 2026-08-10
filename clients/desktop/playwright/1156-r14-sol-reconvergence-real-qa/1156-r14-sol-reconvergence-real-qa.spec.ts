import { expect, test, type APIRequestContext, type BrowserContext, type Page, type Route } from '@playwright/test'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const SOURCE_HEAD = '7453e7e2212ef02cc0bd327fbf50b9622502f5d6'
const RENDERER = 'http://127.0.0.1:5330'
const AUTH_API = 'http://127.0.0.1:8081'
const GATEWAY_API = 'http://127.0.0.1:8080'
const SLIP_API = 'http://127.0.0.1:28210'
const ACCOUNTING_API = 'http://127.0.0.1:28211'
const PRODUCT_ID = '8011ee54-a0ad-4731-9173-d437d1e2c039'
const WAREHOUSE_ID = '11111111-1111-1111-1111-000000000001'
const INTERNAL_TOKEN = process.env['R14_INTERNAL_TOKEN'] ?? ''
const dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = resolveQaShotsDir(path.resolve(dirname, '../../../../docs/qa/2026-08-10-1156-r14'))

type Session = { token: string; role: string; userId: string; displayName: string; groups?: Array<{ id: string }> }
type Partner = { partnerId: string; partnerCode: string; name: string; bizNo?: string | null; email?: string | null }

async function login(request: APIRequestContext, loginId: string, password: string): Promise<Session> {
  const response = await request.post(`${AUTH_API}/auth/login`, { data: { loginId, password } })
  const raw = await response.text()
  expect(response.status(), raw).toBe(200)
  return JSON.parse(raw).data as Session
}

function headers(session: Session, actor = 'CODEX SOL 5.6 R14'): Record<string, string> {
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
  line: { modelName: string; specification?: string | null; quantity: number; unitPrice: number; note?: string | null },
): Promise<Record<string, any>> {
  const authHeaders = headers(session)
  const listed = await request.get(`${SLIP_API}/slips?slipType=OUTBOUND&page=0&size=300`, { headers: authHeaders })
  expect(listed.status()).toBe(200)
  let slip = ((await listed.json()).data.content as Array<Record<string, any>>).find((row) => row.memo === memo)
  if (!slip) {
    const created = await request.post(`${SLIP_API}/slips`, {
      headers: authHeaders,
      data: {
        slipType: 'OUTBOUND',
        sourceWarehouseId: WAREHOUSE_ID,
        partnerId: partner.partnerId,
        partnerName: partner.name,
        memo,
        lines: [{
          productId: PRODUCT_ID,
          productName: 'R14 실사용자 표본',
          modelName: line.modelName,
          specification: line.specification,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          note: line.note,
        }],
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
      headers: action === 'inspect' ? headers(inspector, 'CODEX SOL 5.6 R14 inspector') : authHeaders,
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
  const response = await route.fetch({
    url: `${base}${source.pathname}${source.search}`,
    headers: { ...incoming.headers(), ...headers(session) },
  })
  await route.fulfill({ response, body: await response.body() })
}

async function appPage(context: BrowserContext, session: Session): Promise<Page> {
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
  await page.route('http://localhost:8080/**', (route) => proxy(route, session))
  await page.route('http://127.0.0.1:8080/**', (route) => proxy(route, session))
  return page
}

function pick(rows: Array<Record<string, any>>, slipNo: string): Record<string, any> {
  const row = rows.find((candidate) => candidate.slipNo === slipNo)
  expect(row, `${slipNo} 결과 행`).toBeTruthy()
  return row!
}

function five(row: Record<string, any>) {
  return {
    buyerEmail1: row.buyerEmail1,
    itemSpec1: row.itemSpec1,
    itemQty1: row.itemQty1,
    itemPrice1: row.itemPrice1,
    itemRemark1: row.itemRemark1,
  }
}

test('R14 HEAD 체인에서 화면·배치·XLSX 다섯 열과 빈 값 보존을 실측한다', async ({ browser, request }) => {
  let password: string
  let inspectorPassword: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
    inspectorPassword = resolveQaCredential('QA_MASTER_PASSWORD')
  } catch {
    test.skip(true, '라이브 QA 자격을 해소할 수 없습니다.')
    throw new Error('unreachable after test.skip')
  }
  expect(INTERNAL_TOKEN, 'R14_INTERNAL_TOKEN 미설정').not.toBe('')

  const session = await login(request, 'dev_master', password)
  const inspector = await login(request, 'kimeunji', inspectorPassword)
  const partners = await searchPartners(request, session)
  const populatedPartner = partners.find((partner) => String(partner.bizNo ?? '').replace(/[-\s]/g, '') === '1130710031')
  const blankPartner = partners.find((partner) => partner.name === '이상덕기사님(경기퀵)')
  expect(populatedPartner).toBeTruthy()
  expect(blankPartner).toBeTruthy()

  const populated = await ensureConfirmed(
    request, session, inspector, populatedPartner!, 'R14 HOMETAX populated five columns',
    { modelName: '0000098', specification: null, quantity: 1, unitPrice: 949, note: 'R14-NOTE-949' },
  )
  const blank = await ensureConfirmed(
    request, session, inspector, blankPartner!, 'R14 HOMETAX blank optional columns',
    { modelName: '', specification: null, quantity: 1, unitPrice: 959, note: null },
  )

  const salesQueryResponse = await request.get(
    `${SLIP_API}/internal/slips/sales-query?from=2026-08-10&to=2026-08-10&page=0&size=500`,
    { headers: { 'x-internal-token': INTERNAL_TOKEN } },
  )
  const salesQueryRaw = await salesQueryResponse.text()
  expect(salesQueryResponse.status(), salesQueryRaw).toBe(200)
  const salesRows = JSON.parse(salesQueryRaw).data.content as Array<Record<string, any>>
  const salesPopulated = pick(salesRows, populated.slipNo)
  const salesBlank = pick(salesRows, blank.slipNo)

  const requestData = { fromDate: '2026-08-10', toDate: '2026-08-10', includeUnconfirmed: false }
  const previewResponse = await request.post(`${ACCOUNTING_API}/accounting/hometax-export/preview`, {
    headers: headers(session), data: requestData,
  })
  const previewRaw = await previewResponse.text()
  expect(previewResponse.status(), previewRaw).toBe(200)
  const previewRows = JSON.parse(previewRaw).data.rows as Array<Record<string, any>>
  const previewPopulated = pick(previewRows, populated.slipNo)
  const previewBlank = pick(previewRows, blank.slipNo)

  const legacyBatchResponse = await request.post(`${ACCOUNTING_API}/accounting/tax-invoices/batch/preview`, {
    headers: headers(session), data: requestData,
  })
  const legacyBatchRaw = await legacyBatchResponse.text()
  expect(legacyBatchResponse.status(), legacyBatchRaw).toBe(200)
  const legacyRows = JSON.parse(legacyBatchRaw).data.rows as Array<Record<string, any>>
  const legacyPopulated = pick(legacyRows, populated.slipNo)
  const legacyBlank = pick(legacyRows, blank.slipNo)

  expect(five(salesPopulated)).toEqual({
    buyerEmail1: undefined,
    itemSpec1: undefined,
    itemQty1: undefined,
    itemPrice1: undefined,
    itemRemark1: undefined,
  })
  expect({
    email: salesPopulated.email,
    itemSpec: salesPopulated.itemSpec,
    itemQty: salesPopulated.itemQty,
    itemPrice: salesPopulated.itemPrice,
    itemRemark: salesPopulated.itemRemark,
  }).toEqual({
    email: 'info1@samhan-test.com', itemSpec: '0000098', itemQty: 1, itemPrice: 949, itemRemark: 'R14-NOTE-949',
  })
  expect(five(previewPopulated)).toEqual({
    buyerEmail1: 'info1@samhan-test.com', itemSpec1: '0000098', itemQty1: 1, itemPrice1: 949, itemRemark1: 'R14-NOTE-949',
  })
  expect(five(legacyPopulated)).toEqual(five(previewPopulated))
  expect({ email: salesBlank.email, itemSpec: salesBlank.itemSpec, itemRemark: salesBlank.itemRemark })
    .toEqual({ email: '', itemSpec: '', itemRemark: '' })
  expect({ buyerEmail1: previewBlank.buyerEmail1, itemSpec1: previewBlank.itemSpec1, itemRemark1: previewBlank.itemRemark1 })
    .toEqual({ buyerEmail1: '', itemSpec1: '', itemRemark1: '' })
  expect(five(legacyBlank)).toEqual(five(previewBlank))
  expect(previewPopulated.buyerRegNo).toBe('1130710031')
  expect(previewBlank.buyerRegNo).toBe('')

  const context = await browser.newContext({ viewport: { width: 2400, height: 1100 } })
  const page = await appPage(context, session)
  await page.goto(`${RENDERER}/#/accounting/hometax-export`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('hometax-export-tab-preview')).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('hometax-export-tab-preview').click()
  await page.getByTestId('batch-preview-from').fill('2026-08-10')
  await page.getByTestId('batch-preview-to').fill('2026-08-10')
  await page.getByTestId('batch-preview-execute').click()
  const table = page.getByTestId('batch-result-table')
  await expect(table).toBeVisible({ timeout: 60_000 })
  const labels = (await table.locator('thead th').allTextContents()).map((value) => value.trim())
  const populatedCells = (await table.locator('tbody tr').filter({ hasText: populated.slipNo }).first().locator('td').allTextContents()).map((value) => value.trim())
  const blankCells = (await table.locator('tbody tr').filter({ hasText: blank.slipNo }).first().locator('td').allTextContents()).map((value) => value.trim())
  expect(populatedCells).toContain('info1@samhan-test.com')
  expect(populatedCells).toContain('0000098')
  expect(populatedCells).toContain('1')
  expect(populatedCells).toContain('₩949')
  expect(populatedCells).toContain('R14-NOTE-949')
  await page.screenshot({ path: path.join(SHOTS, '01-hometax-five-values-live.png'), fullPage: true })

  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('batch-result-download-0').click()
  const download = await downloadPromise
  await download.saveAs(path.join(SHOTS, 'r14-hometax.xlsx'))

  console.log(`R14_EVIDENCE=${JSON.stringify({
    sourceHead: SOURCE_HEAD,
    endpoints: {
      renderer: RENDERER,
      salesQuery: `${SLIP_API}/internal/slips/sales-query`,
      preview: `${ACCOUNTING_API}/accounting/hometax-export/preview`,
      legacyBatch: `${ACCOUNTING_API}/accounting/tax-invoices/batch/preview`,
    },
    samples: [populated, blank].map((row) => ({ slipNo: row.slipNo, status: row.status, memo: row.memo })),
    salesQuery: { populated: salesPopulated, blank: salesBlank },
    preview: { populated: previewPopulated, blank: previewBlank },
    legacyBatch: { populated: legacyPopulated, blank: legacyBlank },
    screen: { labels, populatedCells, blankCells },
    credentials: '<redacted>', ids: '<redacted>',
  })}`)
  await context.close()
})

test('R14 실데이터 결과표에서 Ctrl+C TSV와 공급받는자 열필터가 동작한다', async ({ browser, request }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch {
    test.skip(true, '라이브 QA 자격을 해소할 수 없습니다.')
    throw new Error('unreachable after test.skip')
  }

  const session = await login(request, 'dev_master', password)
  const context = await browser.newContext({ viewport: { width: 2400, height: 1100 } })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const page = await appPage(context, session)
  await page.goto(`${RENDERER}/#/accounting/hometax-export`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('hometax-export-tab-preview')).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('hometax-export-tab-preview').click()
  await page.getByTestId('batch-preview-from').fill('2026-08-10')
  await page.getByTestId('batch-preview-to').fill('2026-08-10')
  await page.getByTestId('batch-preview-execute').click()
  await expect(page.getByTestId('batch-result-table')).toBeVisible({ timeout: 60_000 })
  await page.getByTestId('batch-result-grid-mode-btn').click()
  await expect(page.getByTestId('batch-result-datagrid')).toBeVisible()

  const grid = page.locator('[data-testid="data-grid"]')
  const cell = (row: number, col: number) => grid.locator(`tbody td[data-row="${row}"][data-col="${col}"]`)
  const rows = grid.locator('tbody tr')
  const beforeCount = await rows.count()
  expect(beforeCount).toBeGreaterThanOrEqual(3)

  await cell(0, 1).click()
  await cell(2, 3).click({ modifiers: ['Shift'] })
  await page.keyboard.press('Control+c')
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 5_000 }).toContain('\t')
  const clipboard = await page.evaluate(() => navigator.clipboard.readText())
  const clipboardLines = clipboard.split(/\r?\n/)
  expect(clipboardLines).toHaveLength(3)
  expect(clipboardLines.every((line) => line.split('\t').length === 3)).toBe(true)
  const visibleDate = await cell(0, 2).innerText()
  expect(visibleDate).toMatch(/^\d{8}$/)
  await page.screenshot({ path: path.join(SHOTS, '02-datagrid-ctrl-c-tsv-live.png'), fullPage: true })

  await page.getByTestId('dg-filter-btn-buyerName').click()
  await expect(page.getByTestId('dg-filter-popover')).toBeVisible()
  await page.getByTestId('dg-filter-text-input').fill('(주)서울에어컨')
  await page.getByTestId('dg-filter-apply').click()
  const afterCount = await rows.count()
  expect(afterCount).toBeGreaterThan(0)
  expect(afterCount).toBeLessThan(beforeCount)
  const buyerNames = (await grid.locator('tbody td[data-col="5"]').allTextContents()).map((value) => value.trim())
  expect(buyerNames.every((value) => value.includes('서울에어컨'))).toBe(true)
  await page.screenshot({ path: path.join(SHOTS, '03-datagrid-buyer-filter-live.png'), fullPage: true })

  console.log(`R14_DATAGRID_EVIDENCE=${JSON.stringify({
    beforeCount, afterCount, clipboardLines, visibleDate, buyerNames,
    credentials: '<redacted>', ids: '<redacted>',
  })}`)
  await context.close()
})
