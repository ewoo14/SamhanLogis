import { expect, test, type APIRequestContext, type BrowserContext, type Page, type Route } from '@playwright/test'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const RENDERER = 'http://127.0.0.1:5330'
const AUTH_API = 'http://127.0.0.1:8081'
const SLIP_API = 'http://127.0.0.1:28206'
const dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = resolveQaShotsDir(path.resolve(dirname, '../../../../docs/qa/2026-08-09-1156-r7'))
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi

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
  destination: 'SLIP-28206' | 'gateway-8080'
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
    'x-user-name': 'SOL 5.6 R7',
    'x-user-role': session.role,
    'x-user-groups': (session.groups ?? []).map((group) => group.id).join(','),
    'x-is-system-master': 'true',
  }
}

async function proxyApi(route: Route, session: Login, evidence: NetworkEvidence[]): Promise<void> {
  const incoming = route.request()
  const source = new URL(incoming.url())
  const useSlipApi = source.pathname === '/slips' || source.pathname.startsWith('/slips/')
  const target = useSlipApi ? `${SLIP_API}${source.pathname}${source.search}` : source.href
  const response = await route.fetch({
    url: target,
    headers: { ...incoming.headers(), ...userHeaders(session) },
  })
  if (useSlipApi || source.pathname === '/admin/partners/search') {
    evidence.push({
      method: incoming.method(),
      status: response.status(),
      path: source.pathname.replace(UUID_RE, '<redacted-uuid>'),
      destination: useSlipApi ? 'SLIP-28206' : 'gateway-8080',
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

test('R7 실 관리자 GUI 신규 INBOUND 생성 후 거래처 변경 저장이 partnerCode를 DB 경계까지 보존한다', async ({ browser, request }) => {
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
  const authHeaders = userHeaders(session)
  const context = await browser.newContext()
  const page = await appPage(context, session, evidence)

  const existingResponse = await request.get(
    `${SLIP_API}/slips?slipType=INBOUND&status=DRAFT&page=0&size=100`,
    { headers: authHeaders },
  )
  expect(existingResponse.status()).toBe(200)
  const existingRows = (await existingResponse.json()).data.content as Array<Record<string, unknown>>
  let created = existingRows.find((row) => row.memo === 'R7 GUI persistence HEAD partnerCode axis')
  let createHttpStatus: number | 'existing-r7-sample' = 'existing-r7-sample'

  if (!created) {
    await page.goto(`${RENDERER}/#/purchases/new`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: '새 입고전표' }).first()).toBeVisible({ timeout: 30_000 })

    const warehouse = page.getByRole('combobox', { name: '입고 창고' })
    await warehouse.fill('HQ-001')
    await warehouse.press('ArrowDown')
    await warehouse.press('Enter')

    const createPartner = page.getByRole('combobox', { name: '거래처', exact: true })
    await createPartner.fill('파인씨엔디')
    const createPartnerOption = page.getByRole('listbox', { name: '거래처 목록' })
      .getByRole('option')
      .filter({ hasText: '파인씨엔디' })
    await expect(createPartnerOption).toBeVisible({ timeout: 15_000 })
    await createPartnerOption.click()

    const product = page.getByRole('combobox', { name: '라인 1 품목' })
    await product.fill('AJ060MXHNBC1')
    await page.waitForTimeout(1_000)
    await expect(product).toHaveValue('AJ060MXHNBC1', { timeout: 15_000 })
    await expect(page.getByText('실외기_6HP 단배관', { exact: true }).first()).toBeVisible({ timeout: 15_000 })
    await page.getByLabel('메모').fill('R7 GUI persistence HEAD partnerCode axis')
    const createSave = page.getByRole('button', { name: '저장', exact: true })
    await expect(createSave).toBeEnabled({ timeout: 30_000 })
    await page.screenshot({ path: path.join(SHOTS, '01-r7-create-before-save.png'), fullPage: true })

    const createResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return url.pathname === '/slips' && response.request().method() === 'POST'
    })
    await createSave.click()
    const createResponse = await createResponsePromise
    expect(createResponse.status(), await createResponse.text()).toBe(201)
    createHttpStatus = createResponse.status()
    created = (await createResponse.json()).data as Record<string, unknown>
  } else {
    await page.goto(`${RENDERER}/#/purchases/${String(created.id)}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('purchase-slip-edit-open')).toBeVisible({ timeout: 30_000 })
    await page.screenshot({ path: path.join(SHOTS, '01-r7-created-sample.png'), fullPage: true })
  }

  expect(created).toBeTruthy()
  const slipId = String(created.id)
  const initialPartnerCode = created.partnerCode ?? null

  await page.goto(`${RENDERER}/#/purchases/${slipId}`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('purchase-slip-edit-open').click()
  await expect(page.getByTestId('purchase-slip-edit-modal')).toBeVisible({ timeout: 30_000 })
  const editPartner = page.getByTestId('slip-coedit-field-header-partnerName')
  await editPartner.fill('서울에어컨')
  const editPartnerOption = page.getByRole('listbox', { name: '거래처 목록' })
    .getByRole('option')
    .filter({ hasText: '(주)서울에어컨' })
  await expect(editPartnerOption).toBeVisible({ timeout: 15_000 })
  await editPartnerOption.click()
  await expect(editPartner).toHaveValue('(주)서울에어컨', { timeout: 15_000 })
  await page.screenshot({ path: path.join(SHOTS, '02-r7-edit-before-save.png'), fullPage: true })

  let requestPayload: Record<string, unknown> | undefined
  page.on('request', (outgoing) => {
    if (outgoing.method() === 'PUT' && new URL(outgoing.url()).pathname === `/slips/${slipId}`) {
      requestPayload = outgoing.postDataJSON() as Record<string, unknown>
    }
  })
  const updateResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname === `/slips/${slipId}` && response.request().method() === 'PUT'
  })
  await page.getByTestId('purchase-slip-edit-submit').click()
  const updateResponse = await updateResponsePromise
  expect(updateResponse.status(), await updateResponse.text()).toBe(200)
  const updated = (await updateResponse.json()).data as Record<string, unknown>
  expect(requestPayload?.partnerCode).toBe('P-2026-0001')
  expect(requestPayload?.businessNumber).toBe('113-07-10031')
  expect(updated.partnerCode).toBe('P-2026-0001')
  expect(updated.businessNumber).toBe('113-07-10031')
  const updateErrorClose = page.getByRole('button', { name: '닫기', exact: true })
  if (await updateErrorClose.isVisible()) await updateErrorClose.click()
  await page.screenshot({ path: path.join(SHOTS, '03-r7-edit-after-save.png'), fullPage: true })

  fs.writeFileSync(path.join(SHOTS, 'r7-gui-persistence-evidence.json'), JSON.stringify({
    round: 'R7',
    renderer: 'renderer-5330',
    createHttpStatus,
    initialPartnerCode,
    putHttpStatus: updateResponse.status(),
    slipNo: updated.slipNo,
    slipId: '<redacted-uuid>',
    memo: updated.memo,
    selectedPartnerName: updated.partnerName,
    requestPartnerCode: requestPayload?.partnerCode,
    requestBusinessNumber: requestPayload?.businessNumber,
    responsePartnerCode: updated.partnerCode,
    responseBusinessNumber: updated.businessNumber,
    network: evidence,
  }, null, 2), 'utf8')

  await page.unrouteAll({ behavior: 'ignoreErrors' })
  await context.close()
})

