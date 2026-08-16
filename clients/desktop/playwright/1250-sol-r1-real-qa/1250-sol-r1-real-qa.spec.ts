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
  productPrice: number | string | null
  unitPriceWithVat: number | string
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
  responseMessage: string
}

function unquote(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, '')
}

function identityHeaders(login: Record<string, unknown>, attestation: string): Record<string, string> {
  return {
    'X-Samhan-Gateway-Attestation': attestation,
    'X-User-Id': String(login['userId'] ?? ''),
    'X-User-Groups': String(login['groups'] ?? ''),
    'X-Is-System-Master': 'false',
    'X-Is-Partner': 'false',
    'X-User-Name': 'SOL-R1',
  }
}

async function openPreIssued(page: Page, loginId: string, password: string): Promise<void> {
  await page.goto(`${BASE_URL}/#/accounting/daily-closings`)
  const loginInput = page.getByLabel(/사용자 ID/)
  if (await loginInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await loginInput.fill(loginId)
    await page.getByLabel(/비밀번호/).fill(password)
    await page.getByRole('button', { name: /^로그인$/ }).click()
  }
  await expect(page.getByTestId('daily-closing-nav')).toBeVisible({ timeout: 60_000 })
  await page.getByTestId('daily-closing-filter-date').fill(QA_DATE)
  await page.getByTestId('daily-closing-tab-pre_issued').click()
  await expect(page.getByTestId('daily-closing-table')).toBeVisible({ timeout: 30_000 })
}

async function rowAmounts(page: Page, seqNo: number): Promise<Amounts> {
  const unit = page.getByTestId(`daily-closing-unit-${seqNo}`).first()
  await expect(unit).toBeVisible()
  const row = unit.locator('xpath=ancestor::tr')
  const cells = row.locator('td')
  const amountCell = async (header: string) => (await row.locator(`[data-testid$="-${header}"]`).innerText()).trim()
  return {
    quantity: (await cells.nth(5).innerText()).trim(),
    unit: await unit.inputValue(),
    supply: await amountCell('공급가액'),
    vat: await amountCell('부가세'),
    total: await amountCell('합계'),
    price: await page.getByTestId(`daily-closing-price-${seqNo}`).first().inputValue(),
    rate: await page.getByTestId(`daily-closing-rate-${seqNo}`).first().inputValue(),
    grand: await amountCell('총계'),
  }
}

async function saveOne(page: Page, evidence: PutEvidence[], seqNo: number): Promise<PutEvidence> {
  const previous = evidence.length
  await page.getByTestId('daily-closing-save-all').click()
  await expect.poll(() => evidence.length, { timeout: 30_000 }).toBeGreaterThan(previous)
  const result = evidence.findLast((entry) => entry.seqNo === seqNo)
  expect(result, `번호 ${seqNo} PUT 증거`).toBeTruthy()
  return result!
}

