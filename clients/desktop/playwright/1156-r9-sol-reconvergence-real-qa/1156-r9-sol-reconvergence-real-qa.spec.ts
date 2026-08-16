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
const TIMEOUT_SLIP_API = 'http://127.0.0.1:28207'
const ACCOUNTING_API = 'http://127.0.0.1:28208'
// product_db와 R9 inventory_db를 독립 SELECT해 교집합과 HQ-001 availableQty=13을 확인했다.
const PRODUCT_ID = '8011ee54-a0ad-4731-9173-d437d1e2c039'
const WAREHOUSE_ID = '11111111-1111-1111-1111-000000000001'
const dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = resolveQaShotsDir(path.resolve(dirname, '../../../../docs/qa/2026-08-10-1156-r9'))
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi

type Session = {
  token: string
  role: string
  userId: string
  displayName: string
  groups?: Array<{ id: string }>
}

type Partner = {
  partnerId: string
  partnerCode: string
  name: string
  bizNo?: string | null
}

type NetworkEvidence = {
  method: string
  status: number
  path: string
  destination: 'ACCOUNTING-28208' | 'SLIP-28206' | 'gateway-8080'
}

async function login(request: APIRequestContext, loginId: string, password: string): Promise<Session> {
  const response = await request.post(`${AUTH_API}/auth/login`, { data: { loginId, password } })
  const raw = await response.text()
  expect(response.status(), raw).toBe(200)
  return JSON.parse(raw).data as Session
}

function userHeaders(session: Session, actor = 'SOL 5.6 R9'): Record<string, string> {
  return {
    authorization: `Bearer ${session.token}`,
    'x-user-id': session.userId,
    'x-user-name': actor,
    'x-user-role': session.role,
    'x-user-groups': (session.groups ?? []).map((group) => group.id).join(','),
    'x-is-system-master': 'true',
  }
}

async function searchAllPartners(request: APIRequestContext, session: Session): Promise<Partner[]> {
  const response = await request.get(`${GATEWAY_API}/admin/partners/search?q=&size=10000`, {
    headers: userHeaders(session),
  })
  const raw = await response.text()
  expect(response.status(), raw).toBe(200)
  return JSON.parse(raw).data.items as Partner[]
}

async function ensureConfirmedOutbound(
  request: APIRequestContext,
  session: Session,
  inspector: Session,
  partner: Partner,
  memo: string,
  unitPrice: number,
): Promise<Record<string, any>> {
  const headers = userHeaders(session)
  const list = await request.get(`${SLIP_API}/slips?slipType=OUTBOUND&page=0&size=200`, { headers })
  expect(list.status()).toBe(200)
  let slip = ((await list.json()).data.content as Array<Record<string, any>>)
    .find((row) => row.memo === memo)

  if (!slip) {
    const created = await request.post(`${SLIP_API}/slips`, {
      headers,
      data: {
        slipType: 'OUTBOUND',
        sourceWarehouseId: WAREHOUSE_ID,
        partnerId: partner.partnerId,
        partnerName: partner.name,
        memo,
        lines: [{
          productId: PRODUCT_ID,
          productName: '한경희 선풍기',
          modelName: '0000098',
          quantity: 1,
          unitPrice,
        }],
      },
    })
    const raw = await created.text()
    expect(created.status(), raw).toBe(201)
    slip = JSON.parse(raw).data
  }

  const detail = await request.get(`${SLIP_API}/slips/${slip.id}`, { headers })
  expect(detail.status()).toBe(200)
  slip = (await detail.json()).data

  const actionByStatus: Record<string, string> = {
    DRAFT: 'save',
    SAVED: 'send',
    SENT: 'accept',
    ACCEPTED: 'process',
    PROCESSING: 'complete',
    INSPECTING: 'inspect',
    COMPLETED: 'ship',
    SHIPPING: 'deliver',
    DELIVERED: 'confirm',
  }
  while (slip.status !== 'CONFIRMED') {
    const action = actionByStatus[String(slip.status)]
    expect(action, `예상하지 못한 상태: ${slip.status}`).toBeTruthy()
    const response = await request.post(`${SLIP_API}/slips/${slip.id}/${action}`, {
      headers: action === 'inspect' ? userHeaders(inspector, 'SOL 5.6 R9 inspector') : headers,
    })
    const raw = await response.text()
    expect(response.ok(), `${action}: ${raw}`).toBeTruthy()
    slip = JSON.parse(raw).data
  }
  return slip
}

