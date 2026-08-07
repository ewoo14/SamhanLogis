import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #907 OPUS 재수렴 적대검증 라이브 QA — 실서버(:8080) + 실 렌더러(vite dev).
 * 산출물 스크린샷: docs/qa/907-opus-reconv-2026-07-24/
 * 다운로드 xlsx: docs/qa/907-opus-reconv-2026-07-24/downloads/
 *
 * 커밋된 스크린샷을 절대 덮어쓰지 않는다(전용 디렉터리에만 기록).
 */
import { expect, test, type Page } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5230'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? (process.env.DEV_PASSWORD ?? '')
const QA_DIR = resolveQaShotsDir(path.resolve(process.cwd(), '..', '..', 'docs', 'qa', '907-opus-reconv-2026-07-24'))
const DL_DIR = path.join(QA_DIR, 'downloads')
fs.mkdirSync(QA_DIR, { recursive: true })
fs.mkdirSync(DL_DIR, { recursive: true })

type LoginData = { token: string; role: string; userId: string; displayName: string; groups: unknown[] }

async function login(page: Page, loginId = 'dev_master'): Promise<LoginData> {
  const response = await page.request.post(`${API_BASE}/auth/login`, { data: { loginId, password: PASSWORD } })
  expect(response.ok(), `${loginId} login ${response.status()}`).toBeTruthy()
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

async function cap(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(QA_DIR, `${name}.png`), fullPage: false })
}

/** 화면의 "총 N건" 숫자 파싱. */
async function readTotal(page: Page): Promise<number> {
  const el = page.getByText(/총\s*[\d,]+건/).first()
  await expect(el).toBeVisible({ timeout: 15_000 })
  const t = await el.innerText()
  const m = t.match(/총\s*([\d,]+)건/)
  return Number((m?.[1] ?? '0').replace(/,/g, ''))
}

/** 슬립 조회(판매/구매) 검색 모달로 partnerName 검색 후 적용. */
async function applyPartnerSearch(page: Page, prefix: string, value: string): Promise<void> {
  await page.getByTestId(`${prefix}-query-search-btn`).click()
  const input = page.getByTestId(`${prefix}-query-search-partner-name`)
  await expect(input).toBeVisible({ timeout: 10_000 })
  await input.fill(value)
  await page.getByTestId(`${prefix}-query-search-apply`).click()
  await page.waitForTimeout(900)
}

/** 검색 후 Excel 다운로드 → 저장, 데이터행 수는 별도 python 파싱. */
async function downloadExcel(page: Page, testId: string, filename: string): Promise<void> {
  const ev = page.waitForEvent('download')
  await page.getByTestId(testId).click({ force: true })
  const dl = await ev
  await dl.saveAs(path.join(DL_DIR, filename))
  expect(await dl.failure(), `${filename} download failure`).toBeNull()
}

// ───────────────────────────────────────────────────────────────────────────
// Test 1 — 판매관리 검색 escape + 화면↔Excel 대조 (Q1, Q5, F-2, F-6)
// ───────────────────────────────────────────────────────────────────────────
test('T1 판매관리 검색 %·_·혼합·정상 + Excel 대조', async ({ page }) => {
  const data = await login(page)
  await authStub(page, data)
  await page.goto(`${BASE_URL}/#/sales`)
  await expect(page.getByTestId('sales-query-search-btn')).toBeVisible({ timeout: 30_000 })
  const baseline = await readTotal(page)
  console.log(`[T1] 판매관리 baseline(기본창) = ${baseline}`)
  await cap(page, 't1-sales-00-baseline')

  // % (wildcard literal → 0 이어야 escape 성립)
  await applyPartnerSearch(page, 'sales', '%')
  const pct = await readTotal(page)
  console.log(`[T1] 판매관리 partnerName=% => 화면 ${pct}건`)
  await cap(page, 't1-sales-01-percent')
  await downloadExcel(page, 'sales-query-excel-download', 't1-sales-percent.xlsx')
  expect(pct, 'escape 성립 시 %는 wildcard 아님 → 0').toBe(0)

  // _ (single-char wildcard literal → 0)
  await applyPartnerSearch(page, 'sales', '_')
  const us = await readTotal(page)
  console.log(`[T1] 판매관리 partnerName=_ => 화면 ${us}건`)
  await cap(page, 't1-sales-02-underscore')
  await downloadExcel(page, 'sales-query-excel-download', 't1-sales-underscore.xlsx')
  expect(us).toBe(0)

  // 혼합 %HankookHVAC% (literal % 포함 → 0)
  await applyPartnerSearch(page, 'sales', '%HankookHVAC%')
  const mixed = await readTotal(page)
  console.log(`[T1] 판매관리 partnerName=%HankookHVAC% => 화면 ${mixed}건`)
  await cap(page, 't1-sales-03-mixed')
  expect(mixed).toBe(0)

  // 정상어 HankookHVAC (escape 과잉 아님 → ≥1)
  await applyPartnerSearch(page, 'sales', 'HankookHVAC')
  const normal = await readTotal(page)
  console.log(`[T1] 판매관리 partnerName=HankookHVAC => 화면 ${normal}건`)
  await cap(page, 't1-sales-04-normal')
  await downloadExcel(page, 'sales-query-excel-download', 't1-sales-normal.xlsx')
  expect(normal, '정상 검색은 깨지지 않아야 함').toBeGreaterThanOrEqual(1)
})

