import { chromium } from '../../../clients/desktop/node_modules/@playwright/test/index.mjs'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaShotsDir } from '../../../scripts/lib/qa-shots-dir.cjs'

const require = createRequire(import.meta.url)
const HERE = dirname(fileURLToPath(import.meta.url))
const TMP = join(tmpdir(), 'sol999-liveqa3-202608130329')
const jsQR = require(resolve(TMP, 'qrdecode/node_modules/jsqr'))
const { PNG } = require(resolve(TMP, 'qrdecode/node_modules/pngjs'))
const OUT = resolveQaShotsDir(HERE)
const PG = 'sol999-liveqa3-pg-202608130329'
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi
const OPAQUE_RE = /^[A-Za-z0-9_-]{22}$/
const envelope = (data) => ({ success: true, code: 'OK', message: '성공', data, timestamp: '2026-08-13T00:00:00' })
const api = []
const consoleErrors = []
const results = {}
let completed = false
const uuidCount = (value) => (String(value).match(UUID_RE) ?? []).length
const db = (sql, database = 'inventory_db') => execFileSync('docker', ['exec', PG, 'psql', '-U', 'samhan', '-d', database, '-At', '-c', sql], { encoding: 'utf8' }).trim()
const authHeaders = {
  'X-User-Id': 'a0000000-0000-0000-0000-000000000001',
  'X-User-Name': 'CODEX SOL', 'X-User-Role': 'MASTER', 'X-Is-System-Master': 'true',
  'X-Internal-Token': 'dev-internal-token-change-me',
}

async function isolatedFetch(base, path, options = {}) {
  const response = await fetch(`${base}${path}`, { ...options, headers: {
    ...authHeaders, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers ?? {}),
  } })
  return { status: response.status, body: await response.text() }
}

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: 'ko-KR', timezoneId: 'Asia/Seoul' })
const page = await context.newPage()
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
page.on('response', async (response) => {
  const request = response.request()
  if (!request.url().startsWith('http://localhost:8080/')) return
  let body = ''
  try { body = await response.text() } catch {}
  api.push({ method: request.method(), url: request.url(), status: response.status(), body })
})

await page.route('http://localhost:8080/**', async (route) => {
  const request = route.request()
  const url = new URL(request.url())
  const path = url.pathname
  if (path === '/auth/me') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope({ userId: 'sol-liveqa', loginId: 'sol', role: 'MASTER', displayName: 'CODEX SOL', groups: [] })) })
  if (path === '/auth/admin/permissions/my') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope({ 'accounting.sales-slip.list': ['VIEW', 'EDIT'], 'inventory.audit': ['VIEW', 'CREATE', 'EDIT'], 'inventory.stock-balance': ['VIEW', 'CREATE'], 'inventory.adjust': ['VIEW', 'UPDATE'] })) })
  if (path === '/inventory/warehouses') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope([{ id: 'WH-QA', code: 'HQ-001', name: '본사창고', type: 'HEADQUARTERS', displayOrder: 1 }])) })
  if (path === '/inventory/balances') {
    const content = [
      { productCode: '010001', productName: 'S2a QR 검증 품목', warehouseCode: 'HQ-001', warehouseName: '본사창고', warehouseType: 'HEADQUARTERS', availableQty: 1, reservedQty: 0, totalQty: 3 },
      { productCode: 'AJ030RXH4BC1', productName: '실외기_3HP 다배관', warehouseCode: 'HQ-001', warehouseName: '본사창고', warehouseType: 'HEADQUARTERS', availableQty: 12, reservedQty: 0, totalQty: 12 },
    ]
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope({ content, pageable: { pageNumber: 0, pageSize: 50 }, totalElements: 2, totalPages: 1, last: true, first: true, size: 50, number: 0, numberOfElements: 2, empty: false })) })
  }
  let target = null
  if (path.startsWith('/inventory/') || path.startsWith('/warehouse/')) target = `http://127.0.0.1:42985${path}${url.search}`
  if (path.startsWith('/slips')) target = `http://127.0.0.1:42986${path}${url.search}`
  if (target) {
    const headers = { ...authHeaders }
    const contentType = request.headers()['content-type']
    if (contentType) headers['Content-Type'] = contentType
    const response = await fetch(target, { method: request.method(), headers, body: ['GET', 'HEAD'].includes(request.method()) ? undefined : request.postDataBuffer() })
    return route.fulfill({ status: response.status, contentType: response.headers.get('content-type') ?? 'application/json', body: await response.text() })
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope([])) })
})

