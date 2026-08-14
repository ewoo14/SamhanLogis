import { chromium, expect, test, type APIRequestContext, type BrowserContext, type Page, type Route } from '@playwright/test'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const RENDERER = 'http://127.0.0.1:5294'
const AUTH_API = 'http://127.0.0.1:8081'
const GATEWAY_API = 'http://127.0.0.1:8080'
const BROWSER = 'C:\\Users\\user\\AppData\\Local\\ms-playwright\\chromium-1217\\chrome-win64\\chrome.exe'
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i
const dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = resolveQaShotsDir(path.resolve(dirname, '../../../../docs/qa/2026-08-14-1203-reconv3/screenshots'))

type Session = { token: string; role: string; userId: string; displayName: string; groups?: Array<{ id: string }> }

async function login(
  request: APIRequestContext,
  loginId = 'dev_master',
  credentialKey = 'QA_DEV_DEFAULT_PASSWORD',
): Promise<Session> {
  const password = resolveQaCredential(credentialKey)
  const response = await request.post(`${AUTH_API}/auth/login`, { data: { loginId, password } })
  const raw = await response.text()
  expect(response.status(), raw).toBe(200)
  return JSON.parse(raw).data as Session
}

function headers(session: Session): Record<string, string> {
  return {
    authorization: `Bearer ${session.token}`,
    'x-user-id': session.userId,
    'x-user-name': 'CODEX SOL PR1203 RECONV3',
    'x-user-role': session.role,
    'x-user-groups': (session.groups ?? []).map((group) => group.id).join(','),
    'x-is-system-master': 'true',
  }
}

