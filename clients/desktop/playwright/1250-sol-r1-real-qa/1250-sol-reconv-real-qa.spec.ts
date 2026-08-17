import { expect, test, type Page, type Route } from '@playwright/test'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5517'
const SHARED_API = process.env['API_BASE'] ?? 'http://127.0.0.1:8080'
const DIRECT_AUTH = process.env['DIRECT_AUTH_BASE'] ?? 'http://127.0.0.1:8081'
const ISOLATED_SLIP = process.env['ISOLATED_SLIP_BASE'] ?? 'http://127.0.0.1:28086'
const QA_DATE = '2026-08-14'
const SHOTS = resolveQaShotsDir(path.resolve(here, '../../../../docs/qa/1250-sol-r1-real-qa'))
fs.mkdirSync(SHOTS, { recursive: true })

type SourceRow = {
  seqNo: number
  slipId: string
  lineId: string
  updatedAt: string
  quantity: number
  sourceStatus: string
  accountingPostedAt: string | null
}

type Amounts = {
  quantity: string
  unit: string
  supply: string
  vat: string
  total: string
  price: string
  rate: string
  grand: string
}

type PutEvidence = {
  seqNo: number
  status: number
  payload: { unitPriceWithVat: number; releasePrice: number; discountRate: number }
  message: string
}

function identityHeaders(login: Record<string, unknown>, attestation: string): Record<string, string> {
  return {
    'X-Samhan-Gateway-Attestation': attestation,
    'X-User-Id': String(login['userId'] ?? ''),
    'X-User-Groups': String(login['groups'] ?? ''),
    'X-Is-System-Master': 'false',
    'X-Is-Partner': 'false',
    'X-User-Name': 'SOL-RECONV',
  }
}

async function openTab(page: Page, tab: 'pre_issued' | 'result' = 'pre_issued'): Promise<void> {
  await page.goto(`${BASE_URL}/#/accounting/daily-closings`)
  await expect(page.getByTestId('daily-closing-nav')).toBeVisible({ timeout: 60_000 })
  await page.getByTestId('daily-closing-filter-date').fill(QA_DATE)
  await page.getByTestId(`daily-closing-tab-${tab}`).click()
  await expect(page.getByTestId('daily-closing-table')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('daily-closing-save-all')).toBeVisible()
}

async function rowAmounts(page: Page, seqNo: number): Promise<Amounts> {
  const unit = page.getByTestId(`daily-closing-unit-${seqNo}`).first()
  await expect(unit).toBeVisible()
  const row = unit.locator('xpath=ancestor::tr')
  const cells = row.locator('td')
  const amount = async (header: string) => (await row.locator(`[data-testid$="-${header}"]`).innerText()).trim()
  return {
    quantity: (await cells.nth(5).innerText()).trim(),
    unit: await unit.inputValue(),
    supply: await amount('공급가액'),
    vat: await amount('부가세'),
    total: await amount('합계'),
    price: await page.getByTestId(`daily-closing-price-${seqNo}`).first().inputValue(),
    rate: await page.getByTestId(`daily-closing-rate-${seqNo}`).first().inputValue(),
    grand: await amount('총계'),
  }
}

async function saveOne(page: Page, puts: PutEvidence[], seqNo: number): Promise<PutEvidence> {
  const before = puts.length
  await page.getByTestId('daily-closing-save-all').click()
  await expect.poll(() => puts.length, { timeout: 30_000 }).toBeGreaterThan(before)
  const result = puts.findLast((item) => item.seqNo === seqNo)
  expect(result, `번호 ${seqNo} PUT 증거`).toBeTruthy()
  return result!
}

