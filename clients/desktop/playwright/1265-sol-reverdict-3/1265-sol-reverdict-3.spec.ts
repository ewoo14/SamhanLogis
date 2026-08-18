import { expect, test, type Page, type Route } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const estimateBase = 'http://127.0.0.1:2583'
const desktopBase = 'http://127.0.0.1:25173'
const gatewayBase = 'http://127.0.0.1:8080'
const authBase = 'http://127.0.0.1:8081'
const slipBase = 'http://127.0.0.1:48086'
const orderBase = 'http://127.0.0.1:25180'
const partnerOrderBase = 'http://127.0.0.1:28088'
const shots = resolveQaShotsDir(path.resolve(process.cwd(), '../../docs/qa/1265-sol-reverdict-3/screenshots'))

type Login = Record<string, unknown>
type Line = {
  productName: string
  modelName: string
  quantity: number
  unitPriceWithVat: string
  supplyAmount: string
  vatAmount: string
  lineTotal: string
  categoryKey?: string | null
  bundleSetOptions?: Record<string, unknown> | null
}
type Detail = { slipNo: string; status: string; sourceReference?: string | null; lines: Line[] }

function trusted(login: Login): Record<string, string> {
  return {
    'X-Samhan-Gateway-Attestation': resolveQaCredential('SAMHAN_GATEWAY_ATTESTATION'),
    'X-User-Id': String(login['userId'] ?? ''),
    'X-User-Role': String(login['role'] ?? 'MASTER'),
    'X-User-Groups': String(login['groups'] ?? ''),
    'X-User-Name': 'CODEX-SOL-R3',
    'X-Is-System-Master': 'true',
    'X-Is-Partner': 'false',
  }
}

async function branchJson(page: Page, login: Login, pathname: string): Promise<{ status: number; data: any }> {
  const response = await page.request.get(`${slipBase}${pathname}`, { headers: trusted(login) })
  const json = await response.json()
  return { status: response.status(), data: json.data ?? json }
}

async function configureEstimate(page: Page, customerQuery = 'QA'): Promise<void> {
  await page.goto(`${estimateBase}/?email=dev_master@samhan-air.com`, { waitUntil: 'load' })
  await page.waitForTimeout(4_000)
  await page.locator('#btnGoSingle').evaluate(node => (node as HTMLButtonElement).click())
  for (const [selector, index] of [['#ss_remote', 2], ['#ss_panel', 4], ['#ss_p360', 1], ['#ss_mat', 0]] as const) {
    await page.locator(selector).evaluate((node, selectedIndex) => {
      const select = node as HTMLSelectElement
      select.selectedIndex = selectedIndex
      select.dispatchEvent(new Event('change', { bubbles: true }))
    }, index)
  }
  const setRow = page.locator('tr[data-id]:visible').filter({ hasText: 'AC060CS6PBH1SY' }).first()
  await setRow.locator('.qty-input').fill('3')
  await setRow.locator('.qty-input').blur()
  await page.waitForTimeout(700)
  await page.locator('#btnGoFinal').evaluate(node => (node as HTMLButtonElement).click())
  await page.locator('#btnGoOrderInfo').evaluate(node => (node as HTMLButtonElement).click())
  await page.locator('#custSearch').fill(customerQuery)
  await page.waitForTimeout(500)
  await page.locator('#custSuggestions .ac-row').click()
  await page.locator('#addrBase').fill('QA isolation address')
  await page.locator('#addrDetail').fill('PR1265-R3')
  if (!(await page.locator('#sameAddr').isChecked())) await page.locator('#sameAddr').check()
  await page.locator('#tel').fill('01012345678')
  await page.locator('#memo').fill('PR1265 SOL reverdict 3 isolated QA')
  await page.locator('#managerSearch').fill('dev')
  await page.waitForTimeout(500)
  await page.locator('#managerSuggestions .ac-row').first().click()
  await page.locator('#memo').press('Tab')
  await expect(page.locator('#btnGenSlip')).toBeEnabled()
}

async function forwardDesktop(route: Route, login: Login): Promise<void> {
  const request = route.request()
  const incoming = new URL(request.url())
  const branchPath = incoming.pathname.startsWith('/api/v1/')
    ? incoming.pathname.slice('/api/v1'.length)
    : incoming.pathname
  const isSlip = branchPath.startsWith('/slips/') || branchPath === '/slips/query/daily-closing'
  const isMenu = incoming.pathname === '/auth/admin/menu-catalog'
  if (branchPath.endsWith('/realtime') || branchPath.endsWith('/collab/stream')) {
    await route.abort()
    return
  }
  if (!isSlip && !isMenu) {
    await route.continue()
    return
  }
  const headers = { ...request.headers(), ...trusted(login) }
  delete headers['host']
  const response = await route.fetch({
    url: `${isSlip ? slipBase : authBase}${isSlip ? branchPath : incoming.pathname}${incoming.search}`,
    headers,
  })
  await route.fulfill({ response })
}

