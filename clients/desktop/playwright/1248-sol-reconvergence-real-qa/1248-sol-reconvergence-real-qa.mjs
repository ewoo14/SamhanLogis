import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../../../../scripts/lib/qa-shots-dir.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '../../../..')
const artifactDir = resolveQaShotsDir(path.join(repo, 'docs', 'qa', '1248-sol-reconvergence-real-qa'))
const shotsDir = resolveQaShotsDir(path.join(repo, 'docs', 'qa', '1248-sol-reconvergence-real-qa', 'screenshots'))
mkdirSync(shotsDir, { recursive: true })

const gateway = 'http://localhost:8080'
const isolated = 'http://127.0.0.1:29487'
const app = 'http://localhost:5943'
const results = { roleStatuses: [], boundaries: [], captures: [], http: [], defects: [], fourStage: {} }

function decodeJwt(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
}

function identityHeaders(token) {
  const claims = decodeJwt(token)
  return {
    'X-Samhan-Gateway-Attestation': resolveQaCredential('SAMHAN_GATEWAY_ATTESTATION'),
    'X-User-Id': String(claims.userId ?? claims.sub ?? ''),
    'X-User-Role': String(claims.role ?? ''),
    'X-User-Groups': Array.isArray(claims.groups) ? claims.groups.join(',') : String(claims.groups ?? ''),
    'X-Is-System-Master': String(claims.isSystemMaster === true),
    'X-Is-Partner': String(Boolean(claims.partnerCode)),
    'Content-Type': 'application/json',
  }
}

async function login(context, loginId, password) {
  const response = await context.request.post(`${gateway}/auth/login`, { data: { loginId, password } })
  let body = {}
  try { body = await response.json() } catch {}
  return { status: response.status(), body, token: body?.data?.token ?? body?.data?.accessToken ?? '' }
}

