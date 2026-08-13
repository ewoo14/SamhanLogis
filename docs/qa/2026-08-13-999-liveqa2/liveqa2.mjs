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
const TMP = join(tmpdir(), 'sol999-liveqa2-202608130244')
const jsQR = require(resolve(TMP, 'qrdecode/node_modules/jsqr'))
const { PNG } = require(resolve(TMP, 'qrdecode/node_modules/pngjs'))
const OUT = resolveQaShotsDir(HERE)
const PG = 'sol999-liveqa2-pg-202608130244'
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi
const envelope = (data) => ({ success: true, code: 'OK', message: '성공', data, timestamp: '2026-08-13T00:00:00' })
const api = []
const consoleErrors = []
const results = {}
let completed = false
const uuidCount = (value) => (String(value).match(UUID_RE) ?? []).length
const db = (sql, database = 'inventory_db') => execFileSync('docker', ['exec', PG, 'psql', '-U', 'samhanqa', '-d', database, '-At', '-c', sql], { encoding: 'utf8' }).trim()

async function isolatedFetch(base, path, options = {}) {
  const response = await fetch(`${base}${path}`, { ...options, headers: {
    'X-User-Id': 'a0000000-0000-0000-0000-000000000001', 'X-User-Name': 'CODEX SOL',
    'X-User-Role': 'MASTER', 'X-Is-System-Master': 'true', 'X-Internal-Token': 'dev-internal-token-change-me',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers ?? {}),
  } })
  return { status: response.status, body: await response.text() }
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: 'ko-KR', timezoneId: 'Asia/Seoul' })
const page = await context.newPage()
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
page.on('response', async (response) => {
  const request = response.request()
  if (!request.url().startsWith('http://localhost:8080/')) return
  let body = ''
  try { body = await response.text() } catch {}
  api.push({ method: request.method(), url: request.url(), status: response.status(), body })
})

await page.route('http://localhost:8080/**', async (route) => {
  const request = route.request(); const url = new URL(request.url()); const path = url.pathname
  if (path === '/auth/me') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope({ userId: 'sol-liveqa', loginId: 'sol', role: 'MASTER', displayName: 'CODEX SOL', groups: [] })) })
  if (path === '/auth/admin/permissions/my') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope({ 'accounting.sales-slip.list': ['VIEW','EDIT'], 'inventory.audit': ['VIEW','CREATE','EDIT'], 'inventory.stock-balance': ['VIEW','CREATE'], 'inventory.adjust': ['VIEW','UPDATE'] })) })
  if (path === '/inventory/warehouses') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope([{ id: 'WH-QA', code: 'HQ-001', name: '본사창고', type: 'HEADQUARTERS', displayOrder: 1 }])) })
  if (path === '/inventory/balances') {
    const content = [
      { productCode:'010001', productName:'S2a QR 검증 품목', warehouseCode:'HQ-001', warehouseName:'본사창고', warehouseType:'HEADQUARTERS', availableQty:1, reservedQty:0, totalQty:3 },
      { productCode:'AJ030RXH4BC1', productName:'실외기_3HP 다배관', warehouseCode:'HQ-001', warehouseName:'본사창고', warehouseType:'HEADQUARTERS', availableQty:12, reservedQty:0, totalQty:12 },
    ]
    return route.fulfill({ status: 200, contentType:'application/json', body:JSON.stringify(envelope({ content, pageable:{pageNumber:0,pageSize:50}, totalElements:2,totalPages:1,last:true,first:true,size:50,number:0,numberOfElements:2,empty:false })) })
  }
  let target = null
  if (path.startsWith('/inventory/') || path.startsWith('/warehouse/')) target = `http://127.0.0.1:42985${path}${url.search}`
  if (path.startsWith('/slips')) target = `http://127.0.0.1:42986${path}${url.search}`
  if (target) {
    const headers = { 'X-User-Id':'a0000000-0000-0000-0000-000000000001','X-User-Name':'CODEX SOL','X-User-Role':'MASTER','X-Is-System-Master':'true','X-Internal-Token':'dev-internal-token-change-me' }
    const ct=request.headers()['content-type']; if(ct) headers['Content-Type']=ct
    const response=await fetch(target,{method:request.method(),headers,body:['GET','HEAD'].includes(request.method())?undefined:request.postDataBuffer()})
    return route.fulfill({status:response.status,contentType:response.headers.get('content-type')??'application/json',body:await response.text()})
  }
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(envelope([]))})
})

