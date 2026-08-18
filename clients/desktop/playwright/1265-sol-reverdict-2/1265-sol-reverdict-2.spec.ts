import { expect, test, type Page, type Route } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const estimateBase = 'http://127.0.0.1:2583'
const desktopBase = 'http://127.0.0.1:25173'
const gatewayBase = 'http://127.0.0.1:8080'
const authBase = 'http://127.0.0.1:8081'
const slipBase = 'http://127.0.0.1:28086'
const orderBase = 'http://127.0.0.1:25180'
const partnerOrderBase = 'http://127.0.0.1:28088'
const shots = resolveQaShotsDir(path.resolve(process.cwd(), '../../docs/qa/1265-sol-reverdict-2/screenshots'))

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
type Detail = { slipNo: string; status: string; sourceReference?: string | null; lines: Line[]; updatedAt: string }

function trusted(login: Login): Record<string, string> {
  return {
    'X-Samhan-Gateway-Attestation': resolveQaCredential('SAMHAN_GATEWAY_ATTESTATION'),
    'X-User-Id': String(login['userId'] ?? ''),
    'X-User-Role': String(login['role'] ?? 'MASTER'),
    'X-User-Groups': String(login['groups'] ?? ''),
    'X-User-Name': 'CODEX-SOL-R2',
    'X-Is-System-Master': 'true',
    'X-Is-Partner': 'false',
  }
}

async function branchJson(page: Page, login: Login, pathname: string): Promise<{ status: number; data: any }> {
  const response = await page.request.get(`${slipBase}${pathname}`, { headers: trusted(login) })
  const json = await response.json()
  return { status: response.status(), data: json.data ?? json }
}