test('PR 1250 SOL 적대검증 라운드1 금액 네 단계와 차단을 실측한다', async ({ page }) => {
  const loginId = resolveQaCredential('QA_DEV_MANAGER_LOGIN_ID')
  const password = resolveQaCredential('QA_DEV_MANAGER_PASSWORD')
  const attestation = resolveQaCredential('SAMHAN_GATEWAY_ATTESTATION')
  const loginResponse = await page.request.post(`${SHARED_API}/auth/login`, {
    data: { loginId, password },
  })
  expect(loginResponse.status()).toBe(200)
  const login = ((await loginResponse.json()).data ?? {}) as Record<string, unknown>
  expect(login['role']).toBe('MANAGER')
  const trustedHeaders = identityHeaders(login, attestation)

  const sourceResponse = await page.request.get(`${ISOLATED_SLIP}/slips/query/daily-closing?slipDate=${QA_DATE}`, {
    headers: trustedHeaders,
  })
  expect(sourceResponse.status()).toBe(200)
  const sourceRows = ((await sourceResponse.json()).data ?? []) as SourceRow[]
  const seqBySlip = new Map(sourceRows.map((row) => [row.slipId, row.seqNo]))
  const putEvidence: PutEvidence[] = []

  const forward = async (route: Route) => {
    const request = route.request()
    const incoming = new URL(request.url())
    const isDailyClosingSlip = incoming.pathname === '/slips/query/daily-closing'
      || /\/slips\/[^/]+\/daily-closing-amount$/.test(incoming.pathname)
    const isMenuCatalog = incoming.pathname === '/auth/admin/menu-catalog'
    const headers = isDailyClosingSlip || isMenuCatalog
      ? { ...request.headers(), ...trustedHeaders }
      : { ...request.headers(), Authorization: `Bearer ${String(login['token'] ?? '')}` }
    delete headers['host']
    const response = await route.fetch({
      url: isDailyClosingSlip
        ? `${ISOLATED_SLIP}${incoming.pathname}${incoming.search}`
        : isMenuCatalog
          ? `${DIRECT_AUTH}${incoming.pathname}${incoming.search}`
          : request.url(),
      headers,
    })
    if (isDailyClosingSlip && request.method() === 'PUT') {
      const body = request.postDataJSON() as { lines: Array<{ lineId: string; unitPriceWithVat: number; releasePrice: number; discountRate: number }> }
      const slipId = incoming.pathname.split('/').at(-2) ?? ''
      const json = await response.json().catch(() => ({})) as { message?: string }
      putEvidence.push({
        seqNo: seqBySlip.get(slipId) ?? -1,
        status: response.status(),
        payload: {
          unitPriceWithVat: body.lines[0]!.unitPriceWithVat,
          releasePrice: body.lines[0]!.releasePrice,
          discountRate: body.lines[0]!.discountRate,
        },
        responseMessage: String(json.message ?? ''),
      })
    }
    await route.fulfill({ response })
  }
  await page.route(`${SHARED_API}/**`, forward)

  await openPreIssued(page, loginId, password)
  const backendPreIssued = sourceRows.filter((row) => !row.accountingPostedAt).length
  const preIssuedRows = await page.locator('[data-testid^="daily-closing-data-row-"]').count()
  expect(preIssuedRows).toBe(backendPreIssued)
  await page.screenshot({ path: path.join(SHOTS, '01-pre-edit-real-qa.png'), fullPage: true })

  const before15 = await rowAmounts(page, 15)
  await page.getByTestId('daily-closing-price-15').fill('200')
  const priceEditOnly15 = await rowAmounts(page, 15)
  await page.getByTestId('daily-closing-unit-15').fill('105')
  const editing15 = await rowAmounts(page, 15)
  await page.getByTestId('daily-closing-unit-15').scrollIntoViewIfNeeded()
  await page.screenshot({ path: path.join(SHOTS, '02-editing-105-q2-real-qa.png'), fullPage: true })
  const saved15 = await saveOne(page, putEvidence, 15)
  expect(saved15.status).toBe(200)

  await page.reload()
  await openPreIssued(page, loginId, password)
  const after15 = await rowAmounts(page, 15)
  await page.getByTestId('daily-closing-unit-15').scrollIntoViewIfNeeded()
  await page.screenshot({ path: path.join(SHOTS, '03-requery-105-q2-real-qa.png'), fullPage: true })

  const quantityCases: Array<Record<string, unknown>> = []
  for (const item of [
    { seqNo: 14, quantity: 1, unit: '101' },
    { seqNo: 16, quantity: 3, unit: '999999999' },
    { seqNo: 18, quantity: 1, unit: '0' },
  ]) {
    const before = await rowAmounts(page, item.seqNo)
    await page.getByTestId(`daily-closing-unit-${item.seqNo}`).fill(item.unit)
    const editing = await rowAmounts(page, item.seqNo)
    const saved = await saveOne(page, putEvidence, item.seqNo)
    expect(saved.status).toBe(200)
    await page.reload()
    await openPreIssued(page, loginId, password)
    const after = await rowAmounts(page, item.seqNo)
    quantityCases.push({ ...item, before, editing, payload: saved.payload, after })
  }

  const statusCases: Array<Record<string, unknown>> = []
  for (const item of [
    { seqNo: 11, status: 'COMPLETED', unit: '101' },
    { seqNo: 13, status: 'DELIVERED', unit: '105' },
  ]) {
    await page.getByTestId(`daily-closing-unit-${item.seqNo}`).fill(item.unit)
    const editing = await rowAmounts(page, item.seqNo)
    const saved = await saveOne(page, putEvidence, item.seqNo)
    expect(saved.status).toBe(200)
    await page.reload()
    await openPreIssued(page, loginId, password)
    const after = await rowAmounts(page, item.seqNo)
    statusCases.push({ ...item, editing, payload: saved.payload, after })
  }

  await page.getByTestId('daily-closing-price-14').fill('101')
  await page.getByTestId('daily-closing-rate-14').fill('50')
  const rateEditing = await rowAmounts(page, 14)
  const rateFailure = await saveOne(page, putEvidence, 14)
  expect(rateFailure.status).toBe(400)
  await expect(page.getByRole('alert').filter({ hasText: '금액을 저장하지 못했습니다' })).toBeVisible()

  await page.reload()
  await openPreIssued(page, loginId, password)
  await page.getByTestId('daily-closing-unit-18').fill('-1')
  const negativeEditing = await rowAmounts(page, 18)
  const negativeFailure = await saveOne(page, putEvidence, 18)
  expect(negativeFailure.status).toBe(400)

  await page.reload()
  await expect(page.getByTestId('daily-closing-nav')).toBeVisible({ timeout: 60_000 })
  await page.getByTestId('daily-closing-filter-date').fill(QA_DATE)
  await page.getByTestId('daily-closing-tab-result').click()
  await expect(page.getByTestId('daily-closing-table')).toBeVisible()
  const resultRows = await page.locator('[data-testid^="daily-closing-data-row-"]').count()
  const backendResult = sourceRows.filter((row) => Boolean(row.accountingPostedAt)).length
  expect(resultRows).toBe(backendResult)
  const postedUnit = page.getByTestId('daily-closing-unit-17')
  await expect(postedUnit).toBeDisabled()
  await expect(postedUnit.locator('xpath=ancestor::td')).toContainText('수정 불가')

  const posted = sourceRows.find((row) => row.seqNo === 17)!
  const postedResponse = await page.request.put(`${ISOLATED_SLIP}/slips/${posted.slipId}/daily-closing-amount`, {
    headers: trustedHeaders,
    data: {
      updatedAt: posted.updatedAt,
      lines: [{
        lineId: posted.lineId,
        unitPriceWithVat: Number(posted.unitPriceWithVat),
        releasePrice: Number(posted.unitPriceWithVat),
        discountRate: 0,
      }],
    },
  })
  const postedBody = await postedResponse.json() as { message?: string }
  expect(postedResponse.status()).toBe(409)
  expect(String(postedBody.message ?? '')).toContain('회계전표')
  await page.screenshot({ path: path.join(SHOTS, '04-accounting-posted-block-real-qa.png'), fullPage: true })

  const evidence = {
    route: `${BASE_URL}/#/accounting/daily-closings`,
    uniqueElements: ['daily-closing-nav', 'daily-closing-table', 'daily-closing-save-all'],
    loginRole: String(login['role'] ?? ''),
    isolatedJarSha256: '8663192f2cbced143e51e594f2833edb86d9271dd6b8a94a65334cb570e52943',
    rows: {
      backendAll: sourceRows.length,
      backendPreIssued,
      screenPreIssued: preIssuedRows,
      backendResult,
      screenResult: resultRows,
    },
    fourStagesQ2: {
      identifier: '2026/08/14-15',
      before: before15,
      priceEditOnly: priceEditOnly15,
      editing: editing15,
      payload: saved15.payload,
      requery: after15,
    },
    quantityCases,
    statusCases,
    rateDirectEditFailure: { identifier: '2026/08/14-14', editing: rateEditing, ...rateFailure },
    negativeFailure: { identifier: '2026/08/14-18', editing: negativeEditing, ...negativeFailure },
    accountingPostedBlock: {
      identifier: '2026/08/14-17',
      inputDisabled: await postedUnit.isDisabled(),
      directStatus: postedResponse.status(),
      message: String(postedBody.message ?? ''),
    },
  }
  fs.writeFileSync(path.join(SHOTS, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  const files = fs.readdirSync(SHOTS)
    .filter((name) => name.endsWith('.png'))
    .map((name) => `${name}|${fs.statSync(path.join(SHOTS, name)).size}`)
  fs.writeFileSync(path.join(SHOTS, 'capture-files.txt'), `${files.join('\n')}\n`, 'utf8')
})
