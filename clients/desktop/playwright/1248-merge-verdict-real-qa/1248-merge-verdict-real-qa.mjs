import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../../../../scripts/lib/qa-shots-dir.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '../../../..')
const artifactDir = resolveQaShotsDir(path.join(repo, 'docs', 'qa', '1248-merge-verdict-real-qa'))
const shotsDir = resolveQaShotsDir(path.join(repo, 'docs', 'qa', '1248-merge-verdict-real-qa', 'screenshots'))
mkdirSync(shotsDir, { recursive: true })

const isolatedGateway = 'http://127.0.0.1:28080'
const sharedGateway = 'http://localhost:8080'
const isolatedAccounting = 'http://127.0.0.1:29487'
const app = 'http://127.0.0.1:5943'
const results = {
  gateway: {}, roles: [], draftRegression: {}, boundaries: {}, digits: [], races: [],
  captures: [], manualExpenseUi: {}, calculation: {}, errors: [],
}

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

async function login(context, gateway, loginId, password) {
  const response = await context.request.post(`${gateway}/auth/login`, { data: { loginId, password } })
  let body = {}
  try { body = await response.json() } catch {}
  return { status: response.status(), body, token: body?.data?.token ?? body?.data?.accessToken ?? '' }
}

async function direct(method, pathname, headers, body) {
  const response = await fetch(`${isolatedAccounting}${pathname}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  })
  const raw = await response.text()
  let parsed = null
  try { parsed = JSON.parse(raw) } catch {}
  return { status: response.status, raw, parsed }
}

const baseInput = {
  equipment: '0', prepaid: '0', install: '0', safety: '0', paymentMethod: 'CASH',
  withholdingApplied: false, manualExpenseRate: null, rateContractVersion: 1,
}

const browser = await chromium.launch({ headless: true })
try {
  const managerLogin = resolveQaCredential('QA_DEV_MANAGER_LOGIN_ID')
  const managerPassword = resolveQaCredential('QA_DEV_MANAGER_PASSWORD')
  const defaultPassword = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')

  // 캐시 토큰을 쓰지 않고 두 게이트웨이에서 각각 새 로그인한다.
  for (const [name, gateway] of [['isolatedPrHead', isolatedGateway], ['sharedOld', sharedGateway]]) {
    const context = await browser.newContext()
    const auth = await login(context, gateway, managerLogin, managerPassword)
    const catalog = auth.status === 200
      ? await context.request.get(`${gateway}/auth/admin/menu-catalog`)
      : null
    let catalogBody = ''
    if (catalog) catalogBody = await catalog.text()
    results.gateway[name] = {
      loginStatus: auth.status,
      catalogStatus: catalog?.status() ?? null,
      catalogBody: catalogBody.slice(0, 300),
    }
    await context.close()
  }

  const managerContext = await browser.newContext()
  const managerAuth = await login(managerContext, isolatedGateway, managerLogin, managerPassword)
  if (managerAuth.status !== 200 || !managerAuth.token) throw new Error(`격리 gateway 직원 로그인 실패 HTTP ${managerAuth.status}`)
  const managerHeaders = identityHeaders(managerAuth.token)

  const created = await direct('POST', '/accounting/sales-commission-settlements', managerHeaders, { settlementDate: '2026-08-17' })
  if (created.status !== 201) throw new Error(`격리 DRAFT 생성 실패 HTTP ${created.status}: ${created.raw}`)
  const draftId = created.parsed?.data?.id
  if (!draftId) throw new Error('격리 DRAFT id 없음')

  const roleCases = [
    ['MASTER', 'dev_master', defaultPassword],
    ['MANAGER', managerLogin, managerPassword],
    ['ACCOUNTANT', 'dev_accountant', defaultPassword],
    ['SALES', 'dev_sales', defaultPassword],
    ['WAREHOUSE', 'dev_warehouse', defaultPassword],
    ['DISPATCH', 'dev_dispatch', defaultPassword],
    ['INVENTORY', 'dev_inventory', defaultPassword],
    ['DEVELOPER', 'dev_developer', defaultPassword],
    ['STAFF', 'dev_staff', defaultPassword],
    ['DRIVER', 'dev_driver', defaultPassword],
  ]
  for (const [role, loginId, password] of roleCases) {
    const context = await browser.newContext()
    const auth = await login(context, isolatedGateway, loginId, password)
    let listStatus = null
    let calculateStatus = null
    if (auth.status === 200 && auth.token) {
      const headers = identityHeaders(auth.token)
      listStatus = (await direct('GET', '/accounting/sales-commission-settlements?page=0&size=1', headers)).status
      calculateStatus = (await direct('POST', `/accounting/sales-commission-settlements/${draftId}/calculate`, headers, { ...baseInput, total: '1000' })).status
    }
    results.roles.push({ role, loginStatus: auth.status, listStatus, calculateStatus })
    await context.close()
  }

  const blank = await direct('POST', `/accounting/sales-commission-settlements/${draftId}/calculate`, managerHeaders, {
    ...baseInput, total: '', equipment: '', prepaid: '', install: '', safety: '',
  })
  const malformed = await direct('POST', `/accounting/sales-commission-settlements/${draftId}/calculate`, managerHeaders, { ...baseInput, total: '1,000' })
  results.boundaries = {
    blankStatus: blank.status,
    blankTotal: blank.parsed?.data?.totalAmount,
    blankPayout: blank.parsed?.data?.payoutAmount,
    malformedStatus: malformed.status,
    malformedBody: malformed.raw.slice(0, 300),
  }

  const list = await direct('GET', '/accounting/sales-commission-settlements?page=0&size=20', managerHeaders)
  const detail = await direct('GET', `/accounting/sales-commission-settlements/${draftId}`, managerHeaders)
  const confirmCreated = await direct('POST', '/accounting/sales-commission-settlements', managerHeaders, { settlementDate: '2026-08-18' })
  const confirm = await direct('POST', `/accounting/sales-commission-settlements/${confirmCreated.parsed?.data?.id}/confirm`, managerHeaders, {})
  results.draftRegression = {
    createStatus: created.status, listStatus: list.status, detailStatus: detail.status,
    secondCreateStatus: confirmCreated.status, confirmStatus: confirm.status,
  }

  const sample = {
    total: '1234567', equipment: '234567', prepaid: '100000', install: '123456', safety: '7890',
    paymentMethod: 'CARD', withholdingApplied: true, manualExpenseRate: null, rateContractVersion: 1,
  }
  const sampleSaved = await direct('POST', `/accounting/sales-commission-settlements/${draftId}/calculate`, managerHeaders, sample)
  const sampleRead = await direct('GET', `/accounting/sales-commission-settlements/${draftId}`, managerHeaders)
  results.calculation = { input: sample, response: sampleSaved.parsed?.data, requery: sampleRead.parsed?.data }

  const page = await managerContext.newPage()
  let activeRace = null
  const requestEvents = []
  await page.route('**/accounting/sales-commission-settlements**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const bodyText = request.postData()
    let body = null
    try { body = bodyText ? JSON.parse(bodyText) : null } catch {}
    const isCalculate = request.method() === 'POST' && url.pathname.endsWith('/calculate')
    const event = isCalculate ? { total: body?.total, startedAt: Date.now(), fulfilledAt: null } : null
    if (event) requestEvents.push(event)
    if (isCalculate && activeRace && body?.total === activeRace.a) {
      await new Promise((resolve) => setTimeout(resolve, activeRace.aPreUpstreamDelayMs))
    }
    if (isCalculate && activeRace && body?.total === activeRace.b && activeRace.bPreUpstreamDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, activeRace.bPreUpstreamDelayMs))
    }
    const upstream = await fetch(`${isolatedAccounting}${url.pathname}${url.search}`, {
      method: request.method(), headers: managerHeaders, body: bodyText ?? undefined,
    })
    const raw = await upstream.text()
    if (event) event.fulfilledAt = Date.now()
    await route.fulfill({ status: upstream.status, contentType: 'application/json; charset=utf-8', body: raw })
  })

  await page.goto(`${app}/#/accounting/sales-commission-settlements`, { waitUntil: 'networkidle' })
  await page.locator('h3').filter({ hasText: '영업수수료 정산' }).waitFor({ state: 'visible' })
  const draftLink = page.locator(`[data-testid^="sales-commission-settlement-document-draft-"][href$="/${draftId}"]`)
  await draftLink.waitFor({ state: 'visible' })
  await draftLink.click()
  await page.getByRole('heading', { name: '정산 계산' }).waitFor({ state: 'visible' })
  const beforeShot = path.join(shotsDir, '01-before-input-real-qa.png')
  await page.screenshot({ path: beforeShot, fullPage: true })
  results.captures.push(beforeShot)

  const totalInput = page.getByLabel('총 결제금액')
  const totalDisplay = page.locator('dt', { hasText: '총액' }).locator('..').locator('dd')
  for (const digits of [15, 16, 17, 18]) {
    const value = '9'.repeat(digits)
    const start = requestEvents.length
    const responsePromise = page.waitForResponse((response) => {
      if (!response.url().endsWith('/calculate') || response.request().method() !== 'POST') return false
      try { return response.request().postDataJSON()?.total === value } catch { return false }
    })
    await totalInput.fill(value)
    const response = await responsePromise
    const responseJson = await response.json()
    await page.waitForFunction((expected) => document.body.innerText.includes(expected), `₩${value.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`)
    const requery = await direct('GET', `/accounting/sales-commission-settlements/${draftId}`, managerHeaders)
    const event = requestEvents.slice(start).find((item) => item.total === value)
    results.digits.push({
      digits, input: await totalInput.inputValue(), screen: await totalDisplay.innerText(),
      payload: event?.total ?? null, response: responseJson?.data?.totalAmount ?? null,
      storedAndRequeried: requery.parsed?.data?.totalAmount ?? null, status: response.status(), alert: null,
    })
  }
  const afterShot = path.join(shotsDir, '02-after-input-real-qa.png')
  await page.screenshot({ path: afterShot, fullPage: true })
  results.captures.push(afterShot)

  for (const digits of [19, 20]) {
    const value = '9'.repeat(digits)
    const beforeCount = requestEvents.length
    const storedBefore = (await direct('GET', `/accounting/sales-commission-settlements/${draftId}`, managerHeaders)).parsed?.data?.totalAmount
    await totalInput.fill(value)
    await page.waitForTimeout(400)
    const alert = await page.getByRole('alert').filter({ hasText: '18자리까지' }).innerText()
    const storedAfter = (await direct('GET', `/accounting/sales-commission-settlements/${draftId}`, managerHeaders)).parsed?.data?.totalAmount
    results.digits.push({
      digits, input: await totalInput.inputValue(), screen: await totalDisplay.innerText(), payload: null,
      response: null, storedAndRequeried: storedAfter, status: 'UI_BLOCKED', alert,
      calculateRequestDelta: requestEvents.length - beforeCount, storedUnchanged: storedBefore === storedAfter,
    })
  }

  await page.getByRole('button', { name: '수기', exact: true }).click()
  const manualRate = page.getByLabel('수기 제경비율')
  await manualRate.waitFor({ state: 'visible' })
  await manualRate.fill('12.5')
  await page.waitForResponse((response) => {
    if (!response.url().endsWith('/calculate')) return false
    try { return response.request().postDataJSON()?.manualExpenseRate === '0.125' } catch { return false }
  })
  results.manualExpenseUi = { toggleVisible: true, inputVisible: await manualRate.isVisible(), inputValue: await manualRate.inputValue() }

  const raceCombos = [
    { a: '101', b: '202', aPreUpstreamDelayMs: 900, bPreUpstreamDelayMs: 0 },
    { a: '3030', b: '4040', aPreUpstreamDelayMs: 1350, bPreUpstreamDelayMs: 80 },
    { a: '50505', b: '60606', aPreUpstreamDelayMs: 700, bPreUpstreamDelayMs: 120 },
  ]
  for (let index = 0; index < raceCombos.length; index += 1) {
    const combo = raceCombos[index]
    activeRace = combo
    const start = requestEvents.length
    const aResponse = page.waitForResponse((response) => {
      if (!response.url().endsWith('/calculate')) return false
      try { return response.request().postDataJSON()?.total === combo.a } catch { return false }
    })
    const aRequest = page.waitForRequest((request) => {
      if (!request.url().endsWith('/calculate')) return false
      try { return request.postDataJSON()?.total === combo.a } catch { return false }
    })
    await totalInput.fill(combo.a)
    await aRequest
    const bResponse = page.waitForResponse((response) => {
      if (!response.url().endsWith('/calculate')) return false
      try { return response.request().postDataJSON()?.total === combo.b } catch { return false }
    })
    await totalInput.fill(combo.b)
    await bResponse
    await aResponse
    await page.waitForTimeout(150)
    const events = requestEvents.slice(start).filter((item) => item.total === combo.a || item.total === combo.b)
    const stored = (await direct('GET', `/accounting/sales-commission-settlements/${draftId}`, managerHeaders)).parsed?.data?.totalAmount
    const screenBeforeReload = await totalDisplay.innerText()
    const inputBeforeReload = await totalInput.inputValue()
    if (index === 0) {
      const raceShot = path.join(shotsDir, '03-out-of-order-screen-real-qa.png')
      await page.screenshot({ path: raceShot, fullPage: true })
      results.captures.push(raceShot)
    }
    activeRace = null
    await page.reload({ waitUntil: 'networkidle' })
    await page.getByRole('heading', { name: '정산 계산' }).waitFor({ state: 'visible' })
    const reloadedInput = await page.getByLabel('총 결제금액').inputValue()
    results.races.push({ combo, responseOrder: events.sort((x, y) => x.fulfilledAt - y.fulfilledAt).map((item) => item.total), inputBeforeReload, screenBeforeReload, storedAfterBoth: stored, reloadedInput })
  }

  await managerContext.close()
} catch (error) {
  results.errors.push(String(error?.stack ?? error))
  throw error
} finally {
  await browser.close()
  writeFileSync(path.join(artifactDir, 'results.json'), JSON.stringify(results, null, 2), 'utf8')
}