async function installDesktopAuth(page: Page, login: Login): Promise<void> {
  await page.addInitScript(({ token, role, userId }) => {
    Object.defineProperty(window, 'samhanAuth', { configurable: true, value: {
      getToken: async () => ({ token, role, userId, fullName: 'dev_master', partnerCode: null }),
      setToken: async () => undefined,
      clearToken: async () => undefined,
    } })
    Object.defineProperty(window, 'samhanUpdater', { configurable: true, value: {
      check: async () => undefined,
      install: async () => undefined,
      quit: async () => undefined,
      onStatus: (listener: (status: { kind: string }) => void) => {
        setTimeout(() => listener({ kind: 'not-available' }), 0)
        return () => undefined
      },
    } })
  }, { token: login['token'], role: login['role'], userId: login['userId'] })
  await page.route(`${gatewayBase}/**`, route => forwardDesktop(route, login))
}

async function loginDesktopUiIfNeeded(page: Page): Promise<void> {
  const loginButton = page.getByRole('button', { name: '로그인', exact: true })
  await expect(loginButton).toBeVisible({ timeout: 30_000 })
  const close = page.getByRole('button', { name: '닫기', exact: true })
  if (await close.isVisible().catch(() => false)) await close.click()
  await page.getByLabel('사용자 ID (필수)').fill('dev_master')
  await page.getByLabel('비밀번호 (필수)').fill(resolveQaCredential('QA_DEV_DEFAULT_PASSWORD'))
  await loginButton.click()
  await expect(loginButton).toBeHidden({ timeout: 60_000 })
}