async function proxy(route: Route, session: Session): Promise<void> {
  const requestHeaders = { ...route.request().headers(), ...headers(session) }
  if ((requestHeaders.accept ?? '').includes('text/event-stream')) {
    await route.continue({ headers: requestHeaders })
    return
  }
  const response = await route.fetch({ headers: requestHeaders })
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

async function api(
  request: APIRequestContext,
  session: Session,
  method: 'GET' | 'POST',
  endpoint: string,
  data?: unknown,
): Promise<{ status: number; data: any; raw: string }> {
  const response = await request.fetch(`${GATEWAY_API}${endpoint}`, {
    method,
    headers: headers(session),
    data,
  })
  const raw = await response.text()
  let parsed: any = undefined
  try { parsed = JSON.parse(raw) } catch { parsed = undefined }
  return { status: response.status(), data: parsed?.data, raw }
}

async function expectApi(
  request: APIRequestContext,
  session: Session,
  method: 'GET' | 'POST',
  endpoint: string,
  data?: unknown,
) {
  const result = await api(request, session, method, endpoint, data)
  expect(result.status, `${method} ${endpoint}: ${result.raw}`).toBeGreaterThanOrEqual(200)
  expect(result.status, `${method} ${endpoint}: ${result.raw}`).toBeLessThan(300)
  return result.data
}

async function mutationReget(
  page: Page,
  mutationButton: ReturnType<Page['getByRole']>,
  mutationUrlPart: string,
  detailUrl: string,
  detailMarker: string,
  shot: string,
) {
  const mutation = page.waitForResponse((response) => response.url().includes(mutationUrlPart) && response.request().method() === 'POST')
  await mutationButton.click()
  const mutationResponse = await mutation
  expect(mutationResponse.status(), `${mutationUrlPart} mutation`).toBeGreaterThanOrEqual(200)
  expect(mutationResponse.status(), `${mutationUrlPart} mutation`).toBeLessThan(300)
  await page.goto(`${RENDERER}/#/inventory/stock-balance`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('header-page-title')).toHaveText('재고 현황', { timeout: 30_000 })
  const refetch = page.waitForResponse((response) => response.url().includes('/inventory/balances') && response.request().method() === 'GET' && response.status() === 200)
  await page.getByTestId('inventory-balance-query-button').click()
  const refetchResponse = await refetch
  await page.goto(detailUrl, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('body')).toContainText(detailMarker, { timeout: 30_000 })
  await page.screenshot({ path: path.join(SHOTS, shot), fullPage: true })
  return { mutation: mutationResponse.status(), refetch: refetchResponse.status(), refetchUrl: refetchResponse.url() }
}

async function openLedger(page: Page) {
  await page.goto(`${RENDERER}/#/inventory/stock-balance`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('header-page-title')).toHaveText('재고 현황', { timeout: 30_000 })
  const response = page.waitForResponse((candidate) => candidate.url().includes('/inventory/balances') && candidate.request().method() === 'GET' && candidate.status() === 200)
  await page.getByTestId('inventory-balance-query-button').click()
  await response
  const button = page.getByRole('button', { name: '0000098 재고수불부 열기' }).first()
  await expect(button).toBeVisible({ timeout: 30_000 })
  await button.click()
  const dialog = page.getByRole('dialog', { name: '재고수불부' })
  await expect(dialog.getByRole('button', { name: /전표 .* 열기/ }).first()).toBeVisible({ timeout: 30_000 })
  return dialog
}

function expectNoUuid(value: string, label: string) {
  expect(value, `${label} UUID 비노출`).not.toMatch(UUID)
}

test('다섯 수불행 클릭이 각각 그 건의 상세에 착지한다', async ({ request }) => {
  const session = await login(request)
  const browser = await chromium.launch({ executablePath: BROWSER, headless: true })

  const cases = [
    { key: 'sales', no: '2026/08/14-9', rowMarker: '능동에어컨(박수천)', url: /#\/sales\/by-number\?slipNo=2026%2F08%2F14-9$/, heading: '판매전표 상세', unique: ['0000098', '한경희 선풍기'] },
    { key: 'inbound', no: '2026/08/14-2', rowMarker: null, url: /#\/purchases\/by-number\?slipNo=2026%2F08%2F14-2$/, heading: '입고전표 상세', unique: ['0000098', 'PR1203-SOL-RECONV2'] },
    { key: 'inspection', no: '2026/08/14-3', rowMarker: '검수 완료 입고', url: /#\/purchases\/by-number\?slipNo=2026%2F08%2F14-3$/, heading: '입고전표 상세', unique: ['0000098', 'INSPECTION'] },
    { key: 'transfer', no: '2026/08/14-15', rowMarker: null, url: /#\/transfers\/by-number\?transferNo=2026%2F08%2F14-15$/, heading: '이동전표 상세', unique: ['00003', 'HQ-001', '요청 수량', '출고 수량', '입고 수량'] },
    { key: 'audit', no: '2026/08/14-3', rowMarker: '재고 실사 조정', url: /#\/warehouse\/audit\/by-number\?auditNo=2026%2F08%2F14-3$/, heading: null, unique: ['한경희 선풍기', '실사 라인', '완료'] },
  ] as const

  const evidence: Record<string, unknown> = {}
  for (const item of cases) {
    console.log(`PR1203_NAV_CASE_START=${item.key}`)
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
    const page = await appPage(context, session)
    const dialog = await openLedger(page)
    const candidates = dialog.getByRole('button', { name: `전표 ${item.no} 열기` }).locator('xpath=ancestor::tr')
    const row = item.rowMarker ? candidates.filter({ hasText: item.rowMarker }).first() : candidates.first()
    const link = row.getByRole('button', { name: `전표 ${item.no} 열기` })
    await expect(link).toBeVisible()
    const ledgerRow = await row.innerText()
    expect(ledgerRow).toContain(item.no)
    await link.click()
    await expect(page).toHaveURL(item.url, { timeout: 30_000 })
    if (item.heading) await expect(page.getByRole('heading', { name: item.heading })).toBeVisible({ timeout: 30_000 })
    const body = page.locator('body')
    await expect(body).toContainText(item.no, { timeout: 30_000 })
    for (const marker of item.unique) await expect(body).toContainText(marker)
    const visible = await body.innerText()
    expectNoUuid(page.url(), `${item.key} URL`)
    expectNoUuid(visible, `${item.key} 화면`)
    await page.screenshot({ path: path.join(SHOTS, `01-${item.key}-ledger-row-detail-real-qa.png`), fullPage: true })
    evidence[item.key] = { no: item.no, url: page.url(), ledgerRow, markers: item.unique }
    console.log(`PR1203_NAV_CASE_PASS=${item.key}`)
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await context.close()
  }

  console.log(`PR1203_NAV_EVIDENCE=${JSON.stringify(evidence)}`)
  await browser.close()
})

test('없는 이동번호와 실사번호는 목록·UUID 대신 명시 오류를 보여 준다', async ({ request }) => {
  const session = await login(request)
  const browser = await chromium.launch({ executablePath: BROWSER, headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await appPage(context, session)
  const missing = [
    { key: 'transfer', url: `${RENDERER}/#/transfers/by-number?transferNo=PR1203-NOT-EXIST-TRANSFER`, message: '해당 이동전표를 찾을 수 없습니다.' },
    { key: 'audit', url: `${RENDERER}/#/warehouse/audit/by-number?auditNo=PR1203-NOT-EXIST-AUDIT`, message: '해당 재고 실사를 찾을 수 없습니다.' },
  ]
  for (const item of missing) {
    await page.goto(item.url, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('alert')).toHaveText(item.message, { timeout: 30_000 })
    expectNoUuid(page.url(), `${item.key} 없는 번호 URL`)
    expect(page.url()).toContain('/by-number?')
    await page.screenshot({ path: path.join(SHOTS, `02-missing-${item.key}-real-qa.png`), fullPage: true })
  }
  await context.close()
  await browser.close()
})

test('1366·1440·1600에서 dialog와 10열·기간·전일재고·합계를 재실측한다', async ({ request }) => {
  const session = await login(request)
  const browser = await chromium.launch({ executablePath: BROWSER, headless: true })
  const measurements: Array<Record<string, unknown>> = []
  for (const width of [1366, 1440, 1600]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    const page = await appPage(context, session)
    const dialog = await openLedger(page)
    const headers = (await dialog.locator('thead th').allTextContents()).map((value) => value.trim())
    expect(headers).toEqual(['일자', '품목명', '품목코드', '창고명', '거래처명', '적요', '전표번호', '입고수량', '출고수량', '재고수량'])
    await expect(dialog.locator('tbody tr').first()).toContainText('전일재고')
    await expect(dialog.getByTestId('stock-ledger-total-row')).toContainText('합계 / 누계')
    const start = await dialog.getByLabel('시작일').inputValue()
    const end = await dialog.getByLabel('종료일').inputValue()
    expect({ start, end }).toEqual({ start: '2026-05-14', end: '2026-08-14' })
    const geometry = await dialog.evaluate((node) => {
      const table = node.querySelector('table')!
      const scroller = table.parentElement!
      return {
        dialog: node.getBoundingClientRect().width,
        tableScroll: table.scrollWidth,
        tableClient: table.clientWidth,
        scrollerScroll: scroller.scrollWidth,
        scrollerClient: scroller.clientWidth,
      }
    })
    expect(geometry.tableScroll).toBeLessThanOrEqual(geometry.tableClient)
    expect(geometry.scrollerScroll).toBeLessThanOrEqual(geometry.scrollerClient)
    measurements.push({ viewport: width, start, end, headers: headers.length, ...geometry })
    await page.screenshot({ path: path.join(SHOTS, `03-ledger-${width}px-measured-real-qa.png`), fullPage: true })
    await context.close()
  }
  console.log(`PR1203_WIDTH_EVIDENCE=${JSON.stringify(measurements)}`)
  await browser.close()
})

test('새 표본으로 이동 불변식·캐시 재GET·실사 입력 세 경로를 다시 밟는다', async ({ request }) => {
  const session = await login(request)
  const inspector = await login(request, 'kimeunji', 'QA_MASTER_PASSWORD')
  const transfers = await expectApi(request, session, 'GET', '/inventory/transfers?page=0&size=100')
  const transferSeed = transfers.content.find((row: any) => row.transferNo === '2026/08/14-15')
  expect(transferSeed).toBeTruthy()
  const transferSeedDetail = await expectApi(request, session, 'GET', `/inventory/transfers/${transferSeed.id}`)
  const productId = transferSeedDetail.lines[0].productId as string
  const sourceWarehouseId = transferSeed.sourceWarehouseId as string
  const destinationWarehouseId = transferSeed.destinationWarehouseId as string

  const outboundList = await expectApi(request, session, 'GET', '/slips?slipType=OUTBOUND&page=0&size=300')
  const outboundSeed = outboundList.content.find((row: any) => row.slipNo === '2026/08/14-9')
  const outboundSeedDetail = await expectApi(request, session, 'GET', `/slips/${outboundSeed.id}`)
  const partnerId = outboundSeedDetail.partnerId as string
  const partnerName = outboundSeedDetail.partnerName as string
  const tag = `PR1203-RECONV3-${Date.now()}`

  const beforeRows = await expectApi(request, session, 'GET', '/inventory/balances?page=0&size=500')
  const beforeSource = beforeRows.content.find((row: any) => row.productCode === '0000098' && row.warehouseCode === transferSeed.sourceWarehouseCode).totalQty
  const beforeDestination = beforeRows.content.find((row: any) => row.productCode === '0000098' && row.warehouseCode === transferSeed.destinationWarehouseCode).totalQty

  let transfer = await expectApi(request, session, 'POST', '/inventory/transfers', {
    sourceWarehouseId,
    destinationWarehouseId,
    reason: 'REBALANCE',
    reasonDetail: tag,
    lines: [{ productId, requestedQuantity: 1 }],
  })
  for (const action of ['approve', 'ship', 'receive']) {
    transfer = await expectApi(request, session, 'POST', `/inventory/transfers/${transfer.id}/${action}`, {})
  }
  expect(transfer.status).toBe('RECEIVED')

  const createSlip = async (slipType: 'OUTBOUND' | 'INBOUND', memo: string) => expectApi(request, session, 'POST', '/slips', {
    slipType,
    ...(slipType === 'OUTBOUND' ? { sourceWarehouseId: destinationWarehouseId } : { destinationWarehouseId }),
    partnerId,
    partnerName,
    memo,
    lines: [{ productId, productName: '한경희 선풍기', modelName: '0000098', quantity: 1, unitPrice: 10000 }],
  })
  const advanceToCompleted = async (slip: any) => {
    const map: Record<string, string> = { DRAFT: 'save', SAVED: 'send', SENT: 'accept', ACCEPTED: 'process', PROCESSING: 'complete', INSPECTING: 'inspect' }
    while (slip.status !== 'COMPLETED') {
      const action = map[slip.status]
      expect(action, `예상하지 못한 전표 상태 ${slip.status}`).toBeTruthy()
      const actor = action === 'inspect' && slip.slipType === 'OUTBOUND' ? inspector : session
      slip = await expectApi(request, actor, 'POST', `/slips/${slip.id}/${action}`, {})
    }
    return slip
  }
  let outbound: any
  let inbound: any

  let audit = await expectApi(request, session, 'POST', '/inventory/audits', { warehouseId: sourceWarehouseId, auditDate: '2026-08-14' })
  audit = await expectApi(request, session, 'POST', `/inventory/audits/${audit.id}/start`, {})
  const auditLine = audit.lines.find((line: any) => line.productId === productId)
  expect(auditLine).toBeTruthy()
  const uuidLine = audit.lines.find((line: any) => line.productId !== productId)
  expect(uuidLine).toBeTruthy()

  const browser = await chromium.launch({ executablePath: BROWSER, headless: true })
  const events: Record<string, unknown> = {}

  {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
    const page = await appPage(context, session)
    const detailUrl = `${RENDERER}/#/transfers/by-number?transferNo=${encodeURIComponent(transfer.transferNo)}`
    await page.goto(detailUrl, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: '이동전표 상세' })).toBeVisible({ timeout: 30_000 })
    events.transfer = await mutationReget(page, page.getByRole('button', { name: '확정', exact: true }), `/inventory/transfers/${transfer.id}/confirm`, detailUrl, transfer.transferNo, '04-transfer-confirm-refetched-real-qa.png')
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await context.close()
  }

  const afterRows = await expectApi(request, session, 'GET', '/inventory/balances?page=0&size=500')
  const afterSource = afterRows.content.find((row: any) => row.productCode === '0000098' && row.warehouseCode === transferSeed.sourceWarehouseCode).totalQty
  const afterDestination = afterRows.content.find((row: any) => row.productCode === '0000098' && row.warehouseCode === transferSeed.destinationWarehouseCode).totalQty
  expect(afterSource - beforeSource).toBe(-1)
  expect(afterDestination - beforeDestination).toBe(1)
  expect((afterSource + afterDestination) - (beforeSource + beforeDestination)).toBe(0)

  outbound = await advanceToCompleted(await createSlip('OUTBOUND', `${tag}-SALES`))
  inbound = await advanceToCompleted(await createSlip('INBOUND', `${tag}-INBOUND`))

  {
    const context = await browser.newContext({ viewport: { width: 1580, height: 1000 } })
    const page = await appPage(context, session)
    const detailUrl = `${RENDERER}/#/sales/by-number?slipNo=${encodeURIComponent(outbound.slipNo)}`
    await page.goto(detailUrl, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: '판매전표 상세' })).toBeVisible({ timeout: 30_000 })
    events.salesShip = await mutationReget(page, page.getByRole('button', { name: '완료 (배송 시작)', exact: true }), `/slips/${outbound.id}/ship`, detailUrl, outbound.slipNo, '05-sales-ship-refetched-real-qa.png')
    outbound = await expectApi(request, session, 'POST', `/slips/${outbound.id}/deliver`, {})
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: '완료 (확정)', exact: true })).toBeEnabled({ timeout: 30_000 })
    events.salesConfirm = await mutationReget(page, page.getByRole('button', { name: '완료 (확정)', exact: true }), `/slips/${outbound.id}/confirm`, detailUrl, outbound.slipNo, '06-sales-confirm-refetched-real-qa.png')
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await context.close()
  }

  {
    const context = await browser.newContext({ viewport: { width: 1560, height: 1000 } })
    const page = await appPage(context, session)
    const detailUrl = `${RENDERER}/#/purchases/by-number?slipNo=${encodeURIComponent(inbound.slipNo)}`
    await page.goto(detailUrl, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: '입고전표 상세' })).toBeVisible({ timeout: 30_000 })
    events.inboundConfirm = await mutationReget(page, page.getByRole('button', { name: '완료 (확정)', exact: true }), `/slips/${inbound.id}/confirm`, detailUrl, inbound.slipNo, '07-inbound-confirm-refetched-real-qa.png')
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await context.close()
  }

  {
    const context = await browser.newContext({ viewport: { width: 1540, height: 1000 } })
    const page = await appPage(context, session)
    const detailUrl = `${RENDERER}/#/warehouse/audit/by-number?auditNo=${encodeURIComponent(audit.auditNo)}`
    await page.goto(detailUrl, { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('audit-detail-header')).toContainText(audit.auditNo, { timeout: 30_000 })

    await page.getByTestId('audit-line-barcode-input').fill('0000098')
    await page.getByTestId('audit-line-actual-input').fill(String(auditLine.expectedQty + 1))
    const codeResponse = page.waitForResponse((response) => response.url().includes(`/inventory/audits/${audit.id}/lines`) && response.request().method() === 'POST')
    await page.getByTestId('audit-line-record-button').click()
    expect((await codeResponse).status()).toBe(200)
    await expect(page.getByTestId('audit-detail-lines-table')).toContainText('+1')
    await page.screenshot({ path: path.join(SHOTS, '08-audit-product-code-0000098-real-qa.png'), fullPage: true })

    const uuidResult = await api(request, session, 'POST', `/inventory/audits/${audit.id}/lines`, { productId: uuidLine.productId, actualQty: uuidLine.expectedQty, scanned: false })
    expect(uuidResult.status, uuidResult.raw).toBe(200)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('audit-detail-lines-table')).toContainText('수동', { timeout: 30_000 })
    await page.screenshot({ path: path.join(SHOTS, '09-audit-existing-uuid-path-real-qa.png'), fullPage: true })

    await page.getByTestId('audit-line-barcode-input').fill(`PR1203-NOT-EXIST-${Date.now()}`)
    await page.getByTestId('audit-line-actual-input').fill('1')
    const missingResponse = page.waitForResponse((response) => response.url().includes(`/inventory/audits/${audit.id}/lines`) && response.request().method() === 'POST')
    await page.getByTestId('audit-line-record-button').click()
    const missing = await missingResponse
    expect([400, 404]).toContain(missing.status())
    await expect(page.getByRole('alert')).toContainText('존재하지 않는 품목코드:')
    await page.screenshot({ path: path.join(SHOTS, '10-audit-missing-product-code-rejected-real-qa.png'), fullPage: true })

    await page.reload({ waitUntil: 'domcontentloaded' })
    page.once('dialog', (dialog) => dialog.accept())
    events.auditComplete = await mutationReget(page, page.getByTestId('audit-complete-button') as any, `/inventory/audits/${audit.id}/complete`, detailUrl, audit.auditNo, '11-audit-complete-refetched-real-qa.png')
    events.auditInputs = { code: 200, uuid: uuidResult.status, missing: missing.status() }
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await context.close()
  }

  const ledger = await expectApi(request, session, 'GET', '/inventory/ledger?productCode=0000098&startDate=2026-05-14&endDate=2026-08-14')
  const transferLedger = ledger.rows.filter((row: any) => row.slipNo === transfer.transferNo)
  expect(transferLedger).toHaveLength(2)
  expect(transferLedger.map((row: any) => [row.slipType, row.inboundQuantity, row.outboundQuantity])).toEqual(expect.arrayContaining([
    ['STOCK_TRANSFER', 0, 1],
    ['STOCK_TRANSFER', 1, 0],
  ]))

  console.log(`PR1203_MUTATION_EVIDENCE=${JSON.stringify({
    created: { transferNo: transfer.transferNo, salesNo: outbound.slipNo, inboundNo: inbound.slipNo, auditNo: audit.auditNo },
    inventory: { beforeSource, afterSource, beforeDestination, afterDestination, totalDelta: (afterSource + afterDestination) - (beforeSource + beforeDestination) },
    transferLedger: transferLedger.map((row: any) => ({ slipType: row.slipType, inbound: row.inboundQuantity, outbound: row.outboundQuantity, warehouseName: row.warehouseName })),
    events,
  })}`)
  await browser.close()
})

