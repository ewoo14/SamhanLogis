import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../../../../scripts/lib/qa-shots-dir.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '../../../..')
const artifactDir = resolveQaShotsDir(path.join(repo, 'docs', 'qa', '1248-sol-merge-verdict-r2'))
const shotsDir = resolveQaShotsDir(path.join(artifactDir, 'screenshots'))
mkdirSync(shotsDir, { recursive: true })

const isolatedGateway = 'http://127.0.0.1:28648'
const isolatedAccounting = 'http://127.0.0.1:29648'
const app = 'http://127.0.0.1:59648'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = {
  runtime: { headless: true, isolatedGateway, isolatedAccounting, app },
  gateway: {}, defect1: {}, defect2: [], defect3: {}, newReachableDefects: [],
  captures: [], requestEvents: [], errors: [],
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

async function direct(method, pathname, headers, body) {
  const response = await fetch(`${isolatedAccounting}${pathname}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  })
  const raw = await response.text()
  let parsed = null
  try { parsed = JSON.parse(raw) } catch {}
  return { status: response.status, raw, parsed }
}

function moneyLabel(value) {
  return `₩${String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
}

let browser
try {
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const login = await context.request.post(`${isolatedGateway}/auth/login`, {
    data: { loginId: 'dev_master', password: resolveQaCredential('QA_DEV_DEFAULT_PASSWORD') },
  })
  const loginBody = await login.json()
  const auth = loginBody?.data ?? {}
  const token = auth.token ?? auth.accessToken ?? ''
  if (login.status() !== 200 || !token) throw new Error(`격리 gateway 로그인 실패 HTTP ${login.status()}`)
  const catalog = await context.request.get(`${isolatedGateway}/auth/admin/menu-catalog`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  results.gateway = { loginStatus: login.status(), catalogStatus: catalog.status(), catalogBytes: Buffer.byteLength(await catalog.text(), 'utf8') }
  if (catalog.status() !== 200) throw new Error(`격리 gateway 메뉴 조회 실패 HTTP ${catalog.status()}`)

  await context.addInitScript(({ tok, r, uid, name }) => {
    Object.defineProperty(window, 'samhanAuth', { configurable: true, value: {
      getToken: async () => ({ token: tok, userId: uid, role: r, fullName: name, partnerCode: null }),
      setToken: async () => undefined,
      clearToken: async () => undefined,
    } })
  }, { tok: token, r: auth.role ?? 'MASTER', uid: auth.userId ?? '', name: auth.displayName ?? 'dev_master' })

  const headers = identityHeaders(token)
  const created = await direct('POST', '/accounting/sales-commission-settlements', headers, { settlementDate: '2026-08-17' })
  if (created.status !== 201) throw new Error(`격리 DRAFT 생성 실패 HTTP ${created.status}: ${created.raw}`)
  const draftId = created.parsed?.data?.id
  if (!draftId) throw new Error('격리 DRAFT id 없음')
  results.draftId = draftId

  const page = await context.newPage()
  let activeRace = null
  let delayedDetail = null

  await page.route('**/accounting/sales-commission-settlements**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const bodyText = request.postData()
    let body = null
    try { body = bodyText ? JSON.parse(bodyText) : null } catch {}
    const isCalculate = request.method() === 'POST' && url.pathname.endsWith('/calculate')
    const isDetail = request.method() === 'GET' && url.pathname.endsWith(`/${draftId}`)
    const event = {
      kind: isCalculate ? 'calculate' : isDetail ? 'detail' : 'other',
      total: body?.total ?? null,
      browserRequestAt: Date.now(), upstreamStartedAt: null, upstreamDoneAt: null, deliveredAt: null,
    }
    results.requestEvents.push(event)

    if (isCalculate && activeRace?.mode === 'whole-network' && body?.total === activeRace.a) {
      await sleep(activeRace.aBeforeUpstreamMs)
    }
    if (isCalculate && activeRace?.mode === 'response-only' && body?.total === activeRace.b) {
      await sleep(activeRace.bBeforeUpstreamMs)
    }
    event.upstreamStartedAt = Date.now()
    const upstream = await fetch(`${isolatedAccounting}${url.pathname}${url.search}`, {
      method: request.method(), headers, body: bodyText ?? undefined,
    })
    const raw = await upstream.text()
    event.upstreamDoneAt = Date.now()
    event.upstreamStatus = upstream.status

    if (isDetail && delayedDetail?.armed && !delayedDetail.captured) {
      delayedDetail.captured = true
      delayedDetail.snapshot = raw
      await sleep(delayedDetail.delayMs)
    }
    if (isCalculate && activeRace?.mode === 'response-only' && body?.total === activeRace.a) {
      await sleep(activeRace.aAfterUpstreamMs)
    }
    event.deliveredAt = Date.now()
    await route.fulfill({ status: upstream.status, contentType: 'application/json; charset=utf-8', body: raw })
  })

  const getTotalInput = () => page.getByLabel('총 결제금액')
  const getAmountDisplay = (label) => page.locator('dt', { hasText: label }).locator('..').locator('dd')
  const waitForCalculate = (total) => page.waitForResponse((response) => {
    if (!response.url().endsWith('/calculate') || response.request().method() !== 'POST') return false
    try { return response.request().postDataJSON()?.total === total } catch { return false }
  })
  const fillTotalAndWait = async (total) => {
    const response = waitForCalculate(total)
    await getTotalInput().fill(total)
    await response
  }
  const capture = async (name) => {
    const file = path.join(shotsDir, name)
    await page.screenshot({ path: file, fullPage: true })
    const rowCounts = {
      moneyInputRows: await page.locator('section[aria-label="영업수수료 계산 입력"] input[aria-label]').count(),
      resultRows: await page.locator('dl > div').count(),
      tableRows: await page.locator('table tbody tr').count(),
    }
    results.captures.push({ file, rowCounts })
  }

  await page.goto(`${app}/#/accounting/sales-commission-settlements`, { waitUntil: 'networkidle' })
  await page.locator('h3').filter({ hasText: '영업수수료 정산' }).waitFor({ state: 'visible' })
  const draftLink = page.locator(`[data-testid^="sales-commission-settlement-document-draft-"][href$="/${draftId}"]`)
  await draftLink.waitFor({ state: 'visible' })
  await draftLink.click()
  await page.getByRole('heading', { name: '정산 계산' }).waitFor({ state: 'visible' })

  // 결함 1: 실사용자가 다섯 금액을 연속 입력할 때 앞선 입력이 자동 저장 응답에 사라지지 않는지 확인한다.
  const detailGetsBefore = results.requestEvents.filter((event) => event.kind === 'detail').length
  const sequentialFields = [
    ['총 결제금액', 'total', '2000000'],
    ['장비대', 'equipment', '300000'],
    ['선지급', 'prepaid', '40000'],
    ['설치비', 'install', '50000'],
    ['안전관리비', 'safety', '6000'],
  ]
  const sequentialPayloads = []
  for (const [label, key, value] of sequentialFields) {
    const response = page.waitForResponse((candidate) => {
      if (!candidate.url().endsWith('/calculate') || candidate.request().method() !== 'POST') return false
      try { return candidate.request().postDataJSON()?.[key] === value } catch { return false }
    })
    await page.getByLabel(label).fill(value)
    const delivered = await response
    sequentialPayloads.push(delivered.request().postDataJSON())
  }
  await sleep(100)
  const defect1Stored = (await direct('GET', `/accounting/sales-commission-settlements/${draftId}`, headers)).parsed?.data
  const detailGetsAfter = results.requestEvents.filter((event) => event.kind === 'detail').length
  results.defect1 = {
    sequentialPayloads,
    finalInputs: {
      total: await getTotalInput().inputValue(),
      equipment: await page.getByLabel('장비대').inputValue(),
      prepaid: await page.getByLabel('선지급').inputValue(),
      install: await page.getByLabel('설치비').inputValue(),
      safety: await page.getByLabel('안전관리비').inputValue(),
    },
    finalScreenTotal: await getAmountDisplay('총액').innerText(),
    stored: {
      total: defect1Stored?.totalAmount, equipment: defect1Stored?.equipmentAmount,
      prepaid: defect1Stored?.prepaidAmount, install: defect1Stored?.installInputAmount,
      safety: defect1Stored?.safetyInputAmount,
    },
    detailGetDeltaDuringSequentialInput: detailGetsAfter - detailGetsBefore,
  }
  await capture('01-sequential-inputs-preserved-real-qa.png')

  // 결함 2: A는 서버 처리를 마친 뒤 응답 전달만 지연하고, B 응답을 먼저 실제 전달한다.
  const combos = [
    { a: '101', b: '202', aAfterUpstreamMs: 900, bBeforeUpstreamMs: 40 },
    { a: '3030', b: '4040', aAfterUpstreamMs: 1300, bBeforeUpstreamMs: 140 },
    { a: '50505', b: '60606', aAfterUpstreamMs: 700, bBeforeUpstreamMs: 20 },
  ]
  for (let index = 0; index < combos.length; index += 1) {
    const combo = combos[index]
    activeRace = { mode: 'response-only', ...combo }
    const start = results.requestEvents.length
    const aRequest = page.waitForRequest((request) => {
      if (!request.url().endsWith('/calculate')) return false
      try { return request.postDataJSON()?.total === combo.a } catch { return false }
    })
    const aResponse = waitForCalculate(combo.a)
    await getTotalInput().fill(combo.a)
    await aRequest
    const bResponse = waitForCalculate(combo.b)
    await getTotalInput().fill(combo.b)
    await bResponse
    await aResponse
    await sleep(100)
    const events = results.requestEvents.slice(start).filter((event) => event.kind === 'calculate' && (event.total === combo.a || event.total === combo.b))
    const stored = (await direct('GET', `/accounting/sales-commission-settlements/${draftId}`, headers)).parsed?.data?.totalAmount
    const beforeReload = {
      input: await getTotalInput().inputValue(), screen: await getAmountDisplay('총액').innerText(), stored,
    }
    activeRace = null
    await page.reload({ waitUntil: 'networkidle' })
    await page.getByRole('heading', { name: '정산 계산' }).waitFor({ state: 'visible' })
    results.defect2.push({
      combo,
      responseOrder: [...events].sort((x, y) => x.deliveredAt - y.deliveredAt).map((event) => event.total),
      upstreamOrder: [...events].sort((x, y) => x.upstreamDoneAt - y.upstreamDoneAt).map((event) => event.total),
      beforeReload,
      afterReload: { input: await getTotalInput().inputValue(), screen: await getAmountDisplay('총액').innerText() },
    })
    await capture(`0${index + 2}-response-inversion-${index + 1}-real-qa.png`)
  }

  // 신규 도달 경계: A 요청 자체가 늦어 B보다 서버에 나중에 도착하는 경우 저장 상태까지 확인한다.
  const wholeNetwork = { a: '717171', b: '828282', aBeforeUpstreamMs: 1000 }
  activeRace = { mode: 'whole-network', ...wholeNetwork }
  const wholeStart = results.requestEvents.length
  const wholeARequest = page.waitForRequest((request) => {
    if (!request.url().endsWith('/calculate')) return false
    try { return request.postDataJSON()?.total === wholeNetwork.a } catch { return false }
  })
  const wholeAResponse = waitForCalculate(wholeNetwork.a)
  await getTotalInput().fill(wholeNetwork.a)
  await wholeARequest
  const wholeBResponse = waitForCalculate(wholeNetwork.b)
  await getTotalInput().fill(wholeNetwork.b)
  await wholeBResponse
  await wholeAResponse
  await sleep(100)
  const wholeEvents = results.requestEvents.slice(wholeStart).filter((event) => event.kind === 'calculate' && (event.total === wholeNetwork.a || event.total === wholeNetwork.b))
  const wholeStored = (await direct('GET', `/accounting/sales-commission-settlements/${draftId}`, headers)).parsed?.data?.totalAmount
  const wholeBeforeReload = { input: await getTotalInput().inputValue(), screen: await getAmountDisplay('총액').innerText(), stored: wholeStored }
  await capture('05-whole-network-inversion-before-reload-real-qa.png')
  activeRace = null
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: '정산 계산' }).waitFor({ state: 'visible' })
  const wholeAfterReload = { input: await getTotalInput().inputValue(), screen: await getAmountDisplay('총액').innerText() }
  results.newReachableDefects.push({
    name: '요청 서버 도착 순서 역전 시 마지막 입력 B가 재진입 후 유지되지 않음',
    combo: wholeNetwork,
    responseOrder: [...wholeEvents].sort((x, y) => x.deliveredAt - y.deliveredAt).map((event) => event.total),
    upstreamOrder: [...wholeEvents].sort((x, y) => x.upstreamDoneAt - y.upstreamDoneAt).map((event) => event.total),
    beforeReload: wholeBeforeReload,
    afterReload: wholeAfterReload,
  })
  await capture('06-whole-network-inversion-after-reload-real-qa.png')

  // 결함 3: 정수 금액 저장 직후와 새로고침 후의 입력·결과 화면 문자열을 모두 확인한다.
  await fillTotalAndWait('1234567')
  await sleep(100)
  const beforeReload = {
    input: await getTotalInput().inputValue(),
    total: await getAmountDisplay('총액').innerText(),
    payout: await getAmountDisplay('지급액').innerText(),
  }
  await capture('07-integer-money-before-reload-real-qa.png')
  const stored = (await direct('GET', `/accounting/sales-commission-settlements/${draftId}`, headers)).parsed?.data
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: '정산 계산' }).waitFor({ state: 'visible' })
  const afterReload = {
    input: await getTotalInput().inputValue(),
    total: await getAmountDisplay('총액').innerText(),
    payout: await getAmountDisplay('지급액').innerText(),
  }
  results.defect3 = {
    expectedTotalLabel: moneyLabel('1234567'), beforeReload, storedTotal: stored?.totalAmount ?? null, afterReload,
    dotSixExposed: Object.values({ ...beforeReload, ...afterReload }).some((value) => String(value).includes('.000000')),
  }
  await capture('08-integer-money-after-reload-real-qa.png')

  await context.close()
} catch (error) {
  results.errors.push(String(error?.stack ?? error))
  throw error
} finally {
  if (browser) await browser.close()
  writeFileSync(path.join(artifactDir, 'results.json'), JSON.stringify(results, null, 2), 'utf8')
}