test('최초 생성부터 가격수정과 일마감까지 같은 금액이며 28행 속성을 보존한다', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept())
  const loginResponse = await page.request.post(`${gatewayBase}/auth/login`, {
    data: { loginId: 'dev_master', password: resolveQaCredential('QA_DEV_DEFAULT_PASSWORD') },
  })
  expect(loginResponse.status()).toBe(200)
  const login = ((await loginResponse.json()).data ?? {}) as Login
  const ids: string[] = (process.env['EXISTING_SLIP_IDS'] ?? '').split(',').filter(Boolean)
  if (ids.length === 0) {
    for (let i = 0; i < 7; i++) {
      await configureEstimate(page)
      const rpc = page.waitForResponse(r => r.url().includes('/rpc/sendOrderFromUi') && r.request().method() === 'POST')
      await page.locator('#btnGenSlip').click()
      const response = await rpc
      expect(response.ok(), `견적 ${i + 1} 발행 ${response.status()}`).toBeTruthy()
      const result = (await response.json()).result
      expect(result.ok, JSON.stringify(result)).toBeTruthy()
      ids.push(String(result.body?.data?.slipId ?? result.body?.slipId ?? ''))
    }
  }
  expect(ids).toHaveLength(7)

  const details: Detail[] = []
  for (const id of ids) {
    const result = await branchJson(page, login, `/slips/${id}`)
    expect(result.status).toBe(200)
    details.push(result.data as Detail)
  }
  const allLines = details.flatMap(d => d.lines)
  const fractional = allLines.filter(line => [line.supplyAmount, line.vatAmount, line.lineTotal]
    .some(value => !Number.isInteger(Number(value))))
  const named = allLines.filter(line => Boolean(line.productName?.trim()))
  expect(allLines).toHaveLength(28)
  expect(fractional).toHaveLength(0)
  expect(named).toHaveLength(28)

  let pathId = ids[0]!
  let first = details[0]!
  if (process.env['PATH_SLIP_ID']) {
    pathId = process.env['PATH_SLIP_ID']
    first = (await branchJson(page, login, `/slips/${pathId}`)).data as Detail
  } else if (process.env['EXISTING_SLIP_IDS']) {
    await configureEstimate(page, '능동')
    const rpc = page.waitForResponse(r => r.url().includes('/rpc/sendOrderFromUi') && r.request().method() === 'POST')
    await page.locator('#btnGenSlip').click()
    const response = await rpc
    expect(response.ok(), `금액 3경로용 견적 발행 ${response.status()}`).toBeTruthy()
    const result = (await response.json()).result
    expect(result.ok, JSON.stringify(result)).toBeTruthy()
    pathId = String(result.body?.data?.slipId ?? result.body?.slipId ?? '')
    first = (await branchJson(page, login, `/slips/${pathId}`)).data as Detail
  }
  const firstLine = first.lines.find(line => line.modelName === 'AC060CN6PBH1')!
  expect(firstLine.quantity).toBe(3)
  const initial = {
    supply: String(firstLine.supplyAmount),
    vat: String(firstLine.vatAmount),
    total: String(Number(firstLine.unitPriceWithVat) * firstLine.quantity),
    unit: firstLine.unitPriceWithVat,
  }
  await installDesktopAuth(page, login)
  await page.goto(`${desktopBase}/#/sales/${pathId}`, { waitUntil: 'domcontentloaded' })
  await page.screenshot({ path: path.join(shots, '00-desktop-route-diagnostic.png'), fullPage: true })
  if (first.status === 'DRAFT') {
    await page.getByTestId('sales-slip-edit-button').click({ timeout: 30_000 })
    await expect(page.getByTestId('slip-source-reference')).toContainText(String(first.sourceReference), { timeout: 60_000 })
    await page.screenshot({ path: path.join(shots, '01-initial-slip-source-and-4rows.png'), fullPage: true })
    await page.getByTestId('sales-slip-edit-cancel').click()
  }

  const allActions = ['save', 'send', 'accept', 'process', 'complete', 'inspect']
  const actionStart = first.status === 'COMPLETED' ? 6 : first.status === 'SENT' ? 2 : first.status === 'ACCEPTED' ? 3 : first.status === 'PROCESSING' ? 4 : 0
  for (const action of allActions.slice(actionStart)) {
    const response = await page.request.post(`${slipBase}/slips/${pathId}/${action}`, { headers: trusted(login), data: {} })
    expect(response.status(), `${action}: ${await response.text()}`).toBe(200)
  }
  await page.goto(`${desktopBase}/#/accounting/daily-closings`)
  await expect(page.getByTestId('daily-closing-nav')).toBeVisible({ timeout: 60_000 })
  await page.getByTestId('daily-closing-filter-date').fill('2026-08-18')
  await page.getByTestId('daily-closing-tab-pre_issued').click()
  const query = await branchJson(page, login, '/slips/query/daily-closing?slipDate=2026-08-18')
  const target = (query.data as any[]).find(row => (row.productModel ?? row.modelName) === 'AC060CN6PBH1')
  expect(target).toBeTruthy()
  const unit = page.getByTestId(`daily-closing-unit-${target.seqNo}`).first()
  await unit.fill(String(Number(initial.unit) - 1))
  await unit.fill(String(Number(initial.unit)))
  const row = unit.locator('xpath=ancestor::tr')
  const cell = async (name: string) => (await row.locator(`[data-testid$="-${name}"]`).innerText()).trim().replace(/,/g, '')
  const editing = { supply: await cell('공급가액'), vat: await cell('부가세'), total: await cell('합계') }
  await row.screenshot({ path: path.join(shots, '02-price-edit-same-unit.png') })
  await page.getByTestId('daily-closing-save-all').click()
  await expect(page.getByText(/저장되었습니다|금액 수정/).first()).toBeVisible({ timeout: 30_000 })
  await page.reload()
  await expect(page.getByTestId('daily-closing-nav')).toBeVisible({ timeout: 60_000 })
  await page.getByTestId('daily-closing-filter-date').fill('2026-08-18')
  await page.getByTestId('daily-closing-tab-pre_issued').click()
  const reRow = page.locator('tr').filter({ hasText: String(target.productName) }).first()
  await expect(reRow).toBeVisible({ timeout: 30_000 })
  const reCell = async (name: string) => (await reRow.locator(`[data-testid$="-${name}"]`).innerText()).trim().replace(/,/g, '')
  const requery = { supply: await reCell('공급가액'), vat: await reCell('부가세'), total: await reCell('합계') }
  await reRow.screenshot({ path: path.join(shots, '03-daily-closing-requery.png') })
  fs.writeFileSync(path.join(shots, 'amount-evidence.json'), `${JSON.stringify({
    rowCounts: { slips: details.length, lines: allLines.length, fractional: fractional.length, named: named.length },
    sourceReference: first.sourceReference,
    path: { model: firstLine.modelName, quantity: firstLine.quantity, unit: firstLine.unitPriceWithVat, initial, priceEdit: editing, dailyClosingRequery: requery },
  }, null, 2)}\n`, 'utf8')
  expect(editing).toEqual({ supply: initial.supply, vat: initial.vat, total: initial.total })
  expect(requery).toEqual({ supply: initial.supply, vat: initial.vat, total: initial.total })
})