test('PR 1250 SOL 재수렴 금액·상태·조작 계약을 격리 라이브 화면에서 전수 실측한다', async ({ page }) => {
  const loginId = resolveQaCredential('QA_DEV_MANAGER_LOGIN_ID')
  const password = resolveQaCredential('QA_DEV_MANAGER_PASSWORD')
  const attestation = resolveQaCredential('SAMHAN_GATEWAY_ATTESTATION')
  const loginResponse = await page.request.post(`${SHARED_API}/auth/login`, { data: { loginId, password } })
  expect(loginResponse.status()).toBe(200)
  const login = ((await loginResponse.json()).data ?? {}) as Record<string, unknown>
  expect(login['role']).toBe('MANAGER')
  const trustedHeaders = identityHeaders(login, attestation)
  const puts: PutEvidence[] = []

  const source = async (): Promise<SourceRow[]> => {
    const response = await page.request.get(`${ISOLATED_SLIP}/slips/query/daily-closing?slipDate=${QA_DATE}`, { headers: trustedHeaders })
    expect(response.status()).toBe(200)
    return ((await response.json()).data ?? []) as SourceRow[]
  }
  const initialRows = await source()
  const seqBySlip = new Map(initialRows.map((row) => [row.slipId, row.seqNo]))

  const forward = async (route: Route) => {
    const request = route.request()
    const incoming = new URL(request.url())
    const isSlip = incoming.pathname === '/slips/query/daily-closing'
      || /\/slips\/[^/]+\/daily-closing-amount$/.test(incoming.pathname)
    const isMenu = incoming.pathname === '/auth/admin/menu-catalog'
    const headers = isSlip || isMenu
      ? { ...request.headers(), ...trustedHeaders }
      : { ...request.headers(), Authorization: `Bearer ${String(login['token'] ?? '')}` }
    delete headers['host']
    const response = await route.fetch({
      url: isSlip ? `${ISOLATED_SLIP}${incoming.pathname}${incoming.search}`
        : isMenu ? `${DIRECT_AUTH}${incoming.pathname}${incoming.search}` : request.url(),
      headers,
    })
    if (isSlip && request.method() === 'PUT') {
      const body = request.postDataJSON() as { lines: Array<{ unitPriceWithVat: number; releasePrice: number; discountRate: number }> }
      const json = await response.json().catch(() => ({})) as { message?: string }
      puts.push({
        seqNo: seqBySlip.get(incoming.pathname.split('/').at(-2) ?? '') ?? -1,
        status: response.status(),
        payload: body.lines[0]!,
        message: String(json.message ?? ''),
      })
    }
    await route.fulfill({ response })
  }
  await page.route(`${SHARED_API}/**`, forward)

  await openTab(page)
  const initialPre = initialRows.filter((row) => !row.accountingPostedAt).length
  const initialResult = initialRows.filter((row) => Boolean(row.accountingPostedAt)).length
  expect(await page.locator('[data-testid^="daily-closing-data-row-"]').count()).toBe(initialPre)
  await page.screenshot({ path: path.join(SHOTS, '05-reconv-pre-edit-real-qa.png'), fullPage: true })

  const directColumns = [
    page.getByTestId('daily-closing-unit-14').first(),
    page.getByTestId('daily-closing-price-14').first(),
    page.getByTestId('daily-closing-rate-14').first(),
  ]
  for (const input of directColumns) await expect(input).toBeEditable()
  for (const header of ['공급가액', '부가세', '합계', '총계']) {
    await expect(page.getByTestId(`daily-closing-cell-0-${header}`).locator('input')).toHaveCount(0)
  }

  const quantityCases: Array<Record<string, unknown>> = []
  for (const item of [
    { seqNo: 14, quantity: '1', unit: '101', expected: ['92', '9', '101'] },
    { seqNo: 15, quantity: '2', unit: '105', expected: ['190', '20', '210'] },
    { seqNo: 16, quantity: '3', unit: '999999999', expected: ['2,727,272,724', '272,727,273', '2,999,999,997'] },
  ]) {
    await page.getByTestId(`daily-closing-price-${item.seqNo}`).fill('200')
    await page.getByTestId(`daily-closing-unit-${item.seqNo}`).fill(item.unit)
    const editing = await rowAmounts(page, item.seqNo)
    expect(editing.quantity).toBe(item.quantity)
    expect([editing.supply, editing.vat, editing.total]).toEqual(item.expected)
    if (item.seqNo === 15) await page.screenshot({ path: path.join(SHOTS, '06-reconv-edit-q2-real-qa.png'), fullPage: true })
    const saved = await saveOne(page, puts, item.seqNo)
    expect(saved.status).toBe(200)
    await page.reload()
    await openTab(page)
    const after = await rowAmounts(page, item.seqNo)
    expect(after).toEqual(editing)
    quantityCases.push({ ...item, editing, payload: saved.payload, requery: after })
  }
  await page.screenshot({ path: path.join(SHOTS, '07-reconv-requery-real-qa.png'), fullPage: true })

  const priceOnlyBefore = await rowAmounts(page, 6)
  await page.getByTestId('daily-closing-price-6').fill('200')
  const priceOnlyEditing = await rowAmounts(page, 6)
  expect(priceOnlyEditing.unit).toBe(priceOnlyBefore.unit)
  const priceOnlySaved = await saveOne(page, puts, 6)
  expect(priceOnlySaved.status).toBe(200)
  await page.reload(); await openTab(page)
  const priceOnlyAfter = await rowAmounts(page, 6)
  expect(priceOnlyAfter.unit).toBe(priceOnlyEditing.unit)
  expect(priceOnlyAfter.price).toBe(priceOnlyEditing.price)
  expect(priceOnlyAfter.rate).toBe(priceOnlyEditing.rate)

  await page.getByTestId('daily-closing-price-12').fill('101')
  await page.getByTestId('daily-closing-rate-12').fill('50')
  const directRateEditing = await rowAmounts(page, 12)
  const directRateSaved = await saveOne(page, puts, 12)
  expect(directRateSaved.status).toBe(200)
  await page.reload(); await openTab(page)
  const directRateAfter = await rowAmounts(page, 12)
  expect(directRateAfter).toEqual(directRateEditing)

  const latest12 = (await source()).find((row) => row.seqNo === 12)!
  const contradiction = await page.request.put(`${ISOLATED_SLIP}/slips/${latest12.slipId}/daily-closing-amount`, {
    headers: trustedHeaders,
    data: { updatedAt: latest12.updatedAt, lines: [{ lineId: latest12.lineId, unitPriceWithVat: 105.03, releasePrice: 101, discountRate: 0.5 }] },
  })
  const contradictionBody = await contradiction.json() as { message?: string }
  expect(contradiction.status()).toBe(400)
  expect(String(contradictionBody.message ?? '')).toContain('계산 근거')

  await page.getByTestId('daily-closing-price-18').fill('200')
  await page.getByTestId('daily-closing-unit-18').fill('0')
  const zeroEditing = await rowAmounts(page, 18)
  expect([zeroEditing.supply, zeroEditing.vat, zeroEditing.total]).toEqual(['0', '0', '0'])
  expect((await saveOne(page, puts, 18)).status).toBe(200)
  await page.reload(); await openTab(page)
  const zeroAfter = await rowAmounts(page, 18)
  expect(zeroAfter).toEqual(zeroEditing)
  await page.getByTestId('daily-closing-unit-18').fill('-1')
  const negativeUnit = await saveOne(page, puts, 18)
  expect(negativeUnit.status).toBe(400)
  expect(negativeUnit.message).toContain('greater than or equal to 0')

  const statusCases: Array<Record<string, unknown>> = []
  for (const item of [{ seqNo: 11, status: 'COMPLETED', unit: '105' }, { seqNo: 13, status: 'DELIVERED', unit: '101' }]) {
    await page.reload(); await openTab(page)
    await page.getByTestId(`daily-closing-price-${item.seqNo}`).fill('200')
    await page.getByTestId(`daily-closing-unit-${item.seqNo}`).fill(item.unit)
    const editing = await rowAmounts(page, item.seqNo)
    const saved = await saveOne(page, puts, item.seqNo)
    expect(saved.status).toBe(200)
    await page.reload(); await openTab(page)
    const after = await rowAmounts(page, item.seqNo)
    expect(after).toEqual(editing)
    statusCases.push({ ...item, editing, payload: saved.payload, requery: after })
  }

  const dragStart = page.getByTestId('daily-closing-cell-0-품목명')
  const dragEnd = page.getByTestId('daily-closing-cell-1-수량')
  await dragStart.click()
  await dragEnd.click({ modifiers: ['Control'] })
  await expect(dragStart).toHaveCSS('background-color', 'rgb(219, 234, 254)')
  await expect(dragEnd).toHaveCSS('background-color', 'rgb(219, 234, 254)')
  const countBeforeSort = await page.locator('[data-testid^="daily-closing-data-row-"]').count()
  await page.getByTestId('daily-closing-sort-desc-번호').click()
  expect(await page.locator('[data-testid^="daily-closing-data-row-"]').count()).toBe(countBeforeSort)
  await page.getByTestId('daily-closing-filter-button-번호').click()
  await page.getByLabel('번호 필터 방식').selectOption('exact')
  await page.getByLabel('번호 필터 검색').fill('15')
  expect(await page.locator('[data-testid^="daily-closing-data-row-"]').count()).toBe(1)
  await page.getByTestId('daily-closing-filter-reset').click()

  await openTab(page, 'result')
  expect(await page.locator('[data-testid^="daily-closing-data-row-"]').count()).toBe(initialResult)
  const posted = initialRows.find((row) => row.accountingPostedAt)!
  const postedUnit = page.getByTestId(`daily-closing-unit-${posted.seqNo}`).first()
  await expect(postedUnit).toBeDisabled()
  const postedResponse = await page.request.put(`${ISOLATED_SLIP}/slips/${posted.slipId}/daily-closing-amount`, {
    headers: trustedHeaders,
    data: { updatedAt: posted.updatedAt, lines: [{ lineId: posted.lineId, unitPriceWithVat: 11000, releasePrice: 11000, discountRate: 0 }] },
  })
  const postedBody = await postedResponse.json() as { message?: string }
  expect(postedResponse.status()).toBe(409)
  expect(String(postedBody.message ?? '')).toContain('회계전표')
  await page.screenshot({ path: path.join(SHOTS, '08-reconv-posted-block-real-qa.png'), fullPage: true })

  const screenAll = countBeforeSort + initialResult
  expect(screenAll).toBe(initialRows.length)

  const evidence = {
    route: `${BASE_URL}/#/accounting/daily-closings`,
    uniqueElements: ['daily-closing-nav', 'daily-closing-table', 'daily-closing-save-all'],
    loginRole: String(login['role'] ?? ''),
    rows: { backendAll: initialRows.length, screenAll, backendPreIssued: initialPre, screenPreIssued: countBeforeSort, backendResult: initialResult, screenResult: initialResult },
    quantityCases,
    priceOnly: { identifier: `${QA_DATE}-6`, before: priceOnlyBefore, editing: priceOnlyEditing, payload: priceOnlySaved.payload, requery: priceOnlyAfter },
    directDiscountRate: { identifier: `${QA_DATE}-12`, editing: directRateEditing, payload: directRateSaved.payload, requery: directRateAfter },
    contradiction: { status: contradiction.status(), message: String(contradictionBody.message ?? '') },
    zero: { editing: zeroEditing, requery: zeroAfter },
    negativeUnit: { status: negativeUnit.status, message: negativeUnit.message },
    statusCases,
    accountingPostedBlock: { identifier: `${QA_DATE}-${posted.seqNo}`, inputDisabled: await postedUnit.isDisabled(), status: postedResponse.status(), message: String(postedBody.message ?? '') },
    multiSelectSortFilter: { selectedCss: 'rgb(219, 234, 254)', rowsBeforeSort: countBeforeSort, exactFilterRows: 1 },
  }
  fs.writeFileSync(path.join(SHOTS, 'reconv-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
})

test('PR 1250 단가 100원 수량 2의 182 18 200 계약을 저장 재조회한다', async ({ page }) => {
  const loginId = resolveQaCredential('QA_DEV_MANAGER_LOGIN_ID')
  const password = resolveQaCredential('QA_DEV_MANAGER_PASSWORD')
  const attestation = resolveQaCredential('SAMHAN_GATEWAY_ATTESTATION')
  const loginResponse = await page.request.post(`${SHARED_API}/auth/login`, { data: { loginId, password } })
  expect(loginResponse.status()).toBe(200)
  const login = ((await loginResponse.json()).data ?? {}) as Record<string, unknown>
  expect(login['role']).toBe('MANAGER')
  const trustedHeaders = identityHeaders(login, attestation)
  const initialResponse = await page.request.get(`${ISOLATED_SLIP}/slips/query/daily-closing?slipDate=${QA_DATE}`, { headers: trustedHeaders })
  expect(initialResponse.status()).toBe(200)
  const rows = ((await initialResponse.json()).data ?? []) as SourceRow[]
  const target = rows.find((row) => row.seqNo === 15)!
  let put: PutEvidence | null = null
  await page.route(`${SHARED_API}/**`, async (route) => {
    const request = route.request()
    const incoming = new URL(request.url())
    const isSlip = incoming.pathname === '/slips/query/daily-closing'
      || /\/slips\/[^/]+\/daily-closing-amount$/.test(incoming.pathname)
    const isMenu = incoming.pathname === '/auth/admin/menu-catalog'
    const headers = isSlip || isMenu
      ? { ...request.headers(), ...trustedHeaders }
      : { ...request.headers(), Authorization: `Bearer ${String(login['token'] ?? '')}` }
    delete headers['host']
    const response = await route.fetch({
      url: isSlip ? `${ISOLATED_SLIP}${incoming.pathname}${incoming.search}`
        : isMenu ? `${DIRECT_AUTH}${incoming.pathname}${incoming.search}` : request.url(),
      headers,
    })
    if (isSlip && request.method() === 'PUT' && incoming.pathname.includes(target.slipId)) {
      const body = request.postDataJSON() as { lines: Array<{ unitPriceWithVat: number; releasePrice: number; discountRate: number }> }
      const json = await response.json().catch(() => ({})) as { message?: string }
      put = { seqNo: 15, status: response.status(), payload: body.lines[0]!, message: String(json.message ?? '') }
    }
    await route.fulfill({ response })
  })
  await openTab(page)
  const before = await rowAmounts(page, 15)
  await page.getByTestId('daily-closing-price-15').fill('200')
  await page.getByTestId('daily-closing-unit-15').fill('100')
  const editing = await rowAmounts(page, 15)
  expect([editing.quantity, editing.unit, editing.supply, editing.vat, editing.total, editing.price, editing.rate])
    .toEqual(['2', '100', '182', '18', '200', '200', '50'])
  await page.getByTestId('daily-closing-save-all').click()
  await expect.poll(() => put, { timeout: 30_000 }).not.toBeNull()
  expect(put!.status).toBe(200)
  expect(put!.payload).toMatchObject({ unitPriceWithVat: 100, releasePrice: 200, discountRate: 0.5 })
  await page.reload(); await openTab(page)
  const requery = await rowAmounts(page, 15)
  expect(requery).toEqual(editing)
  await page.getByTestId('daily-closing-unit-15').scrollIntoViewIfNeeded()
  await page.screenshot({ path: path.join(SHOTS, '09-reconv-unit100-q2-real-qa.png'), fullPage: true })
  fs.writeFileSync(path.join(SHOTS, 'unit100-evidence.json'), `${JSON.stringify({ identifier: `${QA_DATE}-15`, before, editing, payload: put!.payload, requery }, null, 2)}\n`, 'utf8')
})