// ───────────────────────────────────────────────────────────────────────────
// Test 2 — 구매관리 검색 escape + 화면↔Excel 대조
// ───────────────────────────────────────────────────────────────────────────
test('T2 구매관리 검색 %·_·정상 + Excel 대조', async ({ page }) => {
  const data = await login(page)
  await authStub(page, data)
  await page.goto(`${BASE_URL}/#/purchases`)
  await expect(page.getByTestId('purchase-query-search-btn')).toBeVisible({ timeout: 30_000 })
  const baseline = await readTotal(page)
  console.log(`[T2] 구매관리 baseline(기본창) = ${baseline}`)
  await cap(page, 't2-purchase-00-baseline')

  await applyPartnerSearch(page, 'purchase', '%')
  const pct = await readTotal(page)
  console.log(`[T2] 구매관리 partnerName=% => 화면 ${pct}건`)
  await cap(page, 't2-purchase-01-percent')
  await downloadExcel(page, 'purchase-query-excel-download', 't2-purchase-percent.xlsx')
  expect(pct).toBe(0)

  await applyPartnerSearch(page, 'purchase', '_')
  const us = await readTotal(page)
  console.log(`[T2] 구매관리 partnerName=_ => 화면 ${us}건`)
  await cap(page, 't2-purchase-02-underscore')
  expect(us).toBe(0)

  await applyPartnerSearch(page, 'purchase', '거제')
  const normal = await readTotal(page)
  console.log(`[T2] 구매관리 partnerName=거제 => 화면 ${normal}건`)
  await cap(page, 't2-purchase-03-normal')
  await downloadExcel(page, 'purchase-query-excel-download', 't2-purchase-normal.xlsx')
  expect(normal, '정상 검색은 깨지지 않아야 함').toBeGreaterThanOrEqual(1)
})

// ───────────────────────────────────────────────────────────────────────────
// Test 3 — Excel 실패 안내 6화면 + 재시도 클리어 + 상태 누수 없음 (Q2, F-3)
// ───────────────────────────────────────────────────────────────────────────
const SCREENS: Array<{ route: string; button: string; error: string; name: string }> = [
  { route: '/admin/partners', button: 'admin-partners-excel-export', error: 'admin-partners-excel-error', name: 'partners' },
  { route: '/sales', button: 'sales-query-excel-download', error: 'sales-query-excel-error', name: 'sales' },
  { route: '/purchases', button: 'purchase-query-excel-download', error: 'purchase-query-excel-error', name: 'purchases' },
  { route: '/sales/slips', button: 'slip-list-excel-export', error: 'slip-list-excel-error', name: 'slip-list' },
  { route: '/accounting/journals', button: 'journal-list-excel-export', error: 'journal-list-excel-error', name: 'journals' },
  { route: '/transfers', button: 'transfer-list-stocks-excel-export', error: 'transfer-list-stocks-excel-error', name: 'stocks' },
]

for (const s of SCREENS) {
  test(`T3 Excel 실패 안내 — ${s.name}`, async ({ page }) => {
    const data = await login(page)
    await authStub(page, data)
    // 다운로드 요청만 중단 (export.xlsx / 관련 export 경로)
    await page.route('**/*export*', (r) => r.abort())
    await page.goto(`${BASE_URL}/#${s.route}`)
    const btn = page.getByTestId(s.button)
    await expect(btn).toBeVisible({ timeout: 30_000 })
    // 실패 전: alert 없음
    await expect(page.getByTestId(s.error)).toHaveCount(0)
    await btn.click({ force: true })
    const alert = page.getByTestId(s.error)
    await expect(alert).toBeVisible({ timeout: 10_000 })
    await expect(alert).toContainText('Excel 다운로드에 실패했습니다')
    await cap(page, `t3-fail-${s.name}`)
  })
}