try {
  db("UPDATE stock_instances SET status='AVAILABLE', quality='NORMAL' WHERE serial_key='SI-643G7S'")
  await page.goto('http://127.0.0.1:42973/#/inventory/stock-balance',{waitUntil:'domcontentloaded'})
  await page.getByTestId('header-page-title').waitFor({timeout:30000})
  if (await page.getByTestId('inventory-balance-query-button').count() === 0) {
    writeFileSync(`${OUT}/diagnostic-entry.txt`, `url=${page.url()}\n${await page.locator('body').innerText()}\napi=${JSON.stringify(api,null,2)}\nconsole=${JSON.stringify(consoleErrors,null,2)}\n`, 'utf8')
    await page.screenshot({path:`${OUT}/diagnostic-entry.png`,fullPage:true})
    throw new Error('inventory-balance-query-button missing; diagnostic captured')
  }
  await page.getByTestId('inventory-balance-query-button').click()
  await page.getByRole('button',{name:'010001 품목리스트 열기'}).click()
  await page.getByText('품목리스트 · 010001',{exact:true}).waitFor({timeout:20000})
  await page.locator('canvas').first().waitFor()
  const serials=await page.locator('text=/^SI-[A-Z0-9]{6}$/').allTextContents()
  const dimensions=await page.locator('canvas').evaluateAll(cs=>cs.map(c=>({width:c.width,height:c.height,renderedWidth:c.getBoundingClientRect().width,renderedHeight:c.getBoundingClientRect().height})))
  const decoded=[]
  for(let i=0;i<serials.length;i++){const buffer=await page.locator('canvas').nth(i).screenshot({path:`${TMP}/qr-${i}.png`,scale:'css'});const png=PNG.sync.read(buffer);decoded.push(jsQR(new Uint8ClampedArray(png.data),png.width,png.height)?.data??null)}
  results.QR={serials,decoded,exactMatch:JSON.stringify(serials)===JSON.stringify(decoded),dimensions,allSquare:dimensions.every(x=>x.width===x.height&&Math.abs(x.renderedWidth-x.renderedHeight)<0.1)}
  await page.screenshot({path:`${OUT}/A1-QR-square-serialKey-and-existing-stock-list.png`,fullPage:true})

  const available=page.getByLabel('SI-643G7S 품목 상태'); const aw=page.waitForResponse(r=>r.url().includes('/inventory/instances/quality')&&r.request().method()==='PATCH');await available.selectOption('USED');const ar=await aw
  await page.getByRole('button',{name:'닫기'}).last().click();await page.getByRole('button',{name:'010001 품목리스트 열기'}).click();await page.getByText('품목리스트 · 010001',{exact:true}).waitFor()
  const availablePersist=await page.getByLabel('SI-643G7S 품목 상태').inputValue();const shippedDisabled=await Promise.all(['SI-BKSADE','SI-SA8BQM'].map(s=>page.getByLabel(`${s} 품목 상태`).isDisabled()))
  await page.screenshot({path:`${OUT}/B12-AVAILABLE-persist-and-SHIPPED-UI-lock.png`,fullPage:true});await page.getByRole('button',{name:'닫기'}).last().click()
  db("UPDATE stock_instances SET status='RESERVED' WHERE serial_key='SI-643G7S'");await page.getByRole('button',{name:'010001 품목리스트 열기'}).click();await page.getByText('품목리스트 · 010001',{exact:true}).waitFor()
  const reservedEnabled=await page.getByLabel('SI-643G7S 품목 상태').isEnabled();const rw=page.waitForResponse(r=>r.url().includes('/inventory/instances/quality')&&r.request().method()==='PATCH');await page.getByLabel('SI-643G7S 품목 상태').selectOption('DAMAGED');const rr=await rw
  await page.getByRole('button',{name:'닫기'}).last().click();await page.getByRole('button',{name:'010001 품목리스트 열기'}).click();await page.getByText('품목리스트 · 010001',{exact:true}).waitFor();const reservedPersist=await page.getByLabel('SI-643G7S 품목 상태').inputValue();await page.screenshot({path:`${OUT}/B12-RESERVED-persist.png`,fullPage:true});await page.getByRole('button',{name:'닫기'}).last().click()
  const bypass=await isolatedFetch('http://127.0.0.1:42985','/inventory/instances/quality?serialKey=SI-BKSADE',{method:'PATCH',body:JSON.stringify({quality:'BOX_DEFECT'})});const shippedAfter=await isolatedFetch('http://127.0.0.1:42985','/inventory/instances/product-list?productCode=010001')
  results.status={availableStatus:ar.status(),availablePersist,reservedEnabled,reservedStatus:rr.status(),reservedPersist,shippedDisabled,bypassStatus:bypass.status,bypassBody:bypass.body,shippedAfter:shippedAfter.body}

  await page.getByRole('button',{name:'AJ030RXH4BC1 재고수불부 열기'}).click();await page.getByText('재고수불부',{exact:true}).last().waitFor({timeout:20000})
  await page.getByLabel('시작일').waitFor({timeout:20000})
  const defaultStart=await page.getByLabel('시작일').inputValue(),defaultEnd=await page.getByLabel('종료일').inputValue(),headers=await page.locator('table thead th').allTextContents(),defaultRows=await page.locator('table tbody tr').evaluateAll(rs=>rs.map(r=>Array.from(r.querySelectorAll('td')).map(c=>c.textContent?.trim()??'')))
  await page.screenshot({path:`${OUT}/B6-default-month-start-to-today.png`,fullPage:true});const scroller=page.locator('table').last().locator('..');await scroller.evaluate(e=>e.scrollLeft=e.scrollWidth);await page.screenshot({path:`${OUT}/B7-running-balance-numeric-proof.png`,fullPage:true});await scroller.evaluate(e=>e.scrollLeft=0)
  const netStart=api.length,consoleStart=consoleErrors.length,urlBefore=page.url()
  if (await page.getByRole('button',{name:'전표 2026/08/02-17 열기'}).count() === 0) {
    const targetRow = defaultRows.find(row => row.some(cell => cell.includes('2026/08/02-17'))) ?? null
    const defect = { targetRow, buttonCount: 0, pageUrl: page.url(), screenUuidCount: uuidCount(await page.locator('body').innerText()),
      slipRequestsAfterLedgerOpen: api.slice(netStart).filter(x => x.url.includes('/slips')), consoleErrors: consoleErrors.slice(consoleStart),
      directLedgerTarget: JSON.parse(api.filter(x => x.url.includes('/inventory/ledger')).at(-1).body).data.rows.find(row => row.description === '2026/08/02-17') }
    writeFileSync(`${OUT}/A1-A4-target-slip-unreachable-defect.json`, `${JSON.stringify(defect,null,2)}\n`, 'utf8')
    await page.screenshot({path:`${OUT}/A1-slip-target-2026-08-02-17-button-missing.png`,fullPage:true})
    await page.screenshot({path:`${OUT}/A4-slip-modal-network-unreachable-zero-slip-requests.png`,fullPage:true})
    throw new Error('reachable defect: target slip button missing after opaque internal response parse failure')
  }
  await page.getByRole('button',{name:'전표 2026/08/02-17 열기'}).click();await page.getByText('입고전표 2026/08/02-17',{exact:true}).waitFor({timeout:20000});await page.waitForTimeout(700)
  const modalText=await page.getByText('전표번호: 2026/08/02-17',{exact:true}).textContent(),screen=await page.locator('body').innerText(),urlAfter=page.url(),modalNetwork=api.slice(netStart).map(x=>({method:x.method,url:x.url,status:x.status,urlUuidCount:uuidCount(x.url),responseUuidCount:uuidCount(x.body),responseLength:x.body.length})),modalErrors=consoleErrors.slice(consoleStart)
  results.slip={modalText,sameSlip:modalText?.includes('2026/08/02-17')??false,screenUuidCount:uuidCount(screen),urlBefore,urlAfter,pageUrlUuidCount:uuidCount(urlAfter),network:modalNetwork,consoleErrors:modalErrors,badStatuses:modalNetwork.filter(x=>[400,404,500].includes(x.status))}
  await page.screenshot({path:`${OUT}/A1-slip-UUID-zero-screen-and-target-2026-08-02-17.png`,fullPage:true});await page.screenshot({path:`${OUT}/A4-slip-modal-all-network-requests-zero-4xx5xx.png`,fullPage:true});await page.getByRole('button',{name:'닫기'}).last().click()
  const address=page.locator('td').filter({hasText:'울산광역시 북구 사청6길 6'}).first(),addressButtons=await address.getByRole('button').count(),beforeAddressErrors=consoleErrors.length;await address.click();await page.waitForTimeout(250)
  results.address={notClickable:addressButtons===0,newErrors:consoleErrors.slice(beforeAddressErrors)}
  await page.getByLabel('시작일').fill('2026-08-09');await page.getByLabel('종료일').fill('2026-08-13');const rangeWait=page.waitForResponse(r=>r.url().includes('/inventory/ledger')&&r.url().includes('startDate=2026-08-09'));await page.getByRole('button',{name:'조회'}).last().click();const rangeResponse=await rangeWait;await page.getByText('(주)삼한공조시스템 / 2026-08-09 ~ 2026-08-13 / 재고수불부 I / 실외기_3HP 다배관 (AJ030RXH4BC1)',{exact:true}).waitFor();const rangeRows=await page.locator('table tbody tr').evaluateAll(rs=>rs.map(r=>Array.from(r.querySelectorAll('td')).map(c=>c.textContent?.trim()??'')));await page.screenshot({path:`${OUT}/B6-date-change-opening-recalculation-and-location-tags.png`,fullPage:true})
  const ledgers=api.filter(x=>x.url.includes('/inventory/ledger')).map(x=>JSON.parse(x.body).data),defaultLedger=ledgers.find(x=>x.startDate==='2026-08-01'),rangeLedger=ledgers.find(x=>x.startDate==='2026-08-09')
  results.ledger={defaultStart,defaultEnd,headers,defaultRows,rangeStatus:rangeResponse.status(),rangeRows,defaultLedger,rangeLedger,currentStockDb:Number(db("select total_qty from stock_balances where product_id='2d7e785d-e5f5-4abb-b0c8-543188fb829f' and warehouse_id='11111111-1111-1111-1111-000000000001' and is_deleted=false")),noSerialKey:!JSON.stringify(defaultLedger).includes('serialKey'),transferCount:Number(db("select count(*) from stock_movements where movement_type like 'TRANSFER%' and is_deleted=false"))}

  const auditId='af12435a-e2f8-4cf4-b61a-6d26c1db36bd',auditRaw=await isolatedFetch('http://127.0.0.1:42985',`/inventory/audits/${auditId}`),auditData=JSON.parse(auditRaw.body).data,auditLine=auditData.lines[0]
  await page.goto(`http://127.0.0.1:42973/#/warehouse/audit/${auditId}`,{waitUntil:'domcontentloaded'});await page.getByTestId('audit-line-barcode-input').waitFor({timeout:20000});await page.getByTestId('audit-line-barcode-input').fill(auditLine.productId);await page.getByTestId('audit-line-actual-input').fill(String(auditLine.actualQty??auditLine.expectedQty));await page.getByText('스캔',{exact:true}).locator('..').getByRole('checkbox').check();const postWait=page.waitForResponse(r=>r.url().includes(`/inventory/audits/${auditId}/lines`)&&r.request().method()==='POST');await page.getByTestId('audit-line-record-button').click();const post=await postWait;results.audit={inputPresent:true,postStatus:post.status(),inputCleared:(await page.getByTestId('audit-line-barcode-input').inputValue())==='',product:auditLine.productName};await page.screenshot({path:`${OUT}/B5-existing-stock-audit-barcode-unaffected.png`,fullPage:true})

  results.integrity={serverEncoding:db('show server_encoding','partner_db'),koreanPartners:db("select string_agg(name,' | ' order by name) from partners where name in ('(주)한국냉동물류','(주)서울택배','대한화물서비스(주)')",'partner_db'),fixtureKorean:db("select string_agg(note,' | ' order by occurred_at) from stock_movements where id::text like '999bc001-%'"),serialCount:Number(db('select count(*) from stock_instances where is_deleted=false')),serialBlank:Number(db("select count(*) from stock_instances where is_deleted=false and (serial_key is null or btrim(serial_key)='')")),serialDuplicateGroups:Number(db('select count(*) from (select serial_key from stock_instances where is_deleted=false group by serial_key having count(*)>1) d'))}
  writeFileSync(`${OUT}/liveqa2-results.json`,`${JSON.stringify(results,null,2)}\n`,'utf8');completed = true;console.log(JSON.stringify(results,null,2))
} finally {
  await Promise.race([browser.close(), new Promise(resolve => setTimeout(resolve, 3000))])
  if (completed) process.exit(0)
}
