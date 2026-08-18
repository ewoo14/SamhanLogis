import { expect, test, type Page, type Route } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'

const ORDER_BASE = process.env['R17_ORDER_BASE_URL'] ?? 'http://127.0.0.1:5197'
const DESKTOP_BASE = process.env['R17_DESKTOP_BASE_URL'] ?? 'http://127.0.0.1:5198'
const PARTNER_API = process.env['R17_PARTNER_API'] ?? 'http://127.0.0.1:29188'
const PRODUCT_API = process.env['R17_PRODUCT_API'] ?? 'http://127.0.0.1:29184'
const GATEWAY_BASE = process.env['R17_GATEWAY_BASE'] ?? 'http://127.0.0.1:8080'
const ATTESTATION = process.env['SAMHAN_GATEWAY_ATTESTATION']?.trim()
if (!ATTESTATION) throw new Error('SAMHAN_GATEWAY_ATTESTATION 환경변수가 필요합니다')

const PARTNER_CODE = '1068689215'
const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = resolveQaShotsDir(path.resolve(HERE, '../../../../docs/qa/1241-r17-adversarial-real-qa/screenshots'))
const RESULTS = path.join(SHOTS, 'results.json')

const identityHeaders = {
  'X-Samhan-Gateway-Attestation': ATTESTATION,
  'X-User-Id': USER_ID,
  'X-User-Name': encodeURIComponent('SOL R17 적대검증'),
  'X-Is-Partner': 'true',
  'X-Partner-Code': PARTNER_CODE,
}

type Captured = { url: string; method: string; status: number; request: string; response: string }
type QaResults = {
  mainOrderNo?: string
  preview?: unknown
  finalRows?: string[]
  pairObservations?: Array<{ stage: string; model: string; expected: number; actual?: number; rowText?: string }>
  vatOrders?: Array<{ amount: number; previewStatus: number; draftStatus: number; confirmStatus: number; orderNo: string; totalAmount: number }>
}
const qaResults: QaResults = {}

async function installRealApi(page: Page, captured: Captured[]): Promise<void> {
  await page.route(`${PARTNER_API}/**`, async (route: Route) => {
    const request = route.request()
    const response = await route.fetch({ headers: { ...request.headers(), ...identityHeaders } })
    const body = await response.body()
    captured.push({
      url: request.url(),
      method: request.method(),
      status: response.status(),
      request: request.postData() ?? '',
      response: body.toString('utf8'),
    })
    await route.fulfill({ response, body })
  })
}

async function enterSinglePage(page: Page): Promise<void> {
  await page.goto(`${ORDER_BASE}/#/order`, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('#bizGateInput'), '주문서웹 사업자번호 게이트 미도달').toBeVisible()
  await page.evaluate((partnerCode) => {
    ;(window as any).CURRENT_BIZNO = partnerCode
    ;(window as any).AUTH_BIZ = partnerCode
    document.querySelector<HTMLElement>('#pageBizGate')?.classList.add('hidden')
    document.body.classList.remove('no-active')
  }, PARTNER_CODE)
  // 하단 고정 메뉴는 긴 상업 카탈로그가 먼저 렌더되면 Playwright viewport 밖으로
  // 계산될 수 있다. 실제 버튼의 등록 click handler를 직접 발생시키고 목적 화면으로 검증한다.
  await page.locator('#btnGoSingle').evaluate((button: HTMLButtonElement) => button.click())
  await expect(page.locator('#cardSingle'), '싱글중대형 화면 미도달').toBeVisible({ timeout: 30_000 })
}

async function setQuantity(page: Page, model: string, quantity: string): Promise<void> {
  const input = page.locator(`#singleBody input[data-model="${model}"]`)
  await expect(input, `${model} 품목표 행 미도달`).toBeVisible({ timeout: 30_000 })
  await input.fill(quantity)
  await input.dispatchEvent('change')
}

function persistResults(): void {
  fs.writeFileSync(RESULTS, JSON.stringify(qaResults, null, 2), 'utf8')
}

test.describe.configure({ mode: 'serial' })