test('신규 단건 주문번호가 실제 전표 화면에 표시된다', async ({ page }) => {
  const loginResponse = await page.request.post(`${gatewayBase}/auth/login`, {
    data: { loginId: 'dev_master', password: resolveQaCredential('QA_DEV_DEFAULT_PASSWORD') },
  })
  const login = ((await loginResponse.json()).data ?? {}) as Login
  const partnerOrderId = crypto.randomUUID()
  const orderNo = '2026/08/18-501'
  const response = await page.request.post(`${slipBase}/api/v1/slips/from-partner-order`, {
    headers: { ...trusted(login), 'Idempotency-Key': `sol-r3-${partnerOrderId}` },
    data: {
      partnerOrderId, orderNo, ioDate: '20260818', partnerCode: '4483500844', bizCode: '4483500844',
      partnerName: '능동에어컨(박수천)', employeeCode: 'EMP-0002', warehouseCode: '00003', shippingAddress: '경기 성남시',
      deliveryAddress: '경기 성남구', receiverPhone: '010-1111-1111', memo: 'SOL R3 단건', paymentDueLabel: '월말 결제',
      discountInfo: '', orderApprovedAt: '2026-08-18T09:00:00', lines: [{ lineNo: 1, productCode: 'AC060CN6PBH1',
        productName: '360 CST UV 실내기', spec: 'AC060CN6PBH1', qty: '3', unitPriceExVat: 100000, unitPriceVat: 110000,
        supplyAmount: 300000, vatAmount: 30000, remarks: 'PO 라인' }],
    },
  })
  expect(response.status(), await response.text()).toBe(201)
  const body = await response.json()
  const slipId = String(body.data.slipId)
  const detail = await branchJson(page, login, `/slips/${slipId}`)
  expect(detail.data.sourceReference).toBe(orderNo)
  await installDesktopAuth(page, login)
  await page.goto(`${desktopBase}/#/sales/${slipId}`, { waitUntil: 'domcontentloaded' })
  const source = page.getByTestId('slip-detail-source-reference')
  if (!(await source.isVisible().catch(() => false))) {
    const edit = page.getByTestId('sales-slip-edit-button')
    if (await edit.isVisible().catch(() => false)) {
      await edit.click()
      await expect(page.getByTestId('slip-source-reference')).toContainText(orderNo)
    }
  }
  await page.screenshot({ path: path.join(shots, '04-new-single-order-number-visible.png'), fullPage: true })
  const bodyText = await page.locator('body').innerText()
  fs.writeFileSync(path.join(shots, 'order-source-evidence.json'), `${JSON.stringify({ orderNo, sourceReference: detail.data.sourceReference, screenVisible: bodyText.includes(orderNo) }, null, 2)}\n`, 'utf8')
  expect(bodyText).not.toContain(partnerOrderId)
  await expect(source).toContainText(orderNo, { timeout: 5_000 })
})

test('인증된 주문서웹 홈멀티 실제 행 수를 센다', async ({ page }) => {
  await page.route('**/api/v1/partner-orders/**', async route => {
    const url = new URL(route.request().url())
    const response = await route.fetch({ url: `${partnerOrderBase}${url.pathname}${url.search}`, headers: {
      ...route.request().headers(), 'X-Samhan-Gateway-Attestation': resolveQaCredential('SAMHAN_GATEWAY_ATTESTATION'),
      'X-Partner-Code': 'QA-ORDER-PORTAL', 'X-Biz-Code': '9999000001',
    } })
    await route.fulfill({ response })
  })
  await page.goto(orderBase, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3_500)
  await page.locator('#bizGateInput').fill('9999000001')
  await page.locator('#btnBizQuery').click()
  await page.waitForTimeout(500)
  await page.locator('#authPw1').fill(resolveQaCredential('QA_PARTNER_ORDER_PASSWORD'))
  await page.locator('#btnAuthAction').click()
  await expect(page.locator('#pageBizGate')).toBeHidden({ timeout: 30_000 })
  await expect(page.locator('#welcomeAnimLayer')).toBeHidden({ timeout: 10_000 })
  const noButton = page.getByRole('button', { name: '아니오', exact: true })
  if (await noButton.isVisible().catch(() => false)) await noButton.click()
  await page.locator('#btnEnterHome').evaluate(node => (node as HTMLButtonElement).click())
  await expect(page.locator('#cardHome')).toBeVisible()
  await page.waitForTimeout(700)
  const tutorialExit = page.getByRole('button', { name: /튜토리얼 (스킵|종료)|아니오/ }).first()
  if (await tutorialExit.isVisible().catch(() => false)) await tutorialExit.click()
  const rows = page.locator('#homeBody tr:visible').filter({ has: page.locator('td') })
  await expect.poll(() => rows.count(), { timeout: 30_000 }).toBeGreaterThan(0)
  const rowCount = await rows.count()
  const firstRowText = (await rows.first().innerText()).trim()
  await rows.first().screenshot({ path: path.join(shots, '05-order-web-home-catalog-rows.png') })
  fs.writeFileSync(path.join(shots, 'order-web-evidence.json'), `${JSON.stringify({ authenticated: true, section: '홈멀티', rowCount, firstRowText }, null, 2)}\n`, 'utf8')
})