async function proxyApi(route: Route, session: Session, evidence: NetworkEvidence[]): Promise<void> {
  const incoming = route.request()
  const source = new URL(incoming.url())
  const isAccounting = source.pathname.startsWith('/accounting/hometax-export')
  const isSlip = source.pathname === '/slips' || source.pathname.startsWith('/slips/')
  const destination = isAccounting ? 'ACCOUNTING-28208' : isSlip ? 'SLIP-28206' : 'gateway-8080'
  const base = isAccounting ? ACCOUNTING_API : isSlip ? SLIP_API : GATEWAY_API
  const response = await route.fetch({
    url: `${base}${source.pathname}${source.search}`,
    headers: { ...incoming.headers(), ...userHeaders(session) },
  })
  if (isAccounting || isSlip || source.pathname === '/admin/partners/search') {
    evidence.push({
      method: incoming.method(),
      status: response.status(),
      path: source.pathname.replace(UUID_RE, '<redacted-uuid>'),
      destination,
    })
  }
  await route.fulfill({ response, body: await response.body() })
}

async function appPage(context: BrowserContext, session: Session, evidence: NetworkEvidence[]): Promise<Page> {
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

test('R9 홈택스 라이브: 사업자번호 정상/누락 표본을 CONFIRMED 후 preview와 xlsx로 확인한다', async ({ browser, request }) => {
  let password: string
  let inspectorPassword: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
    inspectorPassword = resolveQaCredential('QA_MASTER_PASSWORD')
  } catch {
    test.skip(true, 'R9 라이브 QA 자격을 해소할 수 없습니다.')
    throw new Error('unreachable after test.skip')
  }

  fs.mkdirSync(SHOTS, { recursive: true })
  const session = await login(request, 'dev_master', password)
  const inspector = await login(request, 'kimeunji', inspectorPassword)
  const partners = await searchAllPartners(request, session)
  const withBusinessNumber = partners.find((partner) => partner.name === '(주)서울에어컨')
  const withoutBusinessNumber = partners.find((partner) => partner.name === '이상덕기사님(경기퀵)')
  expect(withBusinessNumber).toBeTruthy()
  expect(withoutBusinessNumber).toBeTruthy()
  expect(withBusinessNumber!.bizNo).toBe('113-07-10031')
  expect(String(withoutBusinessNumber!.bizNo ?? '').replace(/[-\s]/g, '')).toBe('')

  const normal = await ensureConfirmedOutbound(
    request, session, inspector, withBusinessNumber!,
    'R9 HOMETAX business number live v2', 909,
  )
  const missing = await ensureConfirmedOutbound(
    request, session, inspector, withoutBusinessNumber!,
    'R9 HOMETAX missing business number RED-B1 v2', 919,
  )

  const salesQuery = await request.get(
    `${SLIP_API}/internal/slips/sales-query?from=2026-08-10&to=2026-08-10&page=0&size=200`,
    { headers: { 'X-Internal-Token': 'CHANGE_ME_LOCAL_ONLY' } },
  )
  expect(salesQuery.status()).toBe(200)
  const salesRows = (await salesQuery.json()).data.content as Array<Record<string, any>>
  const normalSource = salesRows.find((row) => row.slipNo === normal.slipNo)
  const missingSource = salesRows.find((row) => row.slipNo === missing.slipNo)
  expect(normalSource).toBeTruthy()
  expect(missingSource).toBeTruthy()

  const preview = await request.post(`${ACCOUNTING_API}/accounting/hometax-export/preview`, {
    headers: userHeaders(session),
    data: {
      fromDate: '2026-08-10',
      toDate: '2026-08-10',
      excludeUnconfirmed: false,
      excludePartnerCodes: [],
    },
  })
  const previewRaw = await preview.text()
  expect(preview.status(), previewRaw).toBe(200)
  const previewData = JSON.parse(previewRaw).data as Record<string, any>
  const normalPreview = (previewData.rows as Array<Record<string, any>>).find((row) => row.slipNo === normal.slipNo)
  const missingPreview = (previewData.rows as Array<Record<string, any>>).find((row) => row.slipNo === missing.slipNo)
  expect(normalPreview).toBeTruthy()
  expect(missingPreview).toBeTruthy()
  expect(normalPreview!.buyerRegNo).toBe('1130710031')
  expect(missingPreview!.buyerRegNo).toBe('')
  expect(missingPreview!.buyerRegNo).not.toMatch(/\d/)

  const evidence: NetworkEvidence[] = []
  const context = await browser.newContext({ acceptDownloads: true })
  const page = await appPage(context, session, evidence)
  await page.goto(`${RENDERER}/#/accounting/hometax-export`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: /홈택스/ }).first()).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('hometax-export-tab-preview').click()
  await page.getByTestId('batch-preview-from').fill('2026-08-10')
  await page.getByTestId('batch-preview-to').fill('2026-08-10')
  const uiPreviewPromise = page.waitForResponse((response) =>
    response.request().method() === 'POST'
      && new URL(response.url()).pathname === '/accounting/hometax-export/preview',
  )
  await page.getByTestId('batch-preview-execute').click()
  const uiPreviewResponse = await uiPreviewPromise
  const uiPreview = (await uiPreviewResponse.json()).data as Record<string, any>
  await expect(page.getByTestId('batch-result-table')).toBeVisible({ timeout: 60_000 })

  const normalUiRaw = (uiPreview.rows as Array<Record<string, any>>).find((row) => row.slipNo === normal.slipNo)
  const missingUiRaw = (uiPreview.rows as Array<Record<string, any>>).find((row) => row.slipNo === missing.slipNo)
  expect(normalUiRaw?.buyerRegNo).toBe('1130710031')
  expect(missingUiRaw?.buyerRegNo).toBe('')

  const normalTr = page.getByTestId('batch-result-table').locator('tbody tr').filter({ hasText: normal.slipNo }).first()
  const missingTr = page.getByTestId('batch-result-table').locator('tbody tr').filter({ hasText: missing.slipNo }).first()
  await expect(normalTr).toBeVisible()
  await expect(missingTr).toBeVisible()
  const normalCells = await normalTr.locator('td').allTextContents()
  const missingCells = await missingTr.locator('td').allTextContents()
  await page.screenshot({ path: path.join(SHOTS, '01-hometax-live-result.png'), fullPage: true })

  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('batch-result-download-0').click()
  const download = await downloadPromise
  const xlsxPath = path.join(SHOTS, 'r9-hometax-live.xlsx')
  await download.saveAs(xlsxPath)

  fs.writeFileSync(path.join(SHOTS, 'r9-hometax-live-evidence.json'), JSON.stringify({
    round: 'R9',
    deployment: {
      gitHead: '19d7fe34b518925436e81c5986a3821d10008ac2',
      accountingApi: '127.0.0.1:28208',
      slipApi: '127.0.0.1:28206',
      renderer: '127.0.0.1:5330',
    },
    samples: [
      {
        slipNo: normal.slipNo,
        status: normal.status,
        partnerName: normalSource!.partnerName,
        partnerCode: normalSource!.partnerCode,
        businessNumber: normalSource!.businessNumber,
        buyerRegNo: normalPreview!.buyerRegNo,
      },
      {
        slipNo: missing.slipNo,
        status: missing.status,
        partnerName: missingSource!.partnerName,
        partnerCode: missingSource!.partnerCode,
        businessNumber: missingSource!.businessNumber,
        buyerRegNo: missingPreview!.buyerRegNo,
      },
    ],
    liveCalls: {
      salesQuery: { status: salesQuery.status(), path: '/internal/slips/sales-query', mock: false },
      directPreview: { status: preview.status(), path: '/accounting/hometax-export/preview', mock: false },
      rendererNetwork: evidence,
    },
    uiCells: {
      normal: normalCells,
      missing: missingCells,
    },
    ids: '<redacted-uuid>',
    credentials: '<redacted>',
  }, null, 2), 'utf8')
  await context.close()
})

