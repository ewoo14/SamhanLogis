import { expect, test, type Page, type Route } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const here = path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5952'
const INVENTORY = process.env['BRANCH_INVENTORY_BASE'] ?? 'http://127.0.0.1:28185'
const SLIP = process.env['BRANCH_SLIP_BASE'] ?? 'http://127.0.0.1:28186'
const FROM = '2025-01-01'
const TO = '2026-08-17'
const ROOT = resolveQaShotsDir(path.resolve(here, '../../../../docs/qa/1271-sol-reverdict-3'))
const SHOTS = path.join(ROOT, 'screenshots')
const INPUTS = path.join(ROOT, 'inputs')
fs.mkdirSync(SHOTS, { recursive: true })
fs.mkdirSync(INPUTS, { recursive: true })

type InboundRow = {
  slipNo: string
  slipDate: string
  partnerCode: string | null
  partnerName: string | null
  productCode: string
  productName: string | null
  quantity: number
  totalAmount: number
}

type Stats = { inbound: number; dps: number; matched: number; mismatch: number; details: number }
type ProxyRecord = { at: number; method: string; path: string; status: number; saveMode?: string }

const proxyRecords: ProxyRecord[] = []
const browserRequests: { at: number; method: string; url: string }[] = []
let authToken = ''
let authUserId = ''

