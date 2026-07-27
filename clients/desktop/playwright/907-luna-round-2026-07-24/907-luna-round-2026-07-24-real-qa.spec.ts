import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
import { expect, test, type Page } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5210'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const QA_DIR = resolveQaShotsDir(path.resolve(process.cwd(), '..', '..', 'docs', 'qa', '907-luna-round-2026-07-24'))
const DOWNLOAD_DIR = path.join(QA_DIR, 'downloads')
fs.mkdirSync(QA_DIR, { recursive: true })
fs.mkdirSync(DOWNLOAD_DIR, { recursive: true })

type LoginData = { token: string; role: string; userId: string; displayName: string; groups: unknown[] }

async function login(page: Page, loginId = 'dev_master'): Promise<LoginData> {
  const response = await page.request.post(`${API_BASE}/auth/login`, { data: { loginId, password: PASSWORD } })
  expect(response.ok(), `${loginId} login`).toBeTruthy()
  return ((await response.json()).data ?? {}) as LoginData
}

async function authStub(page: Page, data: LoginData): Promise<void> {
  await page.addInitScript((v: LoginData) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ token: v.token, userId: v.userId, role: v.role, fullName: v.displayName, partnerCode: null, groups: v.groups }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, data)
}

async function capture(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(QA_DIR, `${name}.png`), fullPage: false })
}

async function openAndFailExport(page: Page, route: string, button: string, errorTestId: string, name: string): Promise<void> {
  const data = await login(page)
  await authStub(page, data)
  await page.route('**/*.xlsx**', (request) => request.abort())
  await page.goto(`${BASE_URL}/#${route}`)
  await expect(page.getByTestId(button)).toBeVisible({ timeout: 30_000 })
  await page.getByTestId(button).click({ force: true })
  const alert = page.getByTestId(errorTestId)
  await expect(alert).toBeVisible({ timeout: 10_000 })
  await expect(alert).toContainText('Excel 다운로드에 실패했습니다')
  await capture(page, name)
}

test('LIKE literal sweep — 거래처·판매관리·구매관리 실제 입력 결과', async ({ page }) => {
  const data = await login(page)
  await authStub(page, data)
  const headers = { Authorization: `Bearer ${data.token}` }
  const urls = [
    ['거래처', '/admin/partners/search?page=0&size=200&q=%25'],
    ['거래처', '/admin/partners/search?page=0&size=200&q=_'],
    ['거래처 정상어', '/admin/partners/search?page=0&size=200&q=P-2026-0002'],
    ['판매관리', '/slips/query?page=0&size=200&searchPartnerName=%25'],
    ['판매관리', '/slips/query?page=0&size=200&searchPartnerName=_'],
    ['판매관리 정상어', '/slips/query?page=0&size=200&searchPartnerName=HankookHVAC'],
    ['구매관리', '/slips/query?page=0&size=200&slipType=INBOUND&searchPartnerName=%25'],
    ['구매관리', '/slips/query?page=0&size=200&slipType=INBOUND&searchPartnerName=_'],
    ['구매관리 정상어', '/slips/query?page=0&size=200&slipType=INBOUND&searchPartnerName=거제공조산업'],
  ] as const
  for (const [surface, url] of urls) {
    const response = await page.request.get(`${API_BASE}${url}`, { headers })
    expect(response.ok(), `${surface} ${url}`).toBeTruthy()
    const dataBody = (await response.json()).data ?? {}
    const count = Number(dataBody.total ?? dataBody.totalElements ?? 0)
    console.log(`[LIKE-SWEEP] ${surface} ${url} => ${count}`)
  }
  await page.goto(`${BASE_URL}/#/admin/partners`)
  await expect(page.getByTestId('admin-partners-search-input')).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('admin-partners-search-input').fill('P-2026-0002')
  await expect(page.getByTestId('admin-partners-table')).toContainText('P-2026-0002')
  await capture(page, 'like-positive-partner-normal')

  for (const [route, button, input, apply, label] of [
    ['/sales', 'sales-query-search-btn', 'sales-query-search-partner-name', 'sales-query-search-apply', '판매관리'],
    ['/purchases', 'purchase-query-search-btn', 'purchase-query-search-partner-name', 'purchase-query-search-apply', '구매관리'],
  ] as const) {
    await page.goto(`${BASE_URL}/#${route}`)
    await expect(page.getByTestId(button)).toBeVisible({ timeout: 30_000 })
    for (const special of ['%', '_']) {
      await page.getByTestId(button).click()
      await page.getByTestId(input).fill(special)
      await page.getByTestId(apply).click()
      await expect(page.getByText(/총 \d+건/).first()).toBeVisible({ timeout: 15_000 })
      const countText = await page.getByText(/총 \d+건/).first().innerText()
      console.log(`[LIKE-SWEEP-UI] ${label} 입력=${special} => ${countText}`)
    }
  }
})

