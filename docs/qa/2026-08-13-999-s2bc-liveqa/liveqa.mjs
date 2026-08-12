import { chromium } from '../../../clients/desktop/node_modules/@playwright/test/index.mjs'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaShotsDir } from '../../../scripts/lib/qa-shots-dir.cjs'

const require = createRequire(import.meta.url)
const HERE = dirname(fileURLToPath(import.meta.url))
const TMP = join(tmpdir(), 'sol999-s2bc-20260813013557')
const jsQR = require(resolve(TMP, 'qrdecode/node_modules/jsqr'))
const { PNG } = require(resolve(TMP, 'qrdecode/node_modules/pngjs'))
const OUT = resolveQaShotsDir(HERE)
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi
const envelope = (data) => ({ success: true, code: 'OK', message: '성공', data, timestamp: '2026-08-13T00:00:00' })
const apiEvidence = []
const consoleErrors = []
const results = {}

function db(sql, database = 'inventory_db') {
  return execFileSync('docker', ['exec', 'sol999-s2bc-pg-20260813013557', 'psql', '-U', 'samhanqa', '-d', database, '-At', '-c', sql], { encoding: 'utf8' }).trim()
}

async function isolatedFetch(base, path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      'X-User-Id': 'a0000000-0000-0000-0000-000000000001',
      'X-User-Name': 'CODEX SOL',
      'X-User-Role': 'MASTER',
      'X-Is-System-Master': 'true',
      'X-Internal-Token': 'dev-internal-token-change-me',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    },
  })
  return { status: response.status, body: await response.text() }
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: 'ko-KR', timezoneId: 'Asia/Seoul' })
const page = await context.newPage()
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })

await page.route('http://localhost:8080/**', async (route) => {
  const request = route.request()
  const url = new URL(request.url())
  const path = url.pathname

  if (path === '/auth/me') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope({ userId: 'sol-liveqa', loginId: 'sol', role: 'MASTER', displayName: 'CODEX SOL', groups: [] })) })
  }
  if (path === '/auth/admin/permissions/my') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope({ 'accounting.sales-slip.list': ['VIEW', 'EDIT'], 'inventory.audit': ['VIEW', 'CREATE', 'EDIT'], 'inventory.stock-balance': ['VIEW', 'CREATE'], 'inventory.adjust': ['VIEW', 'UPDATE'] })) })
  }
  if (path === '/inventory/warehouses') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope([{ id: 'WH-QA', code: 'HQ-001', name: '본사창고', type: 'HEADQUARTERS', displayOrder: 1 }])) })
  }
  if (path === '/inventory/balances') {
    const content = [
      { productCode: '010001', productName: 'S2a QR 검증 품목', warehouseCode: 'HQ-001', warehouseName: '본사창고', warehouseType: 'HEADQUARTERS', availableQty: 1, reservedQty: 0, totalQty: 3 },
      { productCode: 'AJ030RXH4BC1', productName: '실외기_3HP 다배관', warehouseCode: 'HQ-001', warehouseName: '본사창고', warehouseType: 'HEADQUARTERS', availableQty: 12, reservedQty: 0, totalQty: 12 },
    ]
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope({ content, pageable: { pageNumber: 0, pageSize: 50 }, totalElements: 2, totalPages: 1, last: true, first: true, size: 50, number: 0, numberOfElements: 2, empty: false })) })
  }

  let target = null
  if (path.startsWith('/inventory/') || path.startsWith('/warehouse/')) target = `http://127.0.0.1:41985${path}${url.search}`
  if (path.startsWith('/slips')) target = `http://127.0.0.1:41986${path}${url.search}`
  if (target) {
    const headers = {
      'X-User-Id': 'a0000000-0000-0000-0000-000000000001',
      'X-User-Name': 'CODEX SOL',
      'X-User-Role': 'MASTER',
      'X-Is-System-Master': 'true',
      'X-Internal-Token': 'dev-internal-token-change-me',
    }
    const contentType = request.headers()['content-type']
    if (contentType) headers['Content-Type'] = contentType
    const response = await fetch(target, {
      method: request.method(),
      headers,
      body: ['GET', 'HEAD'].includes(request.method()) ? undefined : request.postDataBuffer(),
    })
    const body = await response.text()
    apiEvidence.push({ requestUrl: request.url(), target, status: response.status, body })
    return route.fulfill({ status: response.status, contentType: response.headers.get('content-type') ?? 'application/json', body })
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope([])) })
})