test('T3b 재시도 성공 시 안내 사라짐 + 정상 다운로드 (판매관리)', async ({ page }) => {
  const data = await login(page)
  await authStub(page, data)
  let blockExport = true
  await page.route('**/*export*', (r) => (blockExport ? r.abort() : r.continue()))
  await page.goto(`${BASE_URL}/#/sales`)
  await expect(page.getByTestId('sales-query-excel-download')).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('sales-query-excel-download').click({ force: true })
  await expect(page.getByTestId('sales-query-excel-error')).toBeVisible({ timeout: 10_000 })
  await cap(page, 't3b-01-failed')
  // 네트워크 복구 후 재시도 → 다운로드 성공 + alert 소거
  blockExport = false
  const ev = page.waitForEvent('download')
  await page.getByTestId('sales-query-excel-download').click({ force: true })
  const dl = await ev
  await dl.saveAs(path.join(DL_DIR, 't3b-retry.xlsx'))
  await expect(page.getByTestId('sales-query-excel-error')).toHaveCount(0)
  await cap(page, 't3b-02-retry-cleared')
})

test('T3c 공통 컴포넌트 상태 누수 없음 (판매관리 실패 → 구매관리 무알림)', async ({ page }) => {
  const data = await login(page)
  await authStub(page, data)
  await page.route('**/*export*', (r) => r.abort())
  await page.goto(`${BASE_URL}/#/sales`)
  await expect(page.getByTestId('sales-query-excel-download')).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('sales-query-excel-download').click({ force: true })
  await expect(page.getByTestId('sales-query-excel-error')).toBeVisible({ timeout: 10_000 })
  // 구매관리로 이동 → 이전 실패 상태가 새지 않아야 함
  await page.goto(`${BASE_URL}/#/purchases`)
  await expect(page.getByTestId('purchase-query-excel-download')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('purchase-query-excel-error')).toHaveCount(0)
  await cap(page, 't3c-purchase-no-leak')
})

// ───────────────────────────────────────────────────────────────────────────
// Test 4 — 6화면 정상 다운로드 (wiring 무회귀) + 정상시 무알림 (Q3, F-1)
// ───────────────────────────────────────────────────────────────────────────
test('T4 6화면 정상 Excel 다운로드 + 무알림', async ({ page }) => {
  const data = await login(page)
  await authStub(page, data)
  for (const s of SCREENS) {
    await page.goto(`${BASE_URL}/#${s.route}`)
    await expect(page.getByTestId(s.button)).toBeVisible({ timeout: 30_000 })
    const ev = page.waitForEvent('download')
    await page.getByTestId(s.button).click({ force: true })
    const dl = await ev
    await dl.saveAs(path.join(DL_DIR, `t4-${s.name}.xlsx`))
    expect(await dl.failure(), `${s.name} 정상 다운로드 실패`).toBeNull()
    // 정상 다운로드 시 실패 안내가 뜨면 안 됨 (false positive)
    await expect(page.getByTestId(s.error), `${s.name} 정상시 무알림`).toHaveCount(0)
    console.log(`[T4] ${s.name} 정상 다운로드 OK, 무알림 확인`)
  }
  await cap(page, 't4-last-stocks-normal')
})