test('Excel 실패 안내 — 거래처 양성 대조', async ({ page }) => {
  await openAndFailExport(page, '/admin/partners', 'admin-partners-excel-export', 'admin-partners-excel-error', 'excel-failure-partners')
})

test('Excel 실패 안내 — 판매관리', async ({ page }) => {
  await openAndFailExport(page, '/sales', 'sales-query-excel-download', 'sales-query-excel-error', 'excel-failure-sales')
})

test('Excel 실패 안내 — 구매관리', async ({ page }) => {
  await openAndFailExport(page, '/purchases', 'purchase-query-excel-download', 'purchase-query-excel-error', 'excel-failure-purchases')
})

test('Excel 실패 안내 — 판매전표목록', async ({ page }) => {
  await openAndFailExport(page, '/sales/slips', 'slip-list-excel-export', 'slip-list-excel-error', 'excel-failure-slip-list')
})

test('Excel 실패 안내 — 분개장', async ({ page }) => {
  await openAndFailExport(page, '/accounting/journals', 'journal-list-excel-export', 'journal-list-excel-error', 'excel-failure-journals')
})

test('Excel 실패 안내 — 재고현황', async ({ page }) => {
  await openAndFailExport(page, '/transfers', 'transfer-list-stocks-excel-export', 'transfer-list-stocks-excel-error', 'excel-failure-stocks')
})

test('F-1 Excel 4경로 — 실제 다운로드 파일 저장', async ({ page }) => {
  const cases = [
    ['/admin/partners', 'admin-partners-excel-export', 'f1-partners.xlsx'],
    ['/sales/slips', 'slip-list-excel-export', 'f1-slips.xlsx'],
    ['/accounting/journals', 'journal-list-excel-export', 'f1-journals.xlsx'],
    ['/transfers', 'transfer-list-stocks-excel-export', 'f1-stocks.xlsx'],
  ] as const
  for (const [route, button, filename] of cases) {
    const data = await login(page)
    await authStub(page, data)
    await page.goto(`${BASE_URL}/#${route}`)
    await expect(page.getByTestId(button)).toBeVisible({ timeout: 30_000 })
    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId(button).click()
    const download = await downloadPromise
    await download.saveAs(path.join(DOWNLOAD_DIR, filename))
    expect(await download.failure()).toBeNull()
  }
})

test('F-4 인증 — 무토큰·위조헤더 401, dev_sales 403, dev_master 200', async ({ page }) => {
  const endpoint = `${API_BASE}/admin/partners/export.xlsx`
  const noToken = await page.request.get(endpoint)
  const forged = await page.request.get(endpoint, { headers: { Authorization: 'Bearer forged-token' } })
  const sales = await login(page, 'dev_sales')
  const salesResponse = await page.request.get(endpoint, { headers: { Authorization: `Bearer ${sales.token}` } })
  const master = await login(page, 'dev_master')
  const masterResponse = await page.request.get(endpoint, { headers: { Authorization: `Bearer ${master.token}` } })
  console.log(`[F-4] no-token=${noToken.status()} forged=${forged.status()} dev_sales=${salesResponse.status()} dev_master=${masterResponse.status()}`)
  expect(noToken.status()).toBe(401)
  expect(forged.status()).toBe(401)
  expect(salesResponse.status()).toBe(403)
  expect(masterResponse.status()).toBe(200)
})