async function configureEstimate(page: Page): Promise<void> {
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
  await page.locator('#custSearch').fill('QA')
  await page.waitForTimeout(500)
  await page.locator('#custSuggestions .ac-row').click()
  await page.locator('#addrBase').fill('QA isolation address')
  await page.locator('#addrDetail').fill('PR1265-R2')
  if (!(await page.locator('#sameAddr').isChecked())) await page.locator('#sameAddr').check()
  await page.locator('#tel').fill('01012345678')
  await page.locator('#memo').fill('PR1265 SOL reverdict 2 isolated QA')
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

test('견적 28행 보존과 동일 단가의 최초→금액수정→일마감 재조회 3지점을 실측한다', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept())
  const loginResponse = await page.request.post(`${gatewayBase}/auth/login`, {
    data: { loginId: 'dev_master', password: resolveQaCredential('QA_DEV_DEFAULT_PASSWORD') },
  })
  expect(loginResponse.status()).toBe(200)
  const login = ((await loginResponse.json()).data ?? {}) as Login
  const existingSlipId = process.env['EXISTING_SLIP_ID']
  const creationCount = Number(process.env['CREATION_COUNT'] ?? '7')
  const ids: string[] = existingSlipId ? [existingSlipId] : []
  if (!existingSlipId) {
    await configureEstimate(page)
    for (let i = 0; i < creationCount; i++) {
      if (i > 0) await configureEstimate(page)
      const rpc = page.waitForResponse(r => r.url().includes('/rpc/sendOrderFromUi') && r.request().method() === 'POST')
      await page.locator('#btnGenSlip').click()
      const response = await rpc
      expect(response.ok(), `견적 ${i + 1} 발행 ${response.status()}`).toBeTruthy()
      const body = await response.json()
      const result = body.result ?? body
      const payload = result.body?.data ?? result.body ?? {}
      expect(result.ok, JSON.stringify(result)).toBeTruthy()
      ids.push(String(payload.slipId ?? payload.id ?? ''))
      await page.waitForTimeout(8)
    }
  }
  expect(ids.every(Boolean)).toBeTruthy()

  const details: Detail[] = []
  for (const id of ids) {
    const result = await branchJson(page, login, `/slips/${id}`)
    expect(result.status).toBe(200)
    details.push(result.data as Detail)
  }
  const allLines = details.flatMap(d => d.lines)
  expect(allLines).toHaveLength(creationCount * 4)
  const fractional = allLines.filter(line => [line.supplyAmount, line.vatAmount, line.lineTotal]
    .some(value => !Number.isInteger(Number(value))))
  expect(fractional).toHaveLength(0)
  const first = details[0]!
  const firstLine = first.lines.find(line => line.modelName === 'AC060CN6PBH1')!
  expect(firstLine).toBeTruthy()
  expect(firstLine.quantity).toBe(3)
  const initial = {
    supply: firstLine.supplyAmount,
    vat: firstLine.vatAmount,
    total: String(Number(firstLine.unitPriceWithVat) * firstLine.quantity),
    unit: firstLine.unitPriceWithVat,
  }

  await page.addInitScript(({ token, role, userId }) => {
    Object.defineProperty(window, 'samhanAuth', { configurable: true, value: {
      getToken: async () => ({ token, role, userId, fullName: 'dev_master', partnerCode: null }),
      setToken: async () => undefined,
      clearToken: async () => undefined,
    } })
  }, { token: login['token'], role: login['role'], userId: login['userId'] })
  await page.route(`${gatewayBase}/**`, route => forwardDesktop(route, login))
  if (!existingSlipId) {
    await page.goto(`${desktopBase}/#/sales/${ids[0]}`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('sales-slip-edit-button').click()
    await expect(page.getByTestId('slip-source-reference')).toBeVisible({ timeout: 60_000 })
    expect((await page.getByTestId('slip-source-reference').innerText()).trim()).toContain(String(first.sourceReference))
    await page.screenshot({ path: path.join(shots, '01-initial-slip-source-and-4rows.png'), fullPage: true })
    await page.getByTestId('sales-slip-edit-cancel').click()
  }

  if (!existingSlipId) {
    for (const action of ['save', 'send', 'accept', 'process', 'complete', 'inspect']) {
      const response = await page.request.post(`${slipBase}/slips/${ids[0]}/${action}`, {
        headers: trusted(login), data: {},
      })
      expect(response.status(), `${action}: ${await response.text()}`).toBe(200)
    }
  }
  const afterTransitions = await branchJson(page, login, `/slips/${ids[0]}`)
  expect(afterTransitions.data.status).toBe('COMPLETED')

  await page.goto(`${desktopBase}/#/accounting/daily-closings`)
  await expect(page.getByTestId('daily-closing-nav')).toBeVisible({ timeout: 60_000 })
  await page.getByTestId('daily-closing-filter-date').fill('2026-08-18')
  await page.getByTestId('daily-closing-tab-pre_issued').click()
  await expect(page.getByTestId('daily-closing-table')).toBeVisible({ timeout: 30_000 })
  const query = await branchJson(page, login, '/slips/query/daily-closing?slipDate=2026-08-18')
  const target = (query.data as any[]).find(row => row.slipId === ids[0] && row.productModel === 'AC060CN6PBH1')
    ?? (query.data as any[]).find(row => row.slipId === ids[0] && row.quantity === 3)
  expect(target).toBeTruthy()
  const unit = page.getByTestId(`daily-closing-unit-${target.seqNo}`).first()
  await unit.fill(String(Number(initial.unit) - 1))
  await unit.fill(String(Number(initial.unit)))
  const row = unit.locator('xpath=ancestor::tr')
  const cell = async (name: string) => (await row.locator(`[data-testid$="-${name}"]`).innerText()).trim().replace(/,/g, '')
  const editing = { supply: await cell('공급가액'), vat: await cell('부가세'), total: await cell('합계') }
  await page.screenshot({ path: path.join(shots, '02-price-edit-same-unit-1won-flip.png'), fullPage: true })
  await page.getByTestId('daily-closing-save-all').click()
  await expect(page.getByText(/저장되었습니다|금액 수정/).first()).toBeVisible({ timeout: 30_000 })
  await page.reload()
  await expect(page.getByTestId('daily-closing-nav')).toBeVisible({ timeout: 60_000 })
  await page.getByTestId('daily-closing-filter-date').fill('2026-08-18')
  await page.getByTestId('daily-closing-tab-pre_issued').click()
  await expect(page.getByTestId(`daily-closing-unit-${target.seqNo}`).first()).toBeVisible()
  const reRow = page.getByTestId(`daily-closing-unit-${target.seqNo}`).first().locator('xpath=ancestor::tr')
  const reCell = async (name: string) => (await reRow.locator(`[data-testid$="-${name}"]`).innerText()).trim().replace(/,/g, '')
  const requery = { supply: await reCell('공급가액'), vat: await reCell('부가세'), total: await reCell('합계') }
  await page.screenshot({ path: path.join(shots, '03-daily-closing-requery-1won-flip.png'), fullPage: true })

  const evidence = {
    rowCounts: { slips: details.length, lines: allLines.length, fractional: fractional.length },
    sourceReference: String(first.sourceReference ?? ''),
    path: { model: firstLine.modelName, quantity: firstLine.quantity, unit: firstLine.unitPriceWithVat, initial, priceEdit: editing, dailyClosingRequery: requery },
  }
  fs.writeFileSync(path.join(shots, 'amount-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
})

test('인증된 주문서웹 홈멀티 품목 표의 실제 행 수를 확인한다', async ({ page }) => {
  await page.route('**/api/v1/partner-orders/**', async route => {
    const url = new URL(route.request().url())
    const response = await route.fetch({
      url: `${partnerOrderBase}${url.pathname}${url.search}`,
      headers: {
        ...route.request().headers(),
        'X-Samhan-Gateway-Attestation': resolveQaCredential('SAMHAN_GATEWAY_ATTESTATION'),
        'X-Partner-Code': 'QA-ORDER-PORTAL',
        'X-Biz-Code': '9999000001',
      },
    })
    await route.fulfill({ response })
  })
  await page.goto(orderBase, { waitUntil: 'domcontentloaded' })
  await page.locator('#bizGateInput').fill('9999000001')
  await page.locator('#btnBizQuery').click()
  await page.locator('#authPw1').fill(resolveQaCredential('QA_PARTNER_ORDER_PASSWORD'))
  await page.locator('#btnAuthAction').click()
  await expect(page.locator('#pageBizGate')).toBeHidden({ timeout: 30_000 })
  await expect(page.locator('#welcomeAnimLayer')).toBeHidden({ timeout: 10_000 })
  const noButton = page.getByRole('button', { name: '아니오', exact: true })
  if (await noButton.isVisible().catch(() => false)) await noButton.click()
  await expect(page.locator('#btnEnterHome')).toBeVisible({ timeout: 30_000 })
  await page.locator('#btnEnterHome').evaluate(node => (node as HTMLButtonElement).click())
  await expect(page.locator('#cardHome')).toBeVisible()
  await page.waitForTimeout(700)
  const tutorialExit = page.getByRole('button', { name: /튜토리얼 (스킵|종료)|아니오/ }).first()
  if (await tutorialExit.isVisible().catch(() => false)) await tutorialExit.click()
  await expect(page.locator('#tutBlockTop')).toBeHidden()
  const rows = page.locator('#homeBody tr:visible').filter({ has: page.locator('td') })
  await expect.poll(() => rows.count(), { timeout: 30_000 }).toBeGreaterThan(0)
  const rowCount = await rows.count()
  const firstRowText = (await rows.first().innerText()).trim()
  expect(firstRowText.length).toBeGreaterThan(0)
  await rows.first().screenshot({ path: path.join(shots, '04-order-web-home-catalog-rows.png') })
  fs.writeFileSync(path.join(shots, 'order-evidence.json'), `${JSON.stringify({ authenticated: true, section: '홈멀티', rowCount, firstRowText }, null, 2)}\n`, 'utf8')
})