// ───────────────────────────────────────────────────────────────────────────
// Test 5 — F-6 화면 필터 ↔ Excel 6화면 건수 일치
// ───────────────────────────────────────────────────────────────────────────
test('T5 F-6 화면 필터 ↔ Excel 6화면', async ({ page }) => {
  const data = await login(page)
  await authStub(page, data)

  // 거래처: 검색어 P-2026-0002
  await page.goto(`${BASE_URL}/#/admin/partners`)
  await expect(page.getByTestId('admin-partners-search-input')).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('admin-partners-search-input').fill('P-2026-0002')
  await page.waitForTimeout(900)
  console.log(`[T5] 거래처 화면 총 = ${await readTotalSafe(page)}`)
  await cap(page, 't5-partners')
  await downloadExcel(page, 'admin-partners-excel-export', 't5-partners.xlsx')

  // 판매관리: slipNo 2026/07/18-4
  await page.goto(`${BASE_URL}/#/sales`)
  await expect(page.getByTestId('sales-query-search-btn')).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('sales-query-search-btn').click()
  await page.getByTestId('sales-query-search-slipno').fill('2026/07/18-4')
  await page.getByTestId('sales-query-search-apply').click()
  await page.waitForTimeout(900)
  console.log(`[T5] 판매관리 화면 총 = ${await readTotal(page)}`)
  await cap(page, 't5-sales')
  await downloadExcel(page, 'sales-query-excel-download', 't5-sales.xlsx')

  // 구매관리: slipNo 2026/07/17-8
  await page.goto(`${BASE_URL}/#/purchases`)
  await expect(page.getByTestId('purchase-query-search-btn')).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('purchase-query-search-btn').click()
  await page.getByTestId('purchase-query-search-slipno').fill('2026/07/17-8')
  await page.getByTestId('purchase-query-search-apply').click()
  await page.waitForTimeout(900)
  console.log(`[T5] 구매관리 화면 총 = ${await readTotal(page)}`)
  await cap(page, 't5-purchases')
  await downloadExcel(page, 'purchase-query-excel-download', 't5-purchases.xlsx')

  // 판매전표목록: 배송태그 DAY
  await page.goto(`${BASE_URL}/#/sales/slips`)
  await expect(page.getByTestId('slip-list-excel-export')).toBeVisible({ timeout: 30_000 })
  await page.getByLabel('배송태그 필터').selectOption('DAY')
  await page.waitForTimeout(900)
  console.log(`[T5] 판매전표목록 DAY 화면 총 = ${await readTotalSafe(page)}`)
  await cap(page, 't5-slip-list-day')
  await downloadExcel(page, 'slip-list-excel-export', 't5-slip-list-day.xlsx')

  // 분개장: 필터 없음(전체)
  await page.goto(`${BASE_URL}/#/accounting/journals`)
  await expect(page.getByTestId('journal-list-excel-export')).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(900)
  console.log(`[T5] 분개장 화면 총 = ${await readTotalSafe(page)}`)
  await cap(page, 't5-journals')
  await downloadExcel(page, 'journal-list-excel-export', 't5-journals.xlsx')

  // 재고현황: 필터 없음(전체)
  await page.goto(`${BASE_URL}/#/transfers`)
  await expect(page.getByTestId('transfer-list-stocks-excel-export')).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(900)
  await cap(page, 't5-stocks')
  await downloadExcel(page, 'transfer-list-stocks-excel-export', 't5-stocks.xlsx')
})