test('F-6 화면 필터와 Excel — 6화면 실제 건수 기록', async ({ page }) => {
  const data = await login(page)
  await authStub(page, data)
  const countText = async (label: string): Promise<void> => {
    const text = await page.locator('body').innerText()
    const match = text.match(/총\s*([\d,]+)건/)
    console.log(`[F-6] ${label} 화면=${match?.[1] ?? '표시없음'}`)
  }
  const download = async (filename: string): Promise<void> => {
    const event = page.waitForEvent('download')
    const buttons = page.locator('button[data-testid$="excel-export"], button[data-testid$="excel-download"]')
    await buttons.first().click({ force: true })
    await (await event).saveAs(path.join(DOWNLOAD_DIR, filename))
  }

  await page.goto(`${BASE_URL}/#/admin/partners`)
  await expect(page.getByTestId('admin-partners-search-input')).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('admin-partners-search-input').fill('P-2026-0002')
  await page.waitForTimeout(600)
  await countText('거래처')
  await download('f6-partners.xlsx')

  await page.goto(`${BASE_URL}/#/sales`)
  await expect(page.getByTestId('sales-query-search-btn')).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('sales-query-search-btn').click()
  await page.getByTestId('sales-query-search-slipno').fill('2026/07/18-4')
  await page.getByTestId('sales-query-search-apply').click()
  await page.waitForTimeout(600)
  await countText('판매관리')
  await download('f6-sales.xlsx')

  await page.goto(`${BASE_URL}/#/purchases`)
  await expect(page.getByTestId('purchase-query-search-btn')).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('purchase-query-search-btn').click()
  await page.getByTestId('purchase-query-search-slipno').fill('2026/07/17-8')
  await page.getByTestId('purchase-query-search-apply').click()
  await page.waitForTimeout(600)
  await countText('구매관리')
  await download('f6-purchases.xlsx')

  await page.goto(`${BASE_URL}/#/sales/slips`)
  await expect(page.getByTestId('slip-list-excel-export')).toBeVisible({ timeout: 30_000 })
  await page.getByLabel('배송태그 필터').selectOption('DAY')
  await page.waitForTimeout(600)
  await countText('판매전표목록 DAY')
  await download('f6-slip-list-day.xlsx')

  await page.goto(`${BASE_URL}/#/accounting/journals`)
  await expect(page.getByTestId('journal-list-excel-export')).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(600)
  await countText('분개장')
  await download('f6-journals.xlsx')

  await page.goto(`${BASE_URL}/#/transfers`)
  await expect(page.getByTestId('transfer-list-stocks-excel-export')).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(600)
  await countText('재고현황')
  await download('f6-stocks.xlsx')
})

test('F-5 실서버 병합 충돌 — 서로 다른 거래처 주문은 실제 409이고 수량은 변하지 않는다', async ({ page }) => {
  const data = await login(page)
  const headers = { Authorization: `Bearer ${data.token}` }
  const listResponse = await page.request.get(`${API_BASE}/api/v1/partner-orders?page=0&size=100&includeDeleted=false`, { headers })
  expect(listResponse.ok()).toBeTruthy()
  const content = ((await listResponse.json()).data?.content ?? []) as Array<{ orderNumber: string; partnerCode: string; status: string; mergeEligible?: boolean }>
  const candidates = content.filter((row) => ['DRAFT', 'ON_HOLD'].includes(row.status) && row.mergeEligible === false)
  const first = candidates[0]
  const second = candidates.find((row) => row.partnerCode !== first?.partnerCode)
  expect(first).toBeTruthy()
  expect(second).toBeTruthy()
  const pathId = (orderNumber: string) => orderNumber.replaceAll('/', '-')
  const detail = async (orderNumber: string) => {
    const response = await page.request.get(`${API_BASE}/api/v1/partner-orders/${encodeURIComponent(pathId(orderNumber))}`, { headers })
    expect(response.ok()).toBeTruthy()
    return (await response.json()).data as { lines: Array<{ lineId: string; convertedQuantity: number }> }
  }
  const firstDetail = await detail(first.orderNumber)
  const secondDetail = await detail(second.orderNumber)
  const firstLine = firstDetail.lines[0]
  const secondLine = secondDetail.lines[0]
  expect(firstLine?.lineId).toBeTruthy()
  expect(secondLine?.lineId).toBeTruthy()
  const before = [firstLine.convertedQuantity, secondLine.convertedQuantity]
  const response = await page.request.post(`${API_BASE}/api/v1/partner-orders/convert-to-slip-merge`, {
    headers,
    data: {
      orders: [
        { partnerOrderId: first.orderNumber, items: [{ orderLineId: firstLine.lineId, quantity: 1 }] },
        { partnerOrderId: second.orderNumber, items: [{ orderLineId: secondLine.lineId, quantity: 1 }] },
      ],
      warehouseCode: 'HQ-001',
      shippingInfo: { partnerName: 'F-5 conflict probe' },
    },
  })
  const afterFirst = await detail(first.orderNumber)
  const afterSecond = await detail(second.orderNumber)
  console.log(`[F-5] ${first.orderNumber}/${second.orderNumber} partner=${first.partnerCode}/${second.partnerCode} HTTP=${response.status()} converted=${before.join(',')}→${[afterFirst.lines[0].convertedQuantity, afterSecond.lines[0].convertedQuantity].join(',')}`)
  expect(response.status()).toBe(409)
  expect([afterFirst.lines[0].convertedQuantity, afterSecond.lines[0].convertedQuantity]).toEqual(before)
})