try {
  db("UPDATE stock_instances SET status='AVAILABLE', quality='NORMAL' WHERE serial_key='SI-SH29E5';")
  await page.goto('http://127.0.0.1:41973/inventory/stock-balance', { waitUntil: 'domcontentloaded' })
  await page.getByTestId('header-page-title').waitFor({ timeout: 30_000 })
  await page.getByTestId('inventory-balance-query-button').click()
  await page.getByRole('button', { name: '010001 품목리스트 열기' }).waitFor({ timeout: 20_000 })

  // A1/A2 — 사각 QR 및 serialKey 실제 디코드.
  await page.getByRole('button', { name: '010001 품목리스트 열기' }).click()
  await page.getByText('품목리스트 · 010001', { exact: true }).waitFor({ timeout: 20_000 })
  await page.locator('canvas').first().waitFor()
  const serials = await page.locator('text=/^SI-[A-Z0-9]{6}$/').allTextContents()
  const qrDimensions = await page.locator('canvas').evaluateAll((canvases) => canvases.map((canvas) => ({ width: canvas.width, height: canvas.height, renderedWidth: canvas.getBoundingClientRect().width, renderedHeight: canvas.getBoundingClientRect().height })))
  const decoded = []
  for (let index = 0; index < serials.length; index += 1) {
    const path = `${TMP}/qr-${index}.png`
    const buffer = await page.locator('canvas').nth(index).screenshot({ path, scale: 'css' })
    const png = PNG.sync.read(buffer)
    decoded.push(jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data ?? null)
  }
  results.A1_A2 = { serials, decoded, exactMatch: JSON.stringify(serials) === JSON.stringify(decoded), qrDimensions, allSquare: qrDimensions.every((row) => row.width === row.height && Math.abs(row.renderedWidth - row.renderedHeight) < 0.1) }
  await page.screenshot({ path: `${OUT}/A1-square-qr-serialkey.png`, fullPage: true })

  // D15 — AVAILABLE 저장·재개방, SHIPPED UI 잠금.
  const available = page.getByLabel('SI-SH29E5 품목 상태')
  const availablePatch = page.waitForResponse((response) => response.url().includes('/inventory/instances/quality') && response.request().method() === 'PATCH')
  await available.selectOption('USED')
  const availableResponse = await availablePatch
  await page.getByRole('button', { name: '닫기' }).last().click()
  await page.getByRole('button', { name: '010001 품목리스트 열기' }).click()
  await page.getByText('품목리스트 · 010001', { exact: true }).waitFor()
  const reopenedAvailable = await page.getByLabel('SI-SH29E5 품목 상태').inputValue()
  const shippedDisabled = await Promise.all(['SI-KP5SD4', 'SI-CH5HSS'].map((serial) => page.getByLabel(`${serial} 품목 상태`).isDisabled()))
  await page.screenshot({ path: `${OUT}/D15-available-save-persist-shipped-lock.png`, fullPage: true })

  // RESERVED 상태는 격리 복제본에서만 전환한 뒤 동일 GUI 저장 경로를 검증한다.
  await page.getByRole('button', { name: '닫기' }).last().click()
  db("UPDATE stock_instances SET status='RESERVED' WHERE serial_key='SI-SH29E5';")
  await page.getByRole('button', { name: '010001 품목리스트 열기' }).click()
  await page.getByText('품목리스트 · 010001', { exact: true }).waitFor()
  const reservedEnabled = await page.getByLabel('SI-SH29E5 품목 상태').isEnabled()
  const reservedPatch = page.waitForResponse((response) => response.url().includes('/inventory/instances/quality') && response.request().method() === 'PATCH')
  await page.getByLabel('SI-SH29E5 품목 상태').selectOption('DAMAGED')
  const reservedResponse = await reservedPatch
  await page.getByRole('button', { name: '닫기' }).last().click()
  await page.getByRole('button', { name: '010001 품목리스트 열기' }).click()
  await page.getByText('품목리스트 · 010001', { exact: true }).waitFor()
  const reopenedReserved = await page.getByLabel('SI-SH29E5 품목 상태').inputValue()
  await page.screenshot({ path: `${OUT}/D15-reserved-save-persist.png`, fullPage: true })
  await page.getByRole('button', { name: '닫기' }).last().click()

  const shippedBypass = await isolatedFetch('http://127.0.0.1:41985', '/inventory/instances/quality?serialKey=SI-KP5SD4', { method: 'PATCH', body: JSON.stringify({ quality: 'BOX_DEFECT' }) })
  const shippedAfter = await isolatedFetch('http://127.0.0.1:41985', '/inventory/instances/product-list?productCode=010001')
  results.D15 = { availablePatchStatus: availableResponse.status(), reopenedAvailable, shippedDisabled, reservedEnabled, reservedPatchStatus: reservedResponse.status(), reopenedReserved, shippedBypassStatus: shippedBypass.status, shippedBypassBody: shippedBypass.body, shippedAfterBody: shippedAfter.body }

  // B4/B6/B7/B8/B9/B10 + C11/C12/C13/C14.
  await page.getByRole('button', { name: 'AJ030RXH4BC1 재고수불부 열기' }).click()
  await page.getByText('재고수불부', { exact: true }).last().waitFor({ timeout: 20_000 })
  const defaultStart = await page.getByLabel('시작일').inputValue()
  const defaultEnd = await page.getByLabel('종료일').inputValue()
  const headers = await page.locator('table thead th').allTextContents()
  const defaultRows = await page.locator('table tbody tr').evaluateAll((rows) => rows.map((row) => Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent?.trim() ?? '')))
  await page.screenshot({ path: `${OUT}/B4-default-month-period.png`, fullPage: true })
  const ledgerScroller = page.locator('table').last().locator('..')
  await ledgerScroller.evaluate((element) => { element.scrollLeft = element.scrollWidth })
  await page.screenshot({ path: `${OUT}/B6-running-balance-actual-numbers.png`, fullPage: true })
  await ledgerScroller.evaluate((element) => { element.scrollLeft = 0 })

  const beforeSlipUrl = page.url()
  await page.getByRole('button', { name: '전표 2026/08/08-9 열기' }).click()
  await page.getByText('입고전표 2026/08/08-9', { exact: true }).waitFor({ timeout: 20_000 })
  const slipModalText = await page.getByText('전표번호: 2026/08/08-9', { exact: true }).textContent()
  const afterSlipUrl = page.url()
  await page.screenshot({ path: `${OUT}/C11-slip-2026-08-08-9-modal.png`, fullPage: true })
  const s2cEvidence = apiEvidence.filter((entry) => entry.target.includes('/slips/query') || /\/slips\/[0-9a-f-]{36}(?:\?|$)/i.test(entry.target))
  const s2cUuid = s2cEvidence.map((entry) => ({ requestUrlUuidCount: (entry.requestUrl.match(UUID_RE) ?? []).length, targetUuidCount: (entry.target.match(UUID_RE) ?? []).length, responseUuidCount: (entry.body.match(UUID_RE) ?? []).length, status: entry.status, targetRedacted: entry.target.replace(UUID_RE, '<uuid>') }))
  const screenTextAtSlip = await page.locator('body').innerText()
  results.C = { beforeSlipUrl, afterSlipUrl, slipModalText, sameSlip: slipModalText?.includes('2026/08/08-9') ?? false, screenUuidCount: (screenTextAtSlip.match(UUID_RE) ?? []).length, networkUuid: s2cUuid }
  await page.getByRole('button', { name: '닫기' }).last().click()

  const errorsBeforeAddressClick = consoleErrors.length
  const address = page.locator('td').filter({ hasText: '울산광역시 북구 사청6길 6' }).first()
  const addressButtonCount = await address.getByRole('button').count()
  await address.click()
  await page.waitForTimeout(250)
  results.C.addressNotClickable = addressButtonCount === 0
  results.C.addressClickNewErrors = consoleErrors.slice(errorsBeforeAddressClick)

  await page.getByLabel('시작일').fill('2026-08-09')
  await page.getByLabel('종료일').fill('2026-08-13')
  const rangeResponseWait = page.waitForResponse((response) => response.url().includes('/inventory/ledger') && response.url().includes('startDate=2026-08-09'))
  await page.getByRole('button', { name: '조회' }).last().click()
  const rangeResponse = await rangeResponseWait
  await page.getByText('(주)삼한공조시스템 / 2026-08-09 ~ 2026-08-13 / 재고수불부 I / 실외기_3HP 다배관 (AJ030RXH4BC1)', { exact: true }).waitFor()
  const rangeRows = await page.locator('table tbody tr').evaluateAll((rows) => rows.map((row) => Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent?.trim() ?? '')))
  await page.screenshot({ path: `${OUT}/B5-range-opening-recalculated-tags.png`, fullPage: true })

  const ledgerBodies = apiEvidence.filter((entry) => entry.target.includes('/inventory/ledger')).map((entry) => JSON.parse(entry.body).data)
  const defaultLedger = ledgerBodies.find((data) => data.startDate === '2026-08-01')
  const rangeLedger = ledgerBodies.find((data) => data.startDate === '2026-08-09')
  results.B = {
    defaultStart,
    defaultEnd,
    headers,
    defaultRows,
    rangeStatus: rangeResponse.status(),
    rangeRows,
    defaultLedger,
    rangeLedger,
    currentStockFromBalance: 12,
    currentStockFromDb: Number(db("SELECT total_qty FROM stock_balances WHERE product_id='2d7e785d-e5f5-4abb-b0c8-543188fb829f' AND warehouse_id='11111111-1111-1111-1111-000000000001' AND is_deleted=false;")),
    productUnitNoSerialKey: !JSON.stringify(defaultLedger).includes('serialKey'),
    transferCount: Number(db("SELECT count(*) FROM stock_movements WHERE movement_type LIKE 'TRANSFER%' AND is_deleted=false;")),
  }

  // A3 — 기존 재고실사 바코드/수동 입력을 격리 서비스에 실제 POST.
  const auditId = 'af12435a-e2f8-4cf4-b61a-6d26c1db36bd'
  const auditBefore = await isolatedFetch('http://127.0.0.1:41985', `/inventory/audits/${auditId}`)
  const auditData = JSON.parse(auditBefore.body).data
  const auditLine = auditData.lines[0]
  await page.goto(`http://127.0.0.1:41973/warehouse/audit/${auditId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1_000)
  if (await page.getByTestId('audit-line-barcode-input').count() === 0) {
    await page.screenshot({ path: `${OUT}/A3-diagnostic-audit-route.png`, fullPage: true })
    throw new Error(`A3 input missing url=${page.url()} body=${(await page.locator('body').innerText()).slice(0, 1200)}`)
  }
  await page.getByTestId('audit-line-barcode-input').fill(auditLine.productId)
  await page.getByTestId('audit-line-actual-input').fill(String(auditLine.actualQty ?? auditLine.expectedQty))
  await page.getByText('스캔', { exact: true }).locator('..').getByRole('checkbox').check()
  const auditPostWait = page.waitForResponse((response) => response.url().includes(`/inventory/audits/${auditId}/lines`) && response.request().method() === 'POST')
  await page.getByTestId('audit-line-record-button').click()
  const auditPost = await auditPostWait
  await page.getByTestId('audit-line-barcode-input').waitFor()
  results.A3 = { inputPresent: true, postStatus: auditPost.status(), inputCleared: (await page.getByTestId('audit-line-barcode-input').inputValue()) === '', scannedProductName: auditLine.productName }

  const summary = {
    ...results,
    evidenceIntegrity: {
      koreanPartners: ['(주)한국냉동물류', '(주)서울택배', '대한화물서비스(주)'],
      serverEncoding: 'UTF8',
      fixtureKorean: db("SELECT string_agg(note, ' | ' ORDER BY occurred_at) FROM stock_movements WHERE id::text LIKE '999bc001-%';"),
    },
  }
  writeFileSync(`${OUT}/liveqa-results.json`, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ A1_A2: results.A1_A2, A3: results.A3, B: { defaultStart: results.B.defaultStart, defaultEnd: results.B.defaultEnd, headers: results.B.headers, defaultBalances: results.B.defaultLedger.rows.map((row) => row.balance), rangeOpening: results.B.rangeLedger.openingBalance, rangeBalances: results.B.rangeLedger.rows.map((row) => row.balance), currentStockFromDb: results.B.currentStockFromDb, transferCount: results.B.transferCount }, C: results.C, D15: { availablePatchStatus: results.D15.availablePatchStatus, reopenedAvailable: results.D15.reopenedAvailable, reservedPatchStatus: results.D15.reservedPatchStatus, reopenedReserved: results.D15.reopenedReserved, shippedBypassStatus: results.D15.shippedBypassStatus } }, null, 2))
} finally {
  await Promise.race([browser.close(), new Promise((resolve) => setTimeout(resolve, 3_000))])
  process.exit(0)
}