test('R08 실화면 — 수동 수정한 자동 부속을 원품 재계산이 다시 덮는다', async ({ page }) => {
  await installRealApi(page, [])
  await enterSinglePage(page)

  const sourceModel = 'AC145BSCPHH2SY'
  const pumpModel = 'ADP-F075SP'
  await setQuantity(page, sourceModel, '1')
  const pump = page.locator(`#singleBody input[data-model="${pumpModel}"]`)
  await expect(pump).toHaveValue('1')
  console.log(`R08_AUTO1 source=1 pump=${await pump.inputValue()}`)
  await pump.fill('7')
  await pump.dispatchEvent('change')
  await expect(pump).toHaveValue('7')
  console.log(`R08_MANUAL7 pump=${await pump.inputValue()}`)
  await setQuantity(page, sourceModel, '2')
  await expect(pump).toHaveValue('2')
  console.log(`R08_RECALC2 source=2 pump=${await pump.inputValue()}`)
  await page.screenshot({ path: path.join(SHOTS, '01-r08-manual-recalc-real-qa.png'), fullPage: true })
  await page.unrouteAll({ behavior: 'ignoreErrors' })
})

test('세트 전수 실화면 — 품목표·미리보기·최종확인·격리 저장', async ({ page }) => {
  const captured: Captured[] = []
  page.on('console', message => console.log(`[BROWSER ${message.type()}] ${message.text()}`))
  page.on('requestfailed', request => console.log(`[REQUEST_FAILED] ${request.url()} ${request.failure()?.errorText}`))
  await installRealApi(page, captured)
  await enterSinglePage(page)

  const due = page.locator('#due')
  await due.evaluate((node: HTMLInputElement) => { node.value = '2026-08-20' })
  await due.dispatchEvent('change')
  await setQuantity(page, 'AR06D1150HZS', '1')
  await setQuantity(page, 'AC060CS6PBH1SY', '1')

  const itemTable = await page.evaluate(() => {
    const result: Record<string, { unit: string; subtotal: string }> = {}
    for (const model of ['AR06D1150HZS', 'AC060CS6PBH1SY']) {
      const input = document.querySelector<HTMLInputElement>(`#singleBody input[data-model="${model}"]`)
      const row = input?.closest('tr')
      result[model] = {
        unit: row?.querySelector<HTMLElement>('[data-ssu]')?.textContent?.trim() ?? '',
        subtotal: row?.querySelector<HTMLElement>('[data-ss]')?.textContent?.trim() ?? '',
      }
    }
    return result
  })
  expect(itemTable['AR06D1150HZS']?.subtotal).toContain('370,000')
  expect(itemTable['AC060CS6PBH1SY']?.subtotal).toContain('1,660,000')
  console.log(`ITEM_TABLE ${JSON.stringify(itemTable)}`)

  await page.locator('#btnPreview').evaluate((button: HTMLButtonElement) => button.click())
  await expect(page.locator('#dlgPreview')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('#btnProceed')).toBeEnabled({ timeout: 30_000 })
  const previewCapture = captured.find(entry => entry.url.includes('/price-preview'))
  expect(previewCapture, '가격 미리보기 실응답 미포착').toBeTruthy()
  expect(previewCapture?.status, previewCapture?.response).toBe(200)
  const previewJson = JSON.parse(previewCapture!.response)
  const previewLines = previewJson.data.lines as Array<{ modelCode: string; finalPrice: number }>
  const expectedPairs = [
    ['AC060CN6PBH1', 606000],
    ['AC060CXAPBH1', 910000],
    ['PC6NUNK1NW', 128000],
    ['AR-EH05', 16000],
    ['AR06D1150HZN', 148000],
    ['AR06D1150HAX', 222000],
  ] as const
  const pairObservations: NonNullable<QaResults['pairObservations']> = []
  for (const [model, amount] of expectedPairs) {
    const actual = previewLines.find(line => line.modelCode === model)?.finalPrice
    pairObservations.push({ stage: '미리보기', model, expected: amount, actual })
    console.log(`PAIR_PREVIEW model=${model} expected=${amount} actual=${actual}`)
  }
  expect(previewLines.filter(line => ['AC060CN6PBH1', 'AC060CXAPBH1', 'PC6NUNK1NW', 'AR-EH05'].includes(line.modelCode)).map(line => line.modelCode))
    .toEqual(['AC060CN6PBH1', 'AC060CXAPBH1', 'PC6NUNK1NW', 'AR-EH05'])
  const previewRows = page.locator('#previewBody tr')
  expect(await previewRows.count()).toBe(previewLines.length)
  const previewTexts = await previewRows.allTextContents()
  for (const [model, amount] of expectedPairs) {
    const row = previewTexts.find(text => text.includes(model))
    expect(row, `미리보기 화면 ${model} 라벨`).toBeTruthy()
    pairObservations.push({ stage: '미리보기 화면', model, expected: amount, rowText: row })
  }
  console.log(`PREVIEW_RAW ${previewCapture!.response}`)
  console.log(`PREVIEW_SCREEN ${JSON.stringify(previewTexts)}`)
  await page.screenshot({ path: path.join(SHOTS, '02-set-preview-label-amount-real-qa.png'), fullPage: true })

  await page.locator('#btnProceed').click()
  await expect(page.locator('#pageOrderInfo')).toBeVisible()
  await page.locator('#addrBase').evaluate((node: HTMLInputElement) => {
    node.value = '서울특별시 R17 격리 QA로 16'
    node.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await page.locator('#addrDetail').fill('16층')
  await page.locator('#sameAddr').check()
  await page.locator('#tel').fill('01016161616')
  await page.locator('#due').fill('2026-08-20')
  await page.locator('#payDue').fill('2026-08-31')
  await page.locator('#memo').fill('R17 헤더 보존 격리 QA')
  await page.screenshot({ path: path.join(SHOTS, '03-order-headers-real-qa.png'), fullPage: true })

  await page.locator('#btnSendOrder').click()
  await expect(page.locator('#dlgFinal')).toBeVisible()
  const finalRows = page.locator('#finalBody tr')
  const finalTexts = await finalRows.allTextContents()
  expect(finalTexts).toHaveLength(previewTexts.length)
  for (const [model, amount] of expectedPairs) {
    const row = finalTexts.find(text => text.includes(model))
    expect(row, `최종확인 화면 ${model} 라벨`).toBeTruthy()
    pairObservations.push({ stage: '최종확인 화면', model, expected: amount, rowText: row })
  }
  console.log(`FINAL_SCREEN ${JSON.stringify(finalTexts)}`)
  await page.screenshot({ path: path.join(SHOTS, '04-final-label-amount-real-qa.png'), fullPage: true })

  await page.locator('#btnFinalSend').click()
  await expect(page.locator('#progressText')).toContainText('전송이 완료되었습니다', { timeout: 30_000 })
  const confirmCapture = captured.find(entry => /\/partner-orders\/[^/]+\/confirm$/.test(entry.url))
  expect(confirmCapture, '주문 확정 실응답 미포착').toBeTruthy()
  expect(confirmCapture?.status, confirmCapture?.response).toBe(200)
  const confirmJson = JSON.parse(confirmCapture!.response)
  qaResults.mainOrderNo = confirmJson.data.orderNo
  qaResults.preview = previewJson.data
  qaResults.finalRows = finalTexts
  qaResults.pairObservations = pairObservations
  persistResults()
  console.log(`CONFIRM_RAW ${confirmCapture!.response}`)
  console.log(`MAIN_ORDER_NO ${qaResults.mainOrderNo}`)
  await page.screenshot({ path: path.join(SHOTS, '05-send-complete-real-qa.png'), fullPage: true })
})

test('가격 미리보기 500 미재발 + VAT 4경계 실HTTP·격리 저장', async ({ request }) => {
  const vatOrders: NonNullable<QaResults['vatOrders']> = []
  for (const amount of [5, 6, 11, 800000]) {
    const lines = [{ modelCode: 'AR06D1150HZN', categoryKey: 'singleSets', quantity: 1, unitPrice: amount, setAllocation: true, remark: `R17 VAT ${amount}` }]
    const preview = await request.post(`${PARTNER_API}/api/v1/partner-orders/price-preview`, {
      headers: identityHeaders,
      data: { lines },
    })
    expect(preview.status(), await preview.text()).toBe(200)
    const order = {
      bizno: PARTNER_CODE,
      custCode: PARTNER_CODE,
      addr: `서울특별시 R17 VAT ${amount}`,
      auditAddr: `서울특별시 R17 VAT ${amount}`,
      tel: '01016161616',
      due: '2026-08-20',
      payDue: '2026-08-31',
      memo: `R17 VAT 경계 ${amount}`,
    }
    const items = [{ section: 'SINGLE', model: 'AR06D1150HZN', qty: 1, price: amount, setAllocation: true }]
    const draft = await request.post(`${PARTNER_API}/api/v1/partner-orders/drafts`, {
      headers: identityHeaders,
      data: { label: `R17 VAT ${amount}`, payloadJson: JSON.stringify({ items, order }) },
    })
    expect(draft.status(), await draft.text()).toBe(201)
    const draftJson = await draft.json()
    const confirm = await request.post(`${PARTNER_API}/api/v1/partner-orders/${draftJson.data.draftId}/confirm`, {
      headers: { ...identityHeaders, 'X-Biz-Code': PARTNER_CODE },
      data: { lines },
    })
    expect(confirm.status(), await confirm.text()).toBe(200)
    const confirmJson = await confirm.json()
    vatOrders.push({ amount, previewStatus: preview.status(), draftStatus: draft.status(), confirmStatus: confirm.status(), orderNo: confirmJson.data.orderNo, totalAmount: confirmJson.data.totalAmount })
    console.log(`VAT_HTTP amount=${amount} preview=${preview.status()} draft=${draft.status()} confirm=${confirm.status()} orderNo=${confirmJson.data.orderNo} total=${confirmJson.data.totalAmount}`)
  }
  qaResults.vatOrders = vatOrders
  persistResults()
})

test('데스크톱 실화면 — R03·R05 저장 상세과 시트 폐기 전달', async ({ page }) => {
  expect(qaResults.mainOrderNo, '앞선 실 주문 번호 부재').toBeTruthy()
  const password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  const loginResponse = await page.request.post(`${GATEWAY_BASE}/auth/login`, { data: { loginId: 'dev_master', password } })
  expect(loginResponse.status(), await loginResponse.text()).toBe(200)
  const loginData = (await loginResponse.json()).data ?? {}
  await page.addInitScript(({ token, userId, role, fullName }) => {
    Object.defineProperty(window, 'samhanAuth', { configurable: true, value: {
      getToken: async () => ({ token, userId, role, fullName, partnerCode: null }),
      setToken: async () => undefined,
      clearToken: async () => undefined,
    } })
  }, { token: loginData.token, userId: loginData.userId, role: loginData.role, fullName: loginData.displayName ?? 'dev_master' })
  const masterHeaders = {
    'X-Samhan-Gateway-Attestation': ATTESTATION,
    'X-User-Id': loginData.userId,
    'X-User-Name': encodeURIComponent(loginData.displayName ?? 'dev_master'),
    'X-Is-Partner': 'false',
    'X-Is-System-Master': 'true',
  }
  await page.route(`${GATEWAY_BASE}/auth/me`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, code: 'OK', message: '성공', data: { userId: loginData.userId, loginId: 'dev_master', role: loginData.role, displayName: loginData.displayName, groups: loginData.groups ?? [] } }) }))
  await page.route(`${GATEWAY_BASE}/auth/admin/permissions/my`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, code: 'OK', message: '성공', data: { 'sales.partner-order.list': ['VIEW'], 'products.sync': ['VIEW', 'CREATE'], 'products.list': ['VIEW'] } }) }))
  await page.route(`${GATEWAY_BASE}/auth/admin/menu-catalog`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, code: 'OK', message: '성공', data: [] }) }))
  await page.route(`${GATEWAY_BASE}/api/v1/partner-orders/**`, async route => {
    if (route.request().url().includes('/collab/stream')) { await route.abort(); return }
    const target = route.request().url().replace(`${GATEWAY_BASE}/api/v1/partner-orders`, `${PARTNER_API}/api/v1/partner-orders`)
    const response = await route.fetch({ url: target, headers: { ...route.request().headers(), ...masterHeaders } })
    await route.fulfill({ response, body: await response.body() })
  })
  await page.route(`${GATEWAY_BASE}/api/v1/products/**`, async route => {
    if (route.request().url().includes('/catalog-realtime')) { await route.abort(); return }
    const target = route.request().url().replace(`${GATEWAY_BASE}/api/v1/products`, `${PRODUCT_API}/api/v1/products`)
    const response = await route.fetch({ url: target, headers: { ...route.request().headers(), ...masterHeaders } })
    await route.fulfill({ response, body: await response.body() })
  })
  await page.route(`${GATEWAY_BASE}/api/v1/products/admin/**`, async route => {
    const target = route.request().url().replace(`${GATEWAY_BASE}/api/v1/products/admin`, `${PRODUCT_API}/api/v1/products/admin`)
    const response = await route.fetch({ url: target, headers: { ...route.request().headers(), ...masterHeaders } })
    await route.fulfill({ response, body: await response.body() })
  })

  const orderPathId = qaResults.mainOrderNo!.replace(/\//g, '-')
  await page.goto(`${DESKTOP_BASE}/#/sales/partner-orders/${orderPathId}`, { waitUntil: 'domcontentloaded' })
  const closeUpdate = page.getByRole('button', { name: '닫기' })
  if (await closeUpdate.isVisible({ timeout: 10_000 }).catch(() => false)) await closeUpdate.click()
  await expect(page.getByRole('heading', { name: '주문서 상세', level: 3 }), '주문 상세 해시 라우트 미도달').toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('거래처 · 주식회사 중앙유통', { exact: true }), 'R03 거래처명 fallback 미도달').toBeVisible()
  const savedAddresses = page.getByText('서울특별시 R17 격리 QA로 16 16층', { exact: false })
  await expect(savedAddresses).toHaveCount(2)
  await expect(savedAddresses.first()).toBeVisible()
  await expect(page.getByText('2026-08-31', { exact: true })).toBeVisible()
  await expect(page.getByText('R17 헤더 보존 격리 QA', { exact: true })).toBeVisible()
  console.log(`R03_R05_SCREEN orderNo=${qaResults.mainOrderNo} partner=주식회사 중앙유통 address=서울특별시 R17 격리 QA로 16 16층 paymentDue=2026-08-31 memo=R17 헤더 보존 격리 QA`)
  await page.screenshot({ path: path.join(SHOTS, '06-r03-r05-order-detail-real-qa.png'), fullPage: true })

  await page.getByLabel('AR06D1150HZN 재고조회 선택').check()
  await page.getByTestId('partner-order-inventory-lookup-btn').click()
  await expect(page.getByTestId('inventory-lookup-modal'), '일반 품목 재고조회 모달 미도달').toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('inventory-lookup-error')).toHaveCount(0)
  await expect(page.getByTestId('inventory-lookup-loading')).toHaveCount(0, { timeout: 30_000 })
  console.log('NORMAL_ITEM_INVENTORY_SCREEN model=AR06D1150HZN modal=visible error=0')
  await page.screenshot({ path: path.join(SHOTS, '07-normal-item-inventory-real-qa.png'), fullPage: true })
  await page.getByRole('button', { name: '닫기' }).last().click()

  await page.goto(`${DESKTOP_BASE}/#/admin/sheet-sync`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('admin-sheetsync-retired'), '시트 폐기 안내 해시 라우트 미도달').toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('heading', { name: '구글 시트 동기화 폐기', level: 3 })).toBeVisible()
  await expect(page.getByText('구글 시트 연계는 폐기되었습니다. 현재 품목 카탈로그는 데이터베이스를 기준으로 사용합니다.', { exact: true })).toBeVisible()
  await expect(page.getByTestId('admin-sheetsync-trigger-btn')).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
  console.log('SHEET_RETIRED_SCREEN 안내=구글 시트 연계는 폐기되었습니다 버튼=0 일반장애문구=0')
  await page.screenshot({ path: path.join(SHOTS, '08-sheet-sync-retired-real-qa.png'), fullPage: true })

  await page.goto(`${DESKTOP_BASE}/#/products/catalog`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '기초품목 관리', level: 3 }), 'DB 카탈로그 해시 라우트 미도달').toBeVisible({ timeout: 30_000 })
  const catalogSearch = page.getByTestId('product-catalog-search-input')
  await catalogSearch.fill('AR06D1150HZN')
  await page.getByTestId('product-catalog-query-button').click()
  await expect(page.getByTestId('product-catalog-table')).toContainText('AR06D1150HZN', { timeout: 30_000 })
  await expect(page.getByTestId('product-catalog-table')).toContainText('냉전 일반 벽걸이 실내기')
  console.log('CATALOG_NORMAL_SEARCH_SCREEN model=AR06D1150HZN result=냉전 일반 벽걸이 실내기')
  await page.screenshot({ path: path.join(SHOTS, '09-db-catalog-normal-search-real-qa.png'), fullPage: true })
  await page.unrouteAll({ behavior: 'ignoreErrors' })
})