test('R9 타입 경계 라이브: 입출금·현금영수증 화면이 열리고 실제 API 경계 값을 보존한다', async ({ browser, request }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch {
    test.skip(true, 'R9 라이브 QA 자격을 해소할 수 없습니다.')
    throw new Error('unreachable after test.skip')
  }

  fs.mkdirSync(SHOTS, { recursive: true })
  const session = await login(request, 'dev_master', password)
  const evidence: NetworkEvidence[] = []
  const context = await browser.newContext()
  const page = await appPage(context, session, evidence)

  await page.goto(`${RENDERER}/#/accounting/bank-transactions`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '입출금 내역', exact: true })).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: path.join(SHOTS, '02-bank-transactions-live.png'), fullPage: true })

  const bankResponse = await request.get(`${GATEWAY_API}/accounting/bank-transactions`, {
    headers: userHeaders(session),
  })
  const bankRaw = await bankResponse.text()
  expect(bankResponse.ok(), bankRaw).toBeTruthy()
  const bankBody = JSON.parse(bankRaw)
  const bankRows = (Array.isArray(bankBody.data) ? bankBody.data : bankBody.data?.content ?? []) as Array<Record<string, any>>
  const bankFallbackCandidates = bankRows.filter((row) =>
    !row.matchedPartnerCode && Boolean(row.matchedPartnerName || row.matchedBizNo),
  )

  await page.goto(`${RENDERER}/#/accounting/admin/cash-receipts`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('cash-receipt-list-page')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('cash-receipt-list-table')).toBeVisible()

  const cashResponse = await request.get(`${GATEWAY_API}/accounting/cash-receipts?page=0&size=100`, {
    headers: userHeaders(session),
  })
  const cashRaw = await cashResponse.text()
  expect(cashResponse.ok(), cashRaw).toBeTruthy()
  const cashRows = (JSON.parse(cashRaw).data?.content ?? []) as Array<Record<string, any>>
  const cashFallbackCandidates = cashRows.filter((row) =>
    !row.partnerCode && Boolean(row.partnerName || row.bizNo),
  )
  if (cashRows.length > 0) {
    await expect(page.getByTestId(`cash-receipt-slip-${cashRows[0]!.slipNo}`)).toBeVisible({ timeout: 30_000 })
  }
  await page.screenshot({ path: path.join(SHOTS, '03-cash-receipts-live.png'), fullPage: true })

  if (cashRows.length > 0) {
    await page.getByTestId(`cash-receipt-slip-${cashRows[0]!.slipNo}`).click()
    await expect(page.getByText(cashRows[0]!.partnerName, { exact: true }).first()).toBeVisible({ timeout: 30_000 })
    if (cashRows[0]!.partnerCode) {
      await expect(page.getByText(cashRows[0]!.partnerCode, { exact: true }).first()).toBeVisible()
    }
    if (cashRows[0]!.bizNo) {
      await expect(page.getByText(cashRows[0]!.bizNo, { exact: true }).first()).toBeVisible()
    }
    await page.screenshot({ path: path.join(SHOTS, '04-cash-receipt-detail-values.png'), fullPage: true })
  }

  fs.writeFileSync(path.join(SHOTS, 'r9-type-boundary-evidence.json'), JSON.stringify({
    round: 'R9',
    runtimeCastContract: {
      inputPartnerCode: 'P-2026-0001',
      outputPartnerCode: 'P-2026-0001',
      inputBusinessNumber: '113-07-10031',
      outputBusinessNumber: '113-07-10031',
      note: 'asPartnerCode/asBusinessNumber are TypeScript casts only; validation=false',
    },
    bankTransactions: {
      status: bankResponse.status(),
      rowCount: bankRows.length,
      fallbackCandidateCount: bankFallbackCandidates.length,
      candidates: bankFallbackCandidates.slice(0, 20).map((row) => ({
        matchedPartnerCode: row.matchedPartnerCode ?? '',
        matchedPartnerName: row.matchedPartnerName ?? '',
        matchedBizNo: row.matchedBizNo ?? '',
      })),
    },
    cashReceipts: {
      status: cashResponse.status(),
      rowCount: cashRows.length,
      fallbackCandidateCount: cashFallbackCandidates.length,
      firstDisplayedValue: cashRows.length > 0 ? {
        slipNo: cashRows[0]!.slipNo,
        partnerCode: cashRows[0]!.partnerCode ?? '',
        partnerName: cashRows[0]!.partnerName ?? '',
        bizNo: cashRows[0]!.bizNo ?? '',
      } : null,
      candidates: cashFallbackCandidates.slice(0, 20).map((row) => ({
        slipNo: row.slipNo,
        partnerCode: row.partnerCode ?? '',
        partnerName: row.partnerName ?? '',
        bizNo: row.bizNo ?? '',
      })),
    },
    rendererNetwork: evidence,
    ids: '<redacted-uuid>',
    credentials: '<redacted>',
  }, null, 2), 'utf8')
  await context.close()
})