test('R7 매입 상세와 인쇄물에 사업자번호가 표시된다', async ({ browser, request }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch {
    test.skip(true, 'QA_DEV_DEFAULT_PASSWORD를 해소할 수 없어 라이브 QA를 건너뜁니다.')
    throw new Error('unreachable after test.skip')
  }

  const session = await login(request, password)
  const listed = await request.get(
    `${SLIP_API}/slips?slipType=INBOUND&status=DRAFT&page=0&size=100`,
    { headers: userHeaders(session) },
  )
  expect(listed.status()).toBe(200)
  const row = ((await listed.json()).data.content as Array<Record<string, unknown>>)
    .find((candidate) => candidate.memo === 'R7 GUI persistence HEAD partnerCode axis')
  expect(row).toBeTruthy()

  const evidence: NetworkEvidence[] = []
  const context = await browser.newContext()
  const page = await appPage(context, session, evidence)
  await page.goto(`${RENDERER}/#/purchases/${String(row!.id)}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('slip-detail-business-number')).toContainText('113-07-10031', { timeout: 30_000 })
  const detailErrorClose = page.getByRole('button', { name: '닫기', exact: true })
  if (await detailErrorClose.isVisible()) await detailErrorClose.click()
  await page.screenshot({ path: path.join(SHOTS, '04-r7-detail-business-number.png'), fullPage: true })

  await page.getByTestId('purchase-slip-print-button').click()
  await expect(page).toHaveURL(new RegExp(`/purchases/${String(row!.id)}/print/purchase$`), { timeout: 30_000 })
  await expect(page.getByText('113-07-10031', { exact: true })).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: path.join(SHOTS, '05-r7-purchase-print-business-number.png'), fullPage: true })

  await page.unrouteAll({ behavior: 'ignoreErrors' })
  await context.close()
})

test('R7 견적 변환 전표에 거래처코드와 사업자번호가 함께 승계된다', async ({ browser, request }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch {
    test.skip(true, 'QA_DEV_DEFAULT_PASSWORD를 해소할 수 없어 라이브 QA를 건너뜁니다.')
    throw new Error('unreachable after test.skip')
  }

  const session = await login(request, password)
  const authHeaders = userHeaders(session)
  const evidence: NetworkEvidence[] = []
  const context = await browser.newContext()
  const page = await appPage(context, session, evidence)
  page.on('dialog', (dialog) => dialog.accept())
  const listed = await request.get(`${SLIP_API}/slips/estimates?page=0&size=100`, { headers: authHeaders })
  expect(listed.status()).toBe(200)
  const existing = ((await listed.json()).data.content as Array<Record<string, unknown>>)
    .find((row) => row.memo === 'R7 GUI estimate conversion HEAD')
  let estimateId = existing ? String(existing.id) : ''
  let estimateNo = existing?.estimateNo
  let convertedSlipId = existing?.convertedSlipId ? String(existing.convertedSlipId) : ''
  let createEstimateHttpStatus: number | 'existing-r7-sample' = 'existing-r7-sample'
  let convertHttpStatus: number | 'existing-r7-conversion' = 'existing-r7-conversion'

  if (!existing) {
    await page.goto(`${RENDERER}/#/sales/estimates/new`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('estimate-form-line-0')).toBeVisible({ timeout: 30_000 })
    const partner = page.getByRole('combobox', { name: '거래처 검색' })
    await partner.fill('서울에어컨')
    const partnerOption = page.getByRole('listbox', { name: '거래처 목록' })
      .getByRole('option')
      .filter({ hasText: '(주)서울에어컨' })
    await expect(partnerOption).toBeVisible({ timeout: 15_000 })
    await partnerOption.click()
    await expect(page.getByTestId('estimate-form-partner-business-no')).toHaveValue('113-07-10031')

    const model = page.getByTestId('estimate-form-line-0').getByRole('combobox', { name: '라인 1 모델명' })
    await model.fill('AJ060MXHNBC1')
    await page.waitForTimeout(1_000)
    await expect(model).toHaveValue('AJ060MXHNBC1', { timeout: 15_000 })
    await expect(page.getByRole('textbox', { name: '라인 1 품목명' })).toHaveValue('실외기_6HP 단배관')
    await page.getByLabel('비고').fill('R7 GUI estimate conversion HEAD')
    await page.screenshot({ path: path.join(SHOTS, '06-r7-estimate-form-before-save.png'), fullPage: true })

    const createPromise = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return url.pathname === '/slips/estimates' && response.request().method() === 'POST'
    })
    await page.getByRole('button', { name: '임시저장' }).click()
    const created = await createPromise
    expect(created.status(), await created.text()).toBe(201)
    const createdBody = await created.json()
    estimateId = String(createdBody.data.id)
    estimateNo = createdBody.data.estimateNo
    createEstimateHttpStatus = created.status()
  }

  await page.goto(`${RENDERER}/#/sales/estimates/${estimateId}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('(113-07-10031)', { exact: true })).toBeVisible({ timeout: 30_000 })
  if (!convertedSlipId) {
    await expect(page.getByTestId('estimate-detail-convert-button')).toBeVisible({ timeout: 30_000 })
    await page.screenshot({ path: path.join(SHOTS, '06-r7-estimate-before-convert.png'), fullPage: true })
    const convertedPromise = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return url.pathname.endsWith(`/slips/estimates/${estimateId}/convert`)
        && response.request().method() === 'POST'
    })
    await page.getByTestId('estimate-detail-convert-button').click()
    const converted = await convertedPromise
    expect(converted.status(), await converted.text()).toBe(200)
    const convertedBody = await converted.json()
    convertedSlipId = String(convertedBody.data.convertedSlipId)
    convertHttpStatus = converted.status()
  }
  const detailResponse = await request.get(`${SLIP_API}/slips/${convertedSlipId}`, { headers: authHeaders })
  expect(detailResponse.status()).toBe(200)
  const detail = (await detailResponse.json()).data as Record<string, unknown>
  expect(detail.partnerCode).toBe('P-2026-0001')
  expect(detail.businessNumber).toBe('113-07-10031')
  await page.screenshot({ path: path.join(SHOTS, '07-r7-estimate-after-convert.png'), fullPage: true })

  fs.writeFileSync(path.join(SHOTS, 'r7-estimate-conversion-evidence.json'), JSON.stringify({
    round: 'R7',
    createEstimateHttpStatus,
    estimateNo,
    estimateId: '<redacted-uuid>',
    convertHttpStatus,
    convertedSlipNo: detail.slipNo,
    convertedSlipId: '<redacted-uuid>',
    partnerCode: detail.partnerCode,
    businessNumber: detail.businessNumber,
    network: evidence,
  }, null, 2), 'utf8')

  await page.unrouteAll({ behavior: 'ignoreErrors' })
  await context.close()
})