test('실사 complete가 현재 공유 accounting 404로 막히는 사용자 화면을 캡처한다', async ({ request }) => {
  const session = await login(request)
  const browser = await chromium.launch({ executablePath: BROWSER, headless: true })
  const context = await browser.newContext({ viewport: { width: 1520, height: 1000 } })
  const page = await appPage(context, session)
  const auditNo = '2026/08/14-8'
  await page.goto(`${RENDERER}/#/warehouse/audit/by-number?auditNo=${encodeURIComponent(auditNo)}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('audit-detail-header')).toContainText(auditNo, { timeout: 30_000 })
  const lines = page.getByTestId('audit-detail-lines-table')
  await expect(lines).toContainText('실외기_3HP 다배관')
  await expect(lines).toContainText('한경희 선풍기')
  page.once('dialog', (dialog) => dialog.accept())
  const responsePromise = page.waitForResponse((response) => response.url().includes('/inventory/audits/') && response.url().endsWith('/complete') && response.request().method() === 'POST')
  await page.getByTestId('audit-complete-button').click()
  const response = await responsePromise
  const raw = await response.text()
  expect(response.status()).toBe(400)
  expect(raw).toContain('accounting-service 4xx: 404 NOT_FOUND')
  await expect(page.getByRole('alert')).toContainText('상태 변경에 실패했습니다.')
  expectNoUuid(page.url(), '실사 complete 실패 URL')
  await page.screenshot({ path: path.join(SHOTS, '11-audit-complete-accounting-404-real-qa.png'), fullPage: true })
  console.log(`PR1203_AUDIT_COMPLETE_FAILURE=${JSON.stringify({ auditNo, status: response.status(), body: JSON.parse(raw).message, userMessage: '상태 변경에 실패했습니다.' })}`)
  await page.unrouteAll({ behavior: 'ignoreErrors' })
  await context.close()
  await browser.close()
})