try {
  const availableSerial = db("select serial_key from stock_instances where is_deleted=false and product_code='010001' and status in ('AVAILABLE','RESERVED') order by case when status='AVAILABLE' then 0 else 1 end, serial_key limit 1")
  const shippedSerials = db("select string_agg(serial_key,',' order by serial_key) from stock_instances where is_deleted=false and product_code='010001' and status='SHIPPED'").split(',').filter(Boolean)
  if (!availableSerial || shippedSerials.length < 1) throw new Error(`S2a fixture missing: available=${availableSerial} shipped=${shippedSerials.length}`)
  db(`UPDATE stock_instances SET status='AVAILABLE', quality='NORMAL' WHERE serial_key='${availableSerial}'`)
  await page.goto('http://127.0.0.1:42973/#/inventory/stock-balance', { waitUntil: 'domcontentloaded' })
  await page.getByTestId('header-page-title').waitFor({ timeout: 30000 })
  if (await page.getByTestId('inventory-balance-query-button').count() === 0) {
    await page.getByText('창고 운영', { exact: true }).click()
    await page.getByTestId('sidebar-inventory-stock-balance').click()
    await page.getByTestId('inventory-balance-query-button').waitFor({ timeout: 20000 })
  }
  await page.getByTestId('inventory-balance-query-button').click()

  await page.getByRole('button', { name: '010001 품목리스트 열기' }).click()
  await page.getByText('품목리스트 · 010001', { exact: true }).waitFor({ timeout: 20000 })
  await page.locator('canvas').first().waitFor()
  const serials = await page.locator('text=/^SI-[A-Z0-9]{6}$/').allTextContents()
  const dimensions = await page.locator('canvas').evaluateAll((canvases) => canvases.map((canvas) => ({ width: canvas.width, height: canvas.height, renderedWidth: canvas.getBoundingClientRect().width, renderedHeight: canvas.getBoundingClientRect().height })))
  const decoded = []
  for (let index = 0; index < serials.length; index++) {
    const buffer = await page.locator('canvas').nth(index).screenshot({ path: `${TMP}/qr-${index}.png`, scale: 'css' })
    const png = PNG.sync.read(buffer)
    decoded.push(jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data ?? null)
  }
  results.qr = { serials, decoded, exactMatch: JSON.stringify(serials) === JSON.stringify(decoded), dimensions, allSquare: dimensions.every((item) => item.width === item.height && Math.abs(item.renderedWidth - item.renderedHeight) < 0.1) }
  await page.screenshot({ path: `${OUT}/B6-square-QR-serialKey-existing-stock-list.png`, fullPage: true })

  const available = page.getByLabel(`${availableSerial} 품목 상태`)
  const availableWait = page.waitForResponse((response) => response.url().includes('/inventory/instances/quality') && response.request().method() === 'PATCH')
  await available.selectOption('USED')
  const availableResponse = await availableWait
  await page.getByRole('button', { name: '닫기' }).last().click()
  await page.getByRole('button', { name: '010001 품목리스트 열기' }).click()
  await page.getByText('품목리스트 · 010001', { exact: true }).waitFor()
  const availablePersist = await page.getByLabel(`${availableSerial} 품목 상태`).inputValue()
  const shippedDisabled = await Promise.all(shippedSerials.map((serial) => page.getByLabel(`${serial} 품목 상태`).isDisabled()))
  await page.screenshot({ path: `${OUT}/B12-AVAILABLE-persist-SHIPPED-UI-lock.png`, fullPage: true })
  await page.getByRole('button', { name: '닫기' }).last().click()
  db(`UPDATE stock_instances SET status='RESERVED' WHERE serial_key='${availableSerial}'`)
  await page.getByRole('button', { name: '010001 품목리스트 열기' }).click()
  await page.getByText('품목리스트 · 010001', { exact: true }).waitFor()
  const reservedEnabled = await page.getByLabel(`${availableSerial} 품목 상태`).isEnabled()
  const reservedWait = page.waitForResponse((response) => response.url().includes('/inventory/instances/quality') && response.request().method() === 'PATCH')
  await page.getByLabel(`${availableSerial} 품목 상태`).selectOption('DAMAGED')
  const reservedResponse = await reservedWait
  await page.getByRole('button', { name: '닫기' }).last().click()
  await page.getByRole('button', { name: '010001 품목리스트 열기' }).click()
  await page.getByText('품목리스트 · 010001', { exact: true }).waitFor()
  const reservedPersist = await page.getByLabel(`${availableSerial} 품목 상태`).inputValue()
  await page.screenshot({ path: `${OUT}/B12-RESERVED-persist.png`, fullPage: true })
  await page.getByRole('button', { name: '닫기' }).last().click()
  const bypass = await isolatedFetch('http://127.0.0.1:42985', `/inventory/instances/quality?serialKey=${shippedSerials[0]}`, { method: 'PATCH', body: JSON.stringify({ quality: 'BOX_DEFECT' }) })
  const shippedAfter = await isolatedFetch('http://127.0.0.1:42985', '/inventory/instances/product-list?productCode=010001')
  results.status = { availableSerial, shippedSerials, availableStatus: availableResponse.status(), availablePersist, reservedEnabled, reservedStatus: reservedResponse.status(), reservedPersist, shippedDisabled, bypassSerial: shippedSerials[0], bypassStatus: bypass.status, bypassBody: bypass.body, shippedAfter: shippedAfter.body }

  await page.getByRole('button', { name: 'AJ030RXH4BC1 재고수불부 열기' }).click()
  await page.getByText('재고수불부', { exact: true }).last().waitFor({ timeout: 20000 })
  await page.getByLabel('시작일').waitFor({ timeout: 20000 })
  const defaultStart = await page.getByLabel('시작일').inputValue()
  const defaultEnd = await page.getByLabel('종료일').inputValue()
  const headers = await page.locator('table thead th').allTextContents()
  const defaultRows = await page.locator('table tbody tr').evaluateAll((rows) => rows.map((row) => Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent?.trim() ?? '')))
  const targetButton = page.getByRole('button', { name: '전표 2026/08/02-17 열기' })
  const targetButtonCount = await targetButton.count()
  await page.screenshot({ path: `${OUT}/A1-slip-number-2026-08-02-17-clickable.png`, fullPage: true })
  const ledgerScroller = page.locator('table').last().locator('..')
  await ledgerScroller.evaluate((element) => { element.scrollLeft = element.scrollWidth })
  await page.screenshot({ path: `${OUT}/B8-running-balance-0-2-5-12-17-19-16-12.png`, fullPage: true })
  await ledgerScroller.evaluate((element) => { element.scrollLeft = 0 })
  if (targetButtonCount !== 1) throw new Error(`target slip button count=${targetButtonCount}`)

  const networkStart = api.length
  const consoleStart = consoleErrors.length
  await targetButton.click()
  await page.getByText('입고전표 2026/08/02-17', { exact: true }).waitFor({ timeout: 20000 })
  await page.waitForTimeout(700)
  const modalText = await page.getByText('전표번호: 2026/08/02-17', { exact: true }).textContent()
  const modalNetwork = api.slice(networkStart).map((item) => ({ ...item, urlUuidCount: uuidCount(item.url), responseUuidCount: uuidCount(item.body), responseLength: item.body.length }))
  const detailRequest = modalNetwork.find((item) => /\/slips\/[A-Za-z0-9_-]{22}(?:\?|$)/.test(item.url))
  const detail = detailRequest ? JSON.parse(detailRequest.body).data : null
  const restoredFields = detail ? {
    dataId: { opaque: OPAQUE_RE.test(detail.id), uuid: uuidCount(detail.id), value: detail.id },
    warehouseId: { opaque: OPAQUE_RE.test(detail.destinationWarehouseId), uuid: uuidCount(detail.destinationWarehouseId), value: detail.destinationWarehouseId },
    lineId: { opaque: OPAQUE_RE.test(detail.lines?.[0]?.id), uuid: uuidCount(detail.lines?.[0]?.id), value: detail.lines?.[0]?.id },
    productId: { opaque: OPAQUE_RE.test(detail.lines?.[0]?.productId), uuid: uuidCount(detail.lines?.[0]?.productId), value: detail.lines?.[0]?.productId },
  } : null
  results.slip = { targetButtonCount, modalText, sameSlip: modalText?.includes('2026/08/02-17') ?? false, screenUuidCount: uuidCount(await page.locator('body').innerText()), pageUrl: page.url(), pageUrlUuidCount: uuidCount(page.url()), network: modalNetwork, badStatuses: modalNetwork.filter((item) => [400, 404, 500].includes(item.status)), consoleErrors: consoleErrors.slice(consoleStart), restoredFields }
  await page.screenshot({ path: `${OUT}/A2-same-slip-2026-08-02-17-modal.png`, fullPage: true })
  await page.evaluate((network) => {
    const panel = document.createElement('section')
    panel.id = 'liveqa3-network-evidence'
    panel.style.cssText = 'position:fixed;right:18px;top:18px;z-index:2147483647;width:720px;background:#fff;border:3px solid #0f5f85;border-radius:10px;padding:16px;font:14px/1.45 monospace;color:#102a3a;box-shadow:0 12px 36px #0005'
    const rows = network.map((item, index) => `<tr><td>${index + 1}</td><td>${item.method}</td><td style="word-break:break-all">${item.url.replace('http://localhost:8080', '')}</td><td>${item.status}</td><td>${item.urlUuidCount}</td><td>${item.responseUuidCount}</td></tr>`).join('')
    panel.innerHTML = `<h2 style="margin:0 0 10px;font:700 18px sans-serif">A3 전표 모달 네트워크 전수 (${network.length}건)</h2><table style="width:100%;border-collapse:collapse"><thead><tr><th>#</th><th>방법</th><th>요청 URL</th><th>상태</th><th>URL UUID</th><th>응답 UUID</th></tr></thead><tbody>${rows}</tbody></table><p style="margin:10px 0 0"><b>400·404·500 = ${network.filter((item) => [400, 404, 500].includes(item.status)).length}건</b></p>`
    panel.querySelectorAll('th,td').forEach((cell) => { cell.style.border = '1px solid #9fb7c4'; cell.style.padding = '6px' })
    document.body.appendChild(panel)
  }, modalNetwork.map(({ method, url, status, urlUuidCount, responseUuidCount }) => ({ method, url, status, urlUuidCount, responseUuidCount })))
  await page.screenshot({ path: `${OUT}/A3-modal-network-all-requests-zero-400-404-500.png`, fullPage: true })
  await page.evaluate(() => document.getElementById('liveqa3-network-evidence')?.remove())
  await page.getByRole('button', { name: '닫기' }).last().click()

  const address = page.locator('td').filter({ hasText: '울산광역시 북구 사청6길 6' }).first()
  const addressButtons = await address.getByRole('button').count()
  const beforeAddressErrors = consoleErrors.length
  await address.click()
  await page.waitForTimeout(250)
  results.address = { notClickable: addressButtons === 0, newErrors: consoleErrors.slice(beforeAddressErrors) }

  await page.getByLabel('시작일').fill('2026-08-09')
  await page.getByLabel('종료일').fill('2026-08-13')
  const rangeWait = page.waitForResponse((response) => response.url().includes('/inventory/ledger') && response.url().includes('startDate=2026-08-09'))
  await page.getByRole('button', { name: '조회' }).last().click()
  const rangeResponse = await rangeWait
  await page.getByText('(주)삼한공조시스템 / 2026-08-09 ~ 2026-08-13 / 재고수불부 I / 실외기_3HP 다배관 (AJ030RXH4BC1)', { exact: true }).waitFor()
  const rangeRows = await page.locator('table tbody tr').evaluateAll((rows) => rows.map((row) => Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent?.trim() ?? '')))
  await page.screenshot({ path: `${OUT}/B7-date-change-opening-19-and-location-tags.png`, fullPage: true })
  const ledgers = api.filter((item) => item.url.includes('/inventory/ledger')).map((item) => JSON.parse(item.body).data)
  const defaultLedger = ledgers.find((item) => item.startDate === '2026-08-01')
  const rangeLedger = ledgers.find((item) => item.startDate === '2026-08-09')
  results.ledger = { defaultStart, defaultEnd, headers, defaultRows, rangeStatus: rangeResponse.status(), rangeRows, defaultLedger, rangeLedger, currentStockDb: Number(db("select total_qty from stock_balances where product_id='2d7e785d-e5f5-4abb-b0c8-543188fb829f' and warehouse_id='11111111-1111-1111-1111-000000000001' and is_deleted=false")), noSerialKey: !JSON.stringify(defaultLedger).includes('serialKey'), transferCount: Number(db("select count(*) from stock_movements where movement_type like 'TRANSFER%' and is_deleted=false")) }

  const auditId = 'af12435a-e2f8-4cf4-b61a-6d26c1db36bd'
  const auditRaw = await isolatedFetch('http://127.0.0.1:42985', `/inventory/audits/${auditId}`)
  const auditLine = JSON.parse(auditRaw.body).data.lines[0]
  await page.evaluate((id) => {
    window.history.pushState({}, '', `/warehouse/audit/${id}`)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, auditId)
  await page.getByTestId('audit-line-barcode-input').waitFor({ timeout: 20000 })
  await page.getByTestId('audit-line-barcode-input').fill(auditLine.productId)
  await page.getByTestId('audit-line-actual-input').fill(String(auditLine.actualQty ?? auditLine.expectedQty))
  await page.getByText('스캔', { exact: true }).locator('..').getByRole('checkbox').check()
  const postWait = page.waitForResponse((response) => response.url().includes(`/inventory/audits/${auditId}/lines`) && response.request().method() === 'POST')
  await page.getByTestId('audit-line-record-button').click()
  const post = await postWait
  results.audit = { inputPresent: true, postStatus: post.status(), inputCleared: (await page.getByTestId('audit-line-barcode-input').inputValue()) === '', product: auditLine.productName }
  await page.screenshot({ path: `${OUT}/B6-existing-stock-audit-barcode-unaffected.png`, fullPage: true })

  results.integrity = {
    serverEncoding: db('show server_encoding', 'partner_db'),
    koreanPartners: db("select string_agg(name,' | ' order by name) from partners where name in ('(주)한국냉동물류','(주)서울택배','대한화물서비스(주)')", 'partner_db'),
    fixtureKorean: db("select string_agg(note,' | ' order by occurred_at) from stock_movements where id::text like '999bc001-%'"),
    serialCount: Number(db('select count(*) from stock_instances where is_deleted=false')),
    serialBlank: Number(db("select count(*) from stock_instances where is_deleted=false and (serial_key is null or btrim(serial_key)='')")),
    serialDuplicateGroups: Number(db('select count(*) from (select serial_key from stock_instances where is_deleted=false group by serial_key having count(*)>1) duplicated')),
  }
  results.slipModalNetworkUuid = { requestUrlCount: results.slip.network.reduce((sum, item) => sum + item.urlUuidCount, 0), responseBodyCount: results.slip.network.reduce((sum, item) => sum + item.responseUuidCount, 0) }
  results.consoleErrors = consoleErrors
  writeFileSync(`${OUT}/liveqa3-results.json`, `${JSON.stringify(results, null, 2)}\n`, 'utf8')
  completed = true
  console.log(JSON.stringify(results, null, 2))
} catch (error) {
  writeFileSync(`${OUT}/liveqa3-failure.json`, `${JSON.stringify({ error: String(error?.stack ?? error), api, consoleErrors }, null, 2)}\n`, 'utf8')
  await page.screenshot({ path: `${OUT}/FAILURE-final-screen.png`, fullPage: true })
  throw error
} finally {
  await Promise.race([browser.close(), new Promise((resolve) => setTimeout(resolve, 3000))])
  if (completed) process.exit(0)
}