function makeXlsx(
  rows: InboundRow[],
  fileName: string,
  options: { amountIndex?: number; qtyIndex?: number; normalizeIndex?: number; duplicateIndex?: number } = {},
): string {
  const jsonPath = path.join(INPUTS, `${fileName}.json`)
  fs.writeFileSync(jsonPath, JSON.stringify({ rows, ...options }), 'utf8')
  const xlsxPath = path.join(INPUTS, `${fileName}.xlsx`)
  const python = [
    'import json, sys',
    'from openpyxl import Workbook',
    'p=json.load(open(sys.argv[1], encoding="utf-8"))',
    'wb=Workbook(); ws=wb.active; ws.title="DPS 원본"',
    'ws.append(["DPS 입고 내역 export"]); ws.append(["조회 원본"]); ws.append(["표지"])',
    'ws.append(["납품일자","납품번호","모델","수량","매입단가","공급가","인도처명","부가세","합계"])',
    'def append_row(r, idx, extra=False):',
    '  total=float(r.get("totalAmount") or 0); qty=int(r.get("quantity") or 0)',
    '  model=r.get("productCode")',
    '  if idx == p.get("amountIndex",-1): total += 1000',
    '  if idx == p.get("qtyIndex",-1): qty += 1',
    '  if idx == p.get("normalizeIndex",-1): model = str(model) + "[verify]"',
    '  if extra: qty += 1',
    '  ws.append([r.get("slipDate"),r.get("slipNo"),model,qty,0,total,r.get("partnerName") or "",0,total])',
    'for i,r in enumerate(p["rows"]):',
    '  if i == p.get("duplicateIndex",-1): append_row(r,i,True)',
    '  append_row(r,i,False)',
    'wb.save(sys.argv[2])',
  ].join('\n')
  execFileSync('python', ['-', jsonPath, xlsxPath], { input: python, stdio: ['pipe', 'pipe', 'pipe'] })
  return xlsxPath
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${authToken}`,
    'X-Samhan-Gateway-Attestation': resolveQaCredential('SAMHAN_GATEWAY_ATTESTATION'),
    'X-User-Id': authUserId,
    'X-User-Groups': 'MANAGER',
    'X-User-Role': 'MANAGER',
    'X-Is-System-Master': 'false',
    'X-Is-Partner': 'false',
    'X-User-Name': 'DEV-MANAGER',
  }
}

async function proxy(route: Route, targetBase: string): Promise<void> {
  const request = route.request()
  const source = new URL(request.url())
  const target = `${targetBase}${source.pathname}${source.search}`
  let saveMode: string | undefined
  if (request.method() === 'POST' && source.pathname.endsWith('/dps-history')) {
    try { saveMode = (request.postDataJSON() as { saveMode?: string }).saveMode } catch { /* evidence only */ }
  }
  const response = await route.fetch({ url: target, headers: { ...request.headers(), ...authHeaders() } })
  proxyRecords.push({ at: Date.now(), method: request.method(), path: source.pathname + source.search, status: response.status(), saveMode })
  await route.fulfill({ response })
}

async function installRoutes(page: Page): Promise<void> {
  page.on('request', (request) => browserRequests.push({ at: Date.now(), method: request.method(), url: request.url() }))
  await page.route('**/warehouse/audit/dps-history**', (route) => proxy(route, INVENTORY))
}

async function login(page: Page): Promise<void> {
  const loginResponse = await page.request.post('http://localhost:8080/auth/login', {
    data: {
      loginId: resolveQaCredential('QA_DEV_MANAGER_LOGIN_ID'),
      password: resolveQaCredential('QA_DEV_MANAGER_PASSWORD'),
    },
  })
  expect(loginResponse.status()).toBe(200)
  const loginJson = await loginResponse.json() as { data?: { token?: string; userId?: string } }
  authToken = loginJson.data?.token ?? ''
  authUserId = loginJson.data?.userId ?? ''
  expect(authToken).not.toBe('')
  await page.goto(`${BASE_URL}/#/warehouse/dps-compare`)
  const loginButton = page.getByRole('button', { name: '로그인', exact: true })
  await loginButton.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined)
  if (await loginButton.isVisible().catch(() => false)) {
    await page.locator('input').nth(0).fill(resolveQaCredential('QA_DEV_MANAGER_LOGIN_ID'))
    await page.locator('input').nth(1).fill(resolveQaCredential('QA_DEV_MANAGER_PASSWORD'))
    await expect(loginButton).toBeEnabled({ timeout: 10_000 })
    await loginButton.click()
  }
  await expect(page.getByText('DPS 입고 비교', { exact: true }).first()).toBeVisible({ timeout: 60_000 })
  await page.evaluate(() => {
    ;(window as unknown as { __dpsHeaderMissing: number[] }).__dpsHeaderMissing = []
    const observer = new MutationObserver(() => {
      if (!document.body.innerText.includes('DPS 입고 비교')) {
        ;(window as unknown as { __dpsHeaderMissing: number[] }).__dpsHeaderMissing.push(Date.now())
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
  })
}

async function readStats(page: Page): Promise<Stats> {
  const body = await page.locator('body').innerText()
  const num = (label: string) => Number((body.match(new RegExp(`${label}\\s*([\\d,]+)`))?.[1] ?? '0').replace(/,/g, ''))
  return {
    inbound: num('입고전표 라인'),
    dps: num('DPS 행'),
    matched: num('정상 일치'),
    mismatch: num('불일치'),
    details: await page.locator('[data-testid="dps-compare-result-table"] tbody tr').count(),
  }
}

async function runFile(page: Page, filePath: string, shotName: string): Promise<Stats> {
  const compareHandler = async (route: Route) => {
    const response = await page.request.post(`${INVENTORY}/warehouse/audit/dps-compare`, {
      headers: authHeaders(),
      multipart: {
        file: {
          name: path.basename(filePath),
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          buffer: fs.readFileSync(filePath),
        },
        from: FROM,
        to: TO,
        groupBy: 'SLIP',
      },
    })
    const source = new URL(route.request().url())
    proxyRecords.push({ at: Date.now(), method: 'POST', path: source.pathname, status: response.status() })
    await route.fulfill({ status: response.status(), headers: response.headers(), body: await response.body() })
  }
  await page.route('**/warehouse/audit/dps-compare', compareHandler)
  await page.getByTestId('dps-history-tab-run').click()
  await page.getByTestId('dps-compare-from').fill(FROM)
  await page.getByTestId('dps-compare-to').fill(TO)
  await page.getByTestId('dps-compare-file-input').setInputFiles(filePath)
  const start = proxyRecords.length
  await page.getByTestId('dps-compare-run-button').click()
  await expect.poll(() => proxyRecords.slice(start).some((r) => r.path.startsWith('/warehouse/audit/dps-compare') && r.status === 200), { timeout: 60_000 }).toBeTruthy()
  await expect(page.getByText(/불일치 상세/)).toBeVisible({ timeout: 60_000 })
  const stats = await readStats(page)
  await page.screenshot({ path: path.join(SHOTS, shotName), fullPage: true })
  await page.unroute('**/warehouse/audit/dps-compare', compareHandler)
  return stats
}

async function openHistory(page: Page, mode: 'AUTO_LATEST' | 'MANUAL_NAMED'): Promise<number> {
  await page.getByTestId('dps-history-tab-list').click()
  await page.locator('select').selectOption(mode)
  await page.getByRole('button', { name: '조회', exact: true }).click()
  await expect(page.locator('table')).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(800)
  return page.locator('tbody tr[data-testid^="dps-history-row-"]').count()
}

async function expectRestored(page: Page, topicFragment?: string): Promise<Stats> {
  await expect(page.getByText(topicFragment ? new RegExp(`복원:.*${topicFragment}`) : /복원:/).first()).toBeVisible({ timeout: 30_000 })
  const expected = { inbound: 77, dps: 77, matched: 77, mismatch: 0, details: 0 }
  await expect.poll(() => readStats(page), { timeout: 30_000 }).toEqual(expected)
  return readStats(page)
}

test('PR 1271 3회차 저장 왕복·과다 갱신·6축 회귀를 실제 화면에서 재판정한다', async ({ page }) => {
  const internalToken = resolveQaCredential('SAMHAN_INTERNAL_TOKEN')
  const sourceResponse = await page.request.get(`${SLIP}/internal/slips/inbound-lines?from=${FROM}&to=${TO}`, {
    headers: { 'X-Internal-Token': internalToken },
  })
  expect(sourceResponse.status()).toBe(200)
  const sourceJson = await sourceResponse.json() as { data?: InboundRow[] }
  const rows = sourceJson.data ?? []
  expect(rows).toHaveLength(77)
  const amountIndex = rows.findIndex((row) => Number(row.totalAmount) > 0)
  const qtyIndex = rows.findIndex((_row, index) => index !== amountIndex)
  const normalizeIndex = rows.findIndex((row) => row.productCode === '0000098')
  expect(Math.min(amountIndex, qtyIndex, normalizeIndex)).toBeGreaterThanOrEqual(0)

  const aFile = makeXlsx(rows, 'A-cover-3-header-row-4')
  const cFile = makeXlsx(rows, 'C-amount-mismatch', { amountIndex })
  const dFile = makeXlsx(rows, 'D-quantity-mismatch', { qtyIndex })
  const bFile = makeXlsx(rows, 'B-all-match')
  const eFile = makeXlsx(rows, 'E-model-normalization', { normalizeIndex })
  const fFile = makeXlsx(rows, 'F-duplicate-exact-first', { duplicateIndex: normalizeIndex })

  await installRoutes(page)
  await login(page)

  const autoBefore = await openHistory(page, 'AUTO_LATEST')
  await page.screenshot({ path: path.join(SHOTS, '01-auto-before-list-real-qa.png'), fullPage: true })
  const a = await runFile(page, aFile, '07-A-cover3-header4-77-77-77-0-real-qa.png')
  expect(a).toEqual({ inbound: 77, dps: 77, matched: 77, mismatch: 0, details: 0 })
  await expect.poll(() => proxyRecords.some((r) => r.method === 'POST' && r.saveMode === 'AUTO_LATEST' && r.status === 200), { timeout: 30_000 }).toBeTruthy()
  const autoSavedAt = Math.max(...proxyRecords.filter((r) => r.method === 'POST' && r.saveMode === 'AUTO_LATEST' && r.status === 200).map((r) => r.at))
  const autoAfter = await openHistory(page, 'AUTO_LATEST')
  expect(autoAfter).toBe(autoBefore + 1)
  await page.screenshot({ path: path.join(SHOTS, '02-auto-after-list-1-row-real-qa.png'), fullPage: true })
  const autoDetailStart = proxyRecords.length
  await page.locator('tbody tr[data-testid^="dps-history-row-"]').first().click()
  const autoRestored = await expectRestored(page)
  await expect.poll(() => proxyRecords.slice(autoDetailStart).some((r) => r.method === 'GET' && /\/dps-history\/[0-9a-f-]+$/.test(r.path) && r.status === 200)).toBeTruthy()
  await page.screenshot({ path: path.join(SHOTS, '03-auto-row-click-restored-77-77-77-0-real-qa.png'), fullPage: true })

  const manualBefore = await openHistory(page, 'MANUAL_NAMED')
  await page.screenshot({ path: path.join(SHOTS, '04-manual-before-list-real-qa.png'), fullPage: true })
  await page.getByTestId('dps-history-tab-run').click()
  const topic = `SOL 3회차 명시 저장 ${Date.now()}`
  await page.getByTestId('dps-history-save-button').click()
  await page.getByTestId('dps-history-topic-input').fill(topic)
  const manualWindowStart = Date.now()
  const manualProxyStart = proxyRecords.length
  const navigationBefore = await page.evaluate(() => performance.getEntriesByType('navigation').length)
  await page.getByRole('button', { name: '저장', exact: true }).click()
  await expect(page.getByText(topic, { exact: true })).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(1_000)
  const manualAfter = await page.locator('tbody tr[data-testid^="dps-history-row-"]').count()
  expect(manualAfter).toBe(manualBefore + 1)
  const manualWindowEnd = Date.now()
  const navigationAfter = await page.evaluate(() => performance.getEntriesByType('navigation').length)
  await page.screenshot({ path: path.join(SHOTS, '05-manual-after-list-1-row-real-qa.png'), fullPage: true })
  const manualDetailStart = proxyRecords.length
  await page.getByText(topic, { exact: true }).click()
  const manualRestored = await expectRestored(page, 'SOL 3회차 명시 저장')
  await expect.poll(() => proxyRecords.slice(manualDetailStart).some((r) => r.method === 'GET' && /\/dps-history\/[0-9a-f-]+$/.test(r.path) && r.status === 200)).toBeTruthy()
  await page.screenshot({ path: path.join(SHOTS, '06-manual-row-click-restored-77-77-77-0-real-qa.png'), fullPage: true })

  const c = await runFile(page, cFile, '08-C-amount-mismatch-77-77-76-1-real-qa.png')
  expect(c).toEqual({ inbound: 77, dps: 77, matched: 76, mismatch: 1, details: 1 })
  await expect(page.getByText('합계금액 불일치', { exact: true }).first()).toBeVisible()
  const d = await runFile(page, dFile, '09-D-quantity-mismatch-77-77-76-1-real-qa.png')
  expect(d).toEqual({ inbound: 77, dps: 77, matched: 76, mismatch: 1, details: 1 })
  await expect(page.getByText('수량 불일치', { exact: true }).first()).toBeVisible()
  const b = await runFile(page, bFile, '10-B-all-match-77-77-77-0-real-qa.png')
  expect(b).toEqual({ inbound: 77, dps: 77, matched: 77, mismatch: 0, details: 0 })
  const e = await runFile(page, eFile, '11-E-normalization-77-77-77-0-real-qa.png')
  expect(e).toEqual({ inbound: 77, dps: 77, matched: 77, mismatch: 0, details: 0 })
  const f = await runFile(page, fFile, '12-F-duplicate-exact-first-77-78-77-1-real-qa.png')
  expect(f).toEqual({ inbound: 77, dps: 78, matched: 77, mismatch: 1, details: 1 })

  const manualProxy = proxyRecords.slice(manualProxyStart).filter((r) => r.at <= manualWindowEnd)
  const autoAfterSaveProxy = proxyRecords.filter((r) => r.at >= autoSavedAt && r.at < manualWindowStart)
  const unrelatedDuringManual = browserRequests.filter((r) => r.at >= manualWindowStart && r.at <= manualWindowEnd && r.method === 'GET' && !r.url.includes('/warehouse/audit/dps-history'))
  const headerMissingEvents = await page.evaluate(() => (window as unknown as { __dpsHeaderMissing: number[] }).__dpsHeaderMissing)

  fs.writeFileSync(path.join(ROOT, 'measured-summary.json'), JSON.stringify({
    sourceRows: rows.length,
    lists: { autoBefore, autoAfter, manualBefore, manualAfter },
    restores: { auto: autoRestored, manual: manualRestored },
    regressions: { a, c, d, b, e, f },
    refreshScope: {
      autoAfterSaveProxy,
      manualProxy,
      unrelatedGetCountDuringManual: unrelatedDuringManual.length,
      unrelatedGetsDuringManual: unrelatedDuringManual.map((r) => new URL(r.url).pathname),
      navigationBefore,
      navigationAfter,
      headerMissingEvents,
    },
    proxyRecords,
  }, null, 2), 'utf8')
})

test('과거 형식 저장내역을 최신 자동저장으로 복원할 때 실제 화면 동작을 확인한다', async ({ page }) => {
  await installRoutes(page)
  await login(page)

  const legacyPayload = {
    from: '2026-05-01',
    to: '2026-05-16',
    groupBy: 'SLIP',
    outboundCount: 18,
    dpsRowCount: 18,
    matchedCount: 16,
    mismatchCount: 2,
    mismatches: [{
      rowType: 'QUANTITY_MISMATCH',
      slipNo: '2026/05/16-1',
      productCode: 'AJ052RXH5BC1',
      partnerCode: 'P-001',
      expectedQty: 5,
      actualQty: 4,
      reason: '수량 불일치 — 출고: 5 / DPS: 4',
    }],
  }
  const saved = await page.request.post(`${INVENTORY}/warehouse/audit/dps-history`, {
    headers: authHeaders(),
    data: {
      programType: 'DPS_COMPARE',
      saveMode: 'AUTO_LATEST',
      requestParams: { from: '2026-05-01', to: '2026-05-16', groupBy: 'SLIP' },
      responsePayload: legacyPayload,
    },
  })
  expect(saved.status()).toBe(200)

  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Unexpected Application Error!')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/Cannot read properties of undefined.*toLocaleString/).first()).toBeVisible()
  await page.screenshot({ path: path.join(SHOTS, '13-legacy-history-restore-runtime-error-real-qa.png'), fullPage: true })
})