async function direct(method, pathname, headers, body) {
  const response = await fetch(`${isolated}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const raw = await response.text()
  let parsed = null
  try { parsed = JSON.parse(raw) } catch {}
  results.http.push({ method, pathname, status: response.status })
  return { status: response.status, raw, parsed }
}

function legacy(input) {
  const xround = (n) => (n < 0 ? -1 : 1) * Math.round(Math.abs(n))
  const card = input.paymentMethod === 'CARD' ? xround(-Number(input.total) * 0.03) : 0
  const sales = Number(input.total) - Number(input.equipment) + card
  const rate = input.manualExpenseRate == null ? 0.08 : Number(input.manualExpenseRate)
  const expense = xround(sales * -rate)
  const withholding = input.withholdingApplied ? xround(sales * -0.033) : 0
  const installAmount = xround(Number(input.install) * -0.08)
  const safetyAmount = -Number(input.safety)
  const subtotal = sales + expense + withholding + installAmount + safetyAmount
  const payout = subtotal - Number(input.prepaid)
  const supply = xround(subtotal / 1.1)
  return { card, sales, expense, withholding, installAmount, safetyAmount, subtotal, payout, supply, vat: subtotal - supply }
}

const browser = await chromium.launch({ headless: true })
try {
  const defaultPassword = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  const roles = [
    ['MASTER', 'dev_master', defaultPassword],
    ['MANAGER', resolveQaCredential('QA_DEV_MANAGER_LOGIN_ID'), resolveQaCredential('QA_DEV_MANAGER_PASSWORD')],
    ['ACCOUNTANT', 'dev_accountant', defaultPassword],
    ['SALES', 'dev_sales', defaultPassword],
    ['WAREHOUSE', 'dev_warehouse', defaultPassword],
    ['DISPATCH', 'dev_dispatch', defaultPassword],
    ['INVENTORY', 'dev_inventory', defaultPassword],
    ['DEVELOPER', 'dev_developer', defaultPassword],
    ['STAFF', 'dev_staff', defaultPassword],
    ['DRIVER', 'dev_driver', defaultPassword],
  ]
  for (const [role, loginId, password] of roles) {
    const context = await browser.newContext()
    const auth = await login(context, loginId, password)
    let endpointStatus = null
    if (auth.status === 200) {
      endpointStatus = (await context.request.get(`${gateway}/accounting/sales-commission-settlements?page=0&size=1`)).status()
    }
    results.roleStatuses.push({ role, loginStatus: auth.status, endpointStatus })
    await context.close()
  }

  const context = await browser.newContext()
  const manager = await login(context, resolveQaCredential('QA_DEV_MANAGER_LOGIN_ID'), resolveQaCredential('QA_DEV_MANAGER_PASSWORD'))
  if (manager.status !== 200 || !manager.token) throw new Error(`직원 로그인 실패 HTTP ${manager.status}, tokenPresent=${Boolean(manager.token)}`)
  const headers = identityHeaders(manager.token)
  const cookieState = await context.storageState()
  results.employeeLogin = {
    status: manager.status,
    cookies: cookieState.cookies.map(({ name, domain, path, httpOnly, secure, sameSite }) => ({ name, domain, path, httpOnly, secure, sameSite })),
  }

  const created = await direct('POST', '/accounting/sales-commission-settlements', headers, { settlementDate: '2026-08-17' })
  if (created.status !== 201) throw new Error(`격리 DRAFT 생성 실패 HTTP ${created.status}: ${created.raw}`)
  const draftId = created.parsed.data.id
  results.draft = { createStatus: created.status, idPresent: Boolean(draftId) }

  const sample = {
    total: '10000000', equipment: '1000000', prepaid: '200000', install: '500000', safety: '100000',
    paymentMethod: 'CARD', withholdingApplied: true, manualExpenseRate: null, rateContractVersion: 1,
  }
  const sampleResult = await direct('POST', `/accounting/sales-commission-settlements/${draftId}/calculate`, headers, sample)
  const sampleGet = await direct('GET', `/accounting/sales-commission-settlements/${draftId}`, headers)
  results.sample = { input: sample, legacy: legacy(sample), implementation: sampleResult.parsed?.data, requery: sampleGet.parsed?.data }

  const base = { equipment: '0', prepaid: '0', install: '0', safety: '0', paymentMethod: 'CASH', withholdingApplied: false, manualExpenseRate: null, rateContractVersion: 1 }
  const cases = [
    ['zero', { ...base, total: '0' }, 200],
    ['blank', { ...base, total: '', equipment: '', prepaid: '', install: '', safety: '' }, 200],
    ['negative', { ...base, total: '-1000' }, 200],
    ['ending-half', { ...base, total: '50', paymentMethod: 'CARD' }, 200],
    ['digits-15', { ...base, total: '999999999999999' }, 200],
    ['digits-16', { ...base, total: '9999999999999999' }, 200],
    ['digits-17', { ...base, total: '99999999999999999' }, 200],
    ['digits-18', { ...base, total: '999999999999999999' }, 200],
    ['digits-19', { ...base, total: '9999999999999999999' }, 400],
    ['digits-20', { ...base, total: '99999999999999999999' }, 400],
    ['prepaid-over-total', { ...base, total: '100', prepaid: '101' }, 200],
    ['partial-only-install', { ...base, total: '', equipment: '', prepaid: '', install: '125', safety: '' }, 200],
    ['malformed-letter', { ...base, total: '문자' }, 400],
    ['malformed-comma', { ...base, total: '1,000' }, 400],
    ['malformed-plus', { ...base, total: '+1000' }, 400],
  ]
  for (const [name, input, expectedStatus] of cases) {
    const response = await direct('POST', `/accounting/sales-commission-settlements/${draftId}/calculate`, headers, input)
    results.boundaries.push({
      name,
      expectedStatus,
      actualStatus: response.status,
      requestTotal: input.total,
      rawTotalToken: response.raw.match(/\"totalAmount\":(-?\d+(?:\.\d+)?)/)?.[1] ?? null,
      parsedTotal: response.parsed?.data?.totalAmount ?? null,
      payout: response.parsed?.data?.payoutAmount ?? null,
    })
  }

  for (const paymentMethod of ['CARD', 'CASH']) {
    for (const withholdingApplied of [true, false]) {
      for (const manual of [null, '0.125']) {
        const input = { ...base, total: '10000', paymentMethod, withholdingApplied, manualExpenseRate: manual }
        const response = await direct('POST', `/accounting/sales-commission-settlements/${draftId}/calculate`, headers, input)
        results.boundaries.push({
          name: `toggle-${paymentMethod}-${withholdingApplied ? 'WHT_ON' : 'WHT_OFF'}-${manual == null ? 'EXP_8' : 'EXP_MANUAL'}`,
          expectedStatus: 200,
          actualStatus: response.status,
          payout: response.parsed?.data?.payoutAmount,
          appliedExpenseRate: response.parsed?.data?.appliedExpenseRate,
        })
      }
    }
  }

  const list = await direct('GET', '/accounting/sales-commission-settlements?page=0&size=20', headers)
  const detail = await direct('GET', `/accounting/sales-commission-settlements/${draftId}`, headers)
  const confirmDraft = await direct('POST', '/accounting/sales-commission-settlements', headers, { settlementDate: '2026-08-18' })
  const confirm = await direct('POST', `/accounting/sales-commission-settlements/${confirmDraft.parsed.data.id}/confirm`, headers, {})
  results.draft = { ...results.draft, listStatus: list.status, detailStatus: detail.status, secondCreateStatus: confirmDraft.status, confirmStatus: confirm.status }

  // 경계 전수가 같은 격리 DRAFT의 토글 상태를 바꾸므로 UI 진입 직전에 빈 기준으로 복원한다.
  await direct('POST', `/accounting/sales-commission-settlements/${draftId}/calculate`, headers, { ...base, total: '0', paymentMethod: 'CARD', withholdingApplied: true })

  const page = await context.newPage()
  let lastCalculatePayload = null
  let lastCalculateRaw = null
  let lastRequeryRaw = null
  let raceDelayEnabled = false
  page.on('response', (response) => {
    if (response.status() >= 400) results.http.push({ method: response.request().method(), pathname: response.url(), status: response.status() })
  })
  await page.route('**/auth/admin/menu-catalog', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, code: 'OK', message: '', data: [{ app: 'samhan-public', category: '회계', label: '영업수수료 정산', route: '/accounting/sales-commission-settlements', pageCode: 'accounting.sales-commission-settlement', order: 29 }] }) })
  })
  await page.route('**/accounting/sales-commission-settlements**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const bodyText = request.postData()
    let requestBody = null
    try { requestBody = bodyText ? JSON.parse(bodyText) : null } catch {}
    if (request.method() === 'POST' && url.pathname.endsWith('/calculate')) {
      lastCalculatePayload = requestBody
      if (raceDelayEnabled && requestBody?.total === '1') await new Promise((resolve) => setTimeout(resolve, 700))
    }
    const upstream = await fetch(`${isolated}${url.pathname}${url.search}`, {
      method: request.method(), headers, body: bodyText ?? undefined,
    })
    const raw = await upstream.text()
    if (request.method() === 'POST' && url.pathname.endsWith('/calculate')) lastCalculateRaw = raw
    if (request.method() === 'GET' && url.pathname.endsWith(`/${draftId}`)) lastRequeryRaw = raw
    await route.fulfill({ status: upstream.status, contentType: 'application/json; charset=utf-8', body: raw })
  })

  await page.goto(`${app}/#/accounting/sales-commission-settlements`, { waitUntil: 'networkidle' })
  await page.locator('h3').filter({ hasText: '영업수수료 정산' }).waitFor({ state: 'visible' })
  const draftLink = page.locator(`[data-testid^="sales-commission-settlement-document-draft-"][href$="/${draftId}"]`)
  await draftLink.waitFor({ state: 'visible' })
  await draftLink.click()
  await page.getByRole('heading', { name: '정산 계산' }).waitFor({ state: 'visible' })
  const beforePath = path.join(shotsDir, '01-before-input-real-qa.png')
  await page.screenshot({ path: beforePath, fullPage: true })
  results.captures.push(beforePath)

  const fields = [['총 결제금액', '10000000'], ['장비대', '1000000'], ['선지급', '200000'], ['설치비', '500000'], ['안전관리비', '100000']]
  for (const [label, value] of fields) {
    await Promise.all([
      page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/calculate')),
      page.waitForResponse((response) => response.request().method() === 'GET' && response.url().endsWith(`/${draftId}`)),
      page.getByLabel(label).fill(value),
    ])
  }
  await page.getByText('₩7,376,900', { exact: true }).waitFor({ state: 'visible', timeout: 15000 })
  const afterPath = path.join(shotsDir, '02-after-input-real-qa.png')
  await page.screenshot({ path: afterPath, fullPage: true })
  results.captures.push(afterPath)
  results.fourStage = {
    screenInput: Object.fromEntries(await Promise.all(fields.map(async ([label]) => [label, await page.getByLabel(label).inputValue()]))),
    screenResult: {
      total: await page.locator('dt', { hasText: '총액' }).locator('..').locator('dd').innerText(),
      payout: await page.locator('dt', { hasText: '지급액' }).locator('..').locator('dd').innerText(),
      supply: await page.locator('dt', { hasText: '공급가액' }).locator('..').locator('dd').innerText(),
      vat: await page.locator('dt', { hasText: '부가세' }).locator('..').locator('dd').innerText(),
    },
    savePayload: lastCalculatePayload,
    saveResponseRaw: lastCalculateRaw,
    requeryRaw: lastRequeryRaw,
  }

  await page.getByRole('button', { name: '수기', exact: true }).click()
  await page.getByLabel('수기 제경비율').waitFor({ state: 'visible' })
  await page.getByLabel('수기 제경비율').fill('12.5')
  await page.getByText('₩6,985,400', { exact: true }).waitFor({ state: 'visible', timeout: 15000 })
  results.manualExpenseUi = {
    inputVisible: await page.getByLabel('수기 제경비율').isVisible(),
    input: await page.getByLabel('수기 제경비율').inputValue(),
    payout: await page.locator('dt', { hasText: '지급액' }).locator('..').locator('dd').innerText(),
  }
  await page.locator('button').filter({ hasText: '8%' }).click()
  await page.getByText('₩7,376,900', { exact: true }).waitFor({ state: 'visible', timeout: 15000 })

  await page.getByLabel('결제방식').selectOption('CASH')
  await page.getByLabel('원천징수').selectOption('false')
  for (const [label] of fields.slice(1)) await page.getByLabel(label).fill('0')
  await page.getByLabel('총 결제금액').fill('999999999999999999')
  await page.waitForTimeout(1200)
  const precisionPath = path.join(shotsDir, '03-18-digit-real-qa.png')
  await page.screenshot({ path: precisionPath, fullPage: true })
  results.captures.push(precisionPath)
  results.precisionUi = {
    input: await page.getByLabel('총 결제금액').inputValue(),
    displayedTotal: await page.locator('dt', { hasText: '총액' }).locator('..').locator('dd').innerText(),
    savePayload: lastCalculatePayload,
    saveResponseRaw: lastCalculateRaw,
    requeryRaw: lastRequeryRaw,
  }

  await page.getByLabel('총 결제금액').fill('0')
  await page.waitForTimeout(500)
  raceDelayEnabled = true
  await page.getByLabel('총 결제금액').fill('1')
  await page.getByLabel('총 결제금액').fill('12')
  await page.waitForTimeout(1600)
  const raceGet = await direct('GET', `/accounting/sales-commission-settlements/${draftId}`, headers)
  results.race = {
    input: await page.getByLabel('총 결제금액').inputValue(),
    displayedTotal: await page.locator('dt', { hasText: '총액' }).locator('..').locator('dd').innerText(),
    storedTotal: raceGet.parsed?.data?.totalAmount,
  }
  const racePath = path.join(shotsDir, '04-out-of-order-response-real-qa.png')
  await page.screenshot({ path: racePath, fullPage: true })
  results.captures.push(racePath)
  await context.close()
} catch (error) {
  results.launchOrRunError = String(error?.stack ?? error)
  throw error
} finally {
  await browser.close()
  writeFileSync(path.join(artifactDir, 'results.json'), JSON.stringify(results, null, 2), 'utf8')
}