test('R9 R2·R3·R6·R7 backend 실 HTTP 회귀', async ({ request }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch {
    test.skip(true, 'R9 라이브 QA 자격을 해소할 수 없습니다.')
    throw new Error('unreachable after test.skip')
  }

  fs.mkdirSync(SHOTS, { recursive: true })
  const session = await login(request, 'dev_master', password)
  const headers = userHeaders(session)
  const partners = await searchAllPartners(request, session)
  const partnerA = partners.find((partner) => partner.name === '파인씨엔디')
  const partnerB = partners.find((partner) => partner.name === '(주)서울에어컨')
  expect(partnerA).toBeTruthy()
  expect(partnerB).toBeTruthy()

  const body = (memo: string) => ({
    slipType: 'INBOUND',
    destinationWarehouseId: WAREHOUSE_ID,
    partnerId: partnerA!.partnerId,
    partnerName: partnerA!.name,
    memo,
    lines: [{
      productId: PRODUCT_ID,
      productName: '한경희 선풍기',
      modelName: '0000098',
      quantity: 1,
      unitPrice: 929,
    }],
  })

  const call = async (
    method: 'get' | 'post' | 'patch',
    url: string,
    data?: Record<string, unknown>,
  ): Promise<{ status: number; elapsedMs: number; data: Record<string, any> }> => {
    const started = Date.now()
    const response = await request[method](url, { headers, data })
    const raw = await response.text()
    expect(response.ok(), `${method.toUpperCase()} ${new URL(url).pathname}: ${raw}`).toBeTruthy()
    return { status: response.status(), elapsedMs: Date.now() - started, data: raw ? JSON.parse(raw).data : {} }
  }

  const mutation = await call('post', `${SLIP_API}/slips`, body('R9 BACKEND partner mutation regression'))
  expect(mutation.status).toBe(201)
  expect(mutation.data.partnerCode).toBe('00')
  const same = await call('patch', `${SLIP_API}/slips/${mutation.data.id}/v20`, {
    partnerId: partnerA!.partnerId,
    projectName: 'R9 same partner resend',
  })
  expect(same.data.partnerCode).toBe('00')
  const omitted = await call('patch', `${SLIP_API}/slips/${mutation.data.id}/v20`, {
    projectName: 'R9 partner omitted',
  })
  expect(omitted.data.partnerCode).toBe('00')
  const changed = await call('patch', `${SLIP_API}/slips/${mutation.data.id}/v20`, {
    partnerId: partnerB!.partnerId,
    projectName: 'R9 A to B',
  })
  expect(changed.data.partnerCode).toBe('P-2026-0001')

  const timeout = await call('post', `${TIMEOUT_SLIP_API}/slips`, body('R9 TIMEOUT SEND CONFIRM fail-open'))
  expect(timeout.data.partnerCode ?? null).toBeNull()
  const lifecycle: Array<Record<string, unknown>> = []
  for (const action of ['save', 'send', 'accept', 'process', 'complete', 'inspect', 'confirm']) {
    const result = await call('post', `${TIMEOUT_SLIP_API}/slips/${timeout.data.id}/${action}`)
    lifecycle.push({
      action,
      status: result.status,
      elapsedMs: result.elapsedMs,
      state: result.data.status,
      partnerCode: result.data.partnerCode ?? null,
    })
  }
  expect(lifecycle.find((row) => row.action === 'send')?.state).toBe('SENT')
  expect(lifecycle.find((row) => row.action === 'confirm')?.state).toBe('CONFIRMED')

  const backfill = await call('post', `${TIMEOUT_SLIP_API}/slips`, body('R9 DRAFT TO SENT partnerCode backfill'))
  expect(backfill.data.partnerCode ?? null).toBeNull()
  await call('post', `${TIMEOUT_SLIP_API}/slips/${backfill.data.id}/save`)
  const sent = await call('post', `${SLIP_API}/slips/${backfill.data.id}/send`)
  expect(sent.data.status).toBe('SENT')
  expect(sent.data.partnerCode).toBe('00')

  fs.writeFileSync(path.join(SHOTS, 'r9-backend-regression-evidence.json'), JSON.stringify({
    round: 'R9',
    mutation: {
      slipNo: mutation.data.slipNo,
      create: { status: mutation.status, partnerCode: mutation.data.partnerCode },
      samePartner: { status: same.status, partnerCode: same.data.partnerCode },
      partnerOmitted: { status: omitted.status, partnerCode: omitted.data.partnerCode },
      partnerChanged: { status: changed.status, partnerCode: changed.data.partnerCode },
    },
    timeout: { slipNo: timeout.data.slipNo, lifecycle },
    backfill: { slipNo: backfill.data.slipNo, status: sent.data.status, partnerCode: sent.data.partnerCode },
    endpoints: { head: '127.0.0.1:28206', lookupTimeout: '127.0.0.1:28207' },
    ids: '<redacted-uuid>',
    credentials: '<redacted>',
  }, null, 2), 'utf8')
})