async function readTotalSafe(page: Page): Promise<string> {
  try {
    const el = page.getByText(/총\s*[\d,]+건/).first()
    await el.waitFor({ timeout: 8_000 })
    return await el.innerText()
  } catch {
    return '(표시없음)'
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Test 6 — F-4 인증 4종
// ───────────────────────────────────────────────────────────────────────────
test('T6 F-4 인증 — 무토큰 401·위조 401·dev_sales 403·dev_master 200', async ({ page }) => {
  const endpoint = `${API_BASE}/admin/partners/export.xlsx`
  const noToken = await page.request.get(endpoint)
  const forged = await page.request.get(endpoint, { headers: { Authorization: 'Bearer forged-token-abc' } })
  const sales = await login(page, 'dev_sales')
  const salesResp = await page.request.get(endpoint, { headers: { Authorization: `Bearer ${sales.token}` } })
  const master = await login(page, 'dev_master')
  const masterResp = await page.request.get(endpoint, { headers: { Authorization: `Bearer ${master.token}` } })
  console.log(`[T6] no-token=${noToken.status()} forged=${forged.status()} dev_sales=${salesResp.status()} dev_master=${masterResp.status()}`)
  expect(noToken.status()).toBe(401)
  expect(forged.status()).toBe(401)
  expect(salesResp.status()).toBe(403)
  expect(masterResp.status()).toBe(200)
})

// ───────────────────────────────────────────────────────────────────────────
// Test 7 — F-5 주문 병합 본류 (throwaway 실제 병합 + 충돌 409)
//   marker: OPUS907R6 / 실제 병합 성공 후 생성 slip·전환수량 원복은 리뷰어가 SQL 로 별도 원복.
// ───────────────────────────────────────────────────────────────────────────
test('T7 F-5 주문 병합 충돌 — 서로 다른 거래처 주문은 409·수량 불변', async ({ page }) => {
  const data = await login(page)
  const headers = { Authorization: `Bearer ${data.token}` }
  const listResp = await page.request.get(`${API_BASE}/api/v1/partner-orders?page=0&size=200&includeDeleted=false`, { headers })
  expect(listResp.ok()).toBeTruthy()
  const content = ((await listResp.json()).data?.content ?? []) as Array<{ orderNumber: string; partnerCode: string; status: string; mergeEligible?: boolean }>
  const candidates = content.filter((r) => ['DRAFT', 'ON_HOLD'].includes(r.status) && r.mergeEligible === false)
  const first = candidates[0]
  const second = candidates.find((r) => r.partnerCode !== first?.partnerCode)
  expect(first, 'legacy 제외 후보1').toBeTruthy()
  expect(second, '다른 거래처 후보2').toBeTruthy()
  const pathId = (o: string) => o.replaceAll('/', '-')
  const detail = async (o: string) => {
    const r = await page.request.get(`${API_BASE}/api/v1/partner-orders/${encodeURIComponent(pathId(o))}`, { headers })
    expect(r.ok()).toBeTruthy()
    return (await r.json()).data as { lines: Array<{ lineId: string; convertedQuantity: number }> }
  }
  const d1 = await detail(first.orderNumber)
  const d2 = await detail(second.orderNumber)
  const before = [d1.lines[0].convertedQuantity, d2.lines[0].convertedQuantity]
  const resp = await page.request.post(`${API_BASE}/api/v1/partner-orders/convert-to-slip-merge`, {
    headers,
    data: {
      orders: [
        { partnerOrderId: first.orderNumber, items: [{ orderLineId: d1.lines[0].lineId, quantity: 1 }] },
        { partnerOrderId: second.orderNumber, items: [{ orderLineId: d2.lines[0].lineId, quantity: 1 }] },
      ],
      warehouseCode: 'HQ-001',
      shippingInfo: { partnerName: 'OPUS907R6 conflict probe' },
    },
  })
  const a1 = await detail(first.orderNumber)
  const a2 = await detail(second.orderNumber)
  console.log(`[T7] ${first.orderNumber}(${first.partnerCode})/${second.orderNumber}(${second.partnerCode}) HTTP=${resp.status()} conv=${before.join(',')}→${[a1.lines[0].convertedQuantity, a2.lines[0].convertedQuantity].join(',')}`)
  expect(resp.status()).toBe(409)
  expect([a1.lines[0].convertedQuantity, a2.lines[0].convertedQuantity]).toEqual(before)
})

// ───────────────────────────────────────────────────────────────────────────
// Test 8 — F-5 병합 UX 라이브 (거래처 우선 게이팅 · legacy 병합불가 사유) — read-only
// ───────────────────────────────────────────────────────────────────────────
test('T8 F-5 병합 다이얼로그 라이브 — 거래처 우선 게이팅·legacy 사유', async ({ page }) => {
  const data = await login(page)
  await authStub(page, data)
  await page.goto(`${BASE_URL}/#/sales/partner-orders`)
  await expect(page.getByTestId('merge-convert-open')).toBeVisible({ timeout: 30_000 })
  await cap(page, 't8-01-order-list')

  await page.getByTestId('merge-convert-open').click()
  await expect(page.getByTestId('merge-convert-dialog-body')).toBeVisible({ timeout: 10_000 })
  // 거래처 우선 게이팅: 미선택 시 "먼저 거래처를 선택하면..." 안내가 뜨고 주문 후보 UI 미렌더
  const required = page.getByTestId('merge-convert-partner-required')
  await expect(required).toBeVisible()
  await expect(required).toContainText('먼저 거래처를 선택하면')
  await expect(page.getByTestId('merge-convert-order-selection')).toHaveCount(0)
  console.log('[T8] 거래처 우선 게이팅 확인 — 미선택 시 주문후보 미렌더')
  await cap(page, 't8-02-partner-first-gate')

  // 실 partner-service 로 거래처 선택 (한국공조시스템 = P-2026-0002)
  const pInput = page.getByTestId('merge-convert-partner-search')
  await pInput.fill('한국공조시스템')
  await page.waitForTimeout(1500)
  const option = page.locator('[role="option"]').first()
  await expect(option).toBeVisible({ timeout: 10_000 })
  await option.click()
  await expect(page.getByTestId('merge-convert-selected-partner')).toContainText('한국공조시스템', { timeout: 10_000 })
  await page.waitForTimeout(1200)
  await expect(page.getByTestId('merge-convert-order-selection')).toBeVisible({ timeout: 10_000 })
  const empty = page.getByTestId('merge-convert-order-candidates-empty')
  const chips = page.getByTestId('merge-convert-selected-order-count')
  if (await empty.count()) {
    console.log(`[T8] 선택 후 주문후보 = 없음 (legacy 제외). 안내: ${await empty.innerText()}`)
    const reason = page.getByTestId('merge-convert-order-ineligible-reason')
    if (await reason.count()) console.log(`[T8] 병합불가 사유: ${await reason.innerText()}`)
  } else if (await chips.count()) {
    console.log(`[T8] 선택 후 병합 가능한 주문 후보 표시됨: ${await chips.innerText()}`)
  }
  await cap(page, 't8-03-after-partner-select')
})