test('R9 GUI 생성·거래처 변경·상세·매입 인쇄가 두 식별자를 분리 보존한다', async ({ browser, request }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch {
    test.skip(true, 'R9 라이브 QA 자격을 해소할 수 없습니다.')
    throw new Error('unreachable after test.skip')
  }

  fs.mkdirSync(SHOTS, { recursive: true })
  const session = await login(request, 'dev_master', password)
  const headers = userHeaders(session)
  const evidence: NetworkEvidence[] = []
  const context = await browser.newContext()
  const page = await appPage(context, session, evidence)

  const listed = await request.get(`${SLIP_API}/slips?slipType=INBOUND&status=DRAFT&page=0&size=200`, { headers })
  expect(listed.status()).toBe(200)
  let created = ((await listed.json()).data.content as Array<Record<string, any>>)
    .find((row) => row.memo === 'R9 GUI persistence partnerCode businessNumber')

  if (!created) {
    await page.goto(`${RENDERER}/#/purchases/new`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: '새 입고전표' }).first()).toBeVisible({ timeout: 30_000 })
    const warehouse = page.getByRole('combobox', { name: '입고 창고' })
    await warehouse.fill('HQ-001')
    await warehouse.press('ArrowDown')
    await warehouse.press('Enter')

    const createPartner = page.getByRole('combobox', { name: '거래처', exact: true })
    await createPartner.fill('파인씨엔디')
    const createOption = page.getByRole('listbox', { name: '거래처 목록' })
      .getByRole('option').filter({ hasText: '파인씨엔디' })
    await expect(createOption).toBeVisible({ timeout: 15_000 })
    await createOption.click()

    const product = page.getByRole('combobox', { name: '라인 1 품목' })
    await product.fill('AJ060MXHNBC1')
    await page.waitForTimeout(1_000)
    await expect(product).toHaveValue('AJ060MXHNBC1', { timeout: 15_000 })
    await expect(page.getByText('실외기_6HP 단배관', { exact: true }).first()).toBeVisible({ timeout: 15_000 })
    await page.getByLabel('메모').fill('R9 GUI persistence partnerCode businessNumber')

    const createPromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname === '/slips' && response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: '저장', exact: true }).click()
    const response = await createPromise
    const raw = await response.text()
    expect(response.status(), raw).toBe(201)
    created = JSON.parse(raw).data
  }

  const slipId = String(created.id)
  await page.goto(`${RENDERER}/#/purchases/${slipId}`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('purchase-slip-edit-open').click()
  await expect(page.getByTestId('purchase-slip-edit-modal')).toBeVisible({ timeout: 30_000 })
  const editPartner = page.getByTestId('slip-coedit-field-header-partnerName')
  await editPartner.fill('서울에어컨')
  const editOption = page.getByRole('listbox', { name: '거래처 목록' })
    .getByRole('option').filter({ hasText: '(주)서울에어컨' })
  await expect(editOption).toBeVisible({ timeout: 15_000 })
  await editOption.click()

  let requestPayload: Record<string, any> | undefined
  page.on('request', (outgoing) => {
    if (outgoing.method() === 'PUT' && new URL(outgoing.url()).pathname === `/slips/${slipId}`) {
      requestPayload = outgoing.postDataJSON() as Record<string, any>
    }
  })
  const updatePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname === `/slips/${slipId}` && response.request().method() === 'PUT',
  )
  await page.getByTestId('purchase-slip-edit-submit').click()
  const updateResponse = await updatePromise
  const updateRaw = await updateResponse.text()
  expect(updateResponse.status(), updateRaw).toBe(200)
  const updated = JSON.parse(updateRaw).data as Record<string, any>
  expect(requestPayload?.partnerCode).toBe('P-2026-0001')
  expect(requestPayload?.businessNumber).toBe('113-07-10031')
  expect(updated.partnerCode).toBe('P-2026-0001')
  expect(updated.businessNumber).toBe('113-07-10031')

  await page.goto(`${RENDERER}/#/purchases/${slipId}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('slip-detail-business-number')).toContainText('113-07-10031', { timeout: 30_000 })
  await page.screenshot({ path: path.join(SHOTS, '05-gui-detail-identities.png'), fullPage: true })
  await page.getByTestId('purchase-slip-print-button').click()
  await expect(page).toHaveURL(new RegExp(`/purchases/${slipId}/print/purchase$`), { timeout: 30_000 })
  await expect(page.getByText('113-07-10031', { exact: true })).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: path.join(SHOTS, '06-purchase-print-business-number.png'), fullPage: true })

  fs.writeFileSync(path.join(SHOTS, 'r9-gui-persistence-evidence.json'), JSON.stringify({
    round: 'R9',
    slipNo: updated.slipNo,
    memo: updated.memo,
    requestPartnerCode: requestPayload?.partnerCode,
    requestBusinessNumber: requestPayload?.businessNumber,
    responsePartnerCode: updated.partnerCode,
    responseBusinessNumber: updated.businessNumber,
    network: evidence,
    ids: '<redacted-uuid>',
    credentials: '<redacted>',
  }, null, 2), 'utf8')
  await page.unrouteAll({ behavior: 'ignoreErrors' })
  await context.close()
})

test('R9 기존 견적 변환 결과를 실 renderer와 HEAD API에서 읽는다', async ({ browser, request }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch {
    test.skip(true, 'R9 라이브 QA 자격을 해소할 수 없습니다.')
    throw new Error('unreachable after test.skip')
  }

  fs.mkdirSync(SHOTS, { recursive: true })
  const session = await login(request, 'dev_master', password)
  const headers = userHeaders(session)
  const listed = await request.get(`${SLIP_API}/slips/estimates?startDate=2026-08-10&endDate=2026-08-10&page=0&size=1000`, { headers })
  const listedRaw = await listed.text()
  expect(listed.status(), listedRaw).toBe(200)
  const estimate = (JSON.parse(listedRaw).data.content as Array<Record<string, any>>)
    .find((row) => row.estimateNo === '2026/08/10-5')
  expect(estimate, 'R7 HEAD 견적 변환 표본이 목록에 있어야 한다').toBeTruthy()
  expect(estimate.convertedSlipId).toBeTruthy()

  const detailResponse = await request.get(`${SLIP_API}/slips/${String(estimate.convertedSlipId)}`, { headers })
  const detailRaw = await detailResponse.text()
  expect(detailResponse.status(), detailRaw).toBe(200)
  const detail = JSON.parse(detailRaw).data as Record<string, any>
  expect(detail.partnerCode).toBe('P-2026-0001')
  expect(detail.businessNumber).toBe('113-07-10031')

  const evidence: NetworkEvidence[] = []
  const context = await browser.newContext()
  const page = await appPage(context, session, evidence)
  await page.goto(`${RENDERER}/#/sales/estimates/${String(estimate.id)}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('(113-07-10031)', { exact: true })).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: path.join(SHOTS, '07-estimate-conversion-readonly.png'), fullPage: true })

  fs.writeFileSync(path.join(SHOTS, 'r9-estimate-conversion-readonly-evidence.json'), JSON.stringify({
    round: 'R9',
    mode: 'read-only',
    estimateNo: estimate.estimateNo,
    convertedSlipNo: detail.slipNo,
    partnerCode: detail.partnerCode,
    businessNumber: detail.businessNumber,
    endpoints: { renderer: '127.0.0.1:5330', slip: '127.0.0.1:28206' },
    ids: '<redacted-uuid>',
    credentials: '<redacted>',
  }, null, 2), 'utf8')

  await page.unrouteAll({ behavior: 'ignoreErrors' })
  await context.close()
})
