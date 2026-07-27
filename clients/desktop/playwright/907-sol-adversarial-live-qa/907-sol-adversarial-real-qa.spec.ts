import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * PR #907 SOL 마감 지향 재수렴 적대 real-QA.
 *
 * 제품 코드를 변경하지 않고 실제 게이트웨이·DB·렌더러를 사용한다.
 * 생성 데이터는 CODEX-907-QA-SOL 마커로 격리하고 finally에서 삭제한다.
 */
import { expect, test, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5190'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const SHOT_DIR = resolveQaShotsDir(join(process.cwd(), '..', '..', 'docs', 'qa', '907-luna-round-2026-07-23'))
const MARK = 'CODEX-907-QA-SOL'

type OrderSummary = {
  orderNumber: string
  partnerCode: string
  status: string
  mergeEligible?: boolean
  mergeIneligibilityReason?: string
}

type OrderDetail = {
  bizCode: string
  lines: Array<{
    productId: string
    modelCode?: string
    productName?: string
    categoryKey: string
    deliveryPrice?: number
    lineTotal?: number
  }>
}

function psql(sql: string, database = 'partner_order_db'): string {
  return execFileSync(
    'docker',
    ['exec', 'samhan-postgres', 'psql', '-U', 'samhan', '-d', database, '-tAc', sql.replace(/\s+/g, ' ').trim()],
    { encoding: 'utf8' },
  ).trim()
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

function cleanup(): void {
  const ids = psql(`SELECT id::text FROM partner_orders WHERE created_by=${sqlString(MARK)}`)
    .split(/\r?\n/)
    .map((id) => id.trim())
    .filter(Boolean)
  if (ids.length === 0) return
  const idList = ids.map(sqlString).join(',')
  psql(`DELETE FROM partner_order_history WHERE partner_order_id IN (${idList})`)
  psql(`DELETE FROM slip_publish_outbox WHERE partner_order_id IN (${idList})`)
  psql(`DELETE FROM partner_order_lines WHERE partner_order_id IN (${idList})`)
  psql(`DELETE FROM partner_orders WHERE id IN (${idList})`)
  console.log(`[정리] throwaway 주문 ${ids.length}건 삭제`)
}

function orderPathId(orderNumber: string): string {
  return orderNumber.replace(/\//g, '-')
}

async function createFixture(
  page: Page,
  auth: Record<string, string>,
  source: OrderSummary,
  ordinal: number,
): Promise<string> {
  const detailResponse = await page.request.get(
    `${API_BASE}/api/v1/partner-orders/${encodeURIComponent(orderPathId(source.orderNumber))}`,
    { headers: auth },
  )
  expect(detailResponse.ok()).toBeTruthy()
  const detail = (await detailResponse.json()).data as OrderDetail
  const line = detail.lines[0]
  expect(line?.productId).toBeTruthy()

  const partnerId = psql(
    `SELECT id::text FROM partners WHERE partner_code=${sqlString(source.partnerCode)} AND is_deleted=false LIMIT 1`,
    'partner_db',
  )
  expect(partnerId).toMatch(/^[0-9a-f-]{36}$/i)

  const orderId = randomUUID()
  const lineId = randomUUID()
  const orderNo = `2026/07/23-907S${ordinal}${Date.now().toString().slice(-5)}`
  const amount = Number(line.deliveryPrice ?? line.lineTotal ?? 1)
  const modelName = line.modelCode ?? `SOL-${ordinal}`
  const productName = line.productName ?? `SOL 양성 대조 ${ordinal}`
  const categoryKey = line.categoryKey || 'homemulti'

  psql(`
    INSERT INTO partner_orders
      (id, partner_code, biz_code, order_no, status, slip_publish_status, total_amount,
       idempotency_key, created_at, created_by, is_deleted, revision_count, lock_version, partner_id,
       due_date, memo)
    VALUES
      (${sqlString(orderId)}, ${sqlString(source.partnerCode)}, ${sqlString(detail.bizCode || source.partnerCode)},
       ${sqlString(orderNo)}, 'DRAFT', 'NOT_REQUIRED', ${amount.toFixed(2)}, ${sqlString(`${MARK}-${ordinal}`)},
       now(), ${sqlString(MARK)}, false, 0, 0, ${sqlString(partnerId)},
       ${sqlString(`2026-08-${String((ordinal % 20) + 1).padStart(2, '0')}`)},
       ${sqlString(`SOL 충돌 메모 ${ordinal}`)});
    INSERT INTO partner_order_lines
      (id, partner_order_id, product_id, model_name, product_name, category_key, quantity,
       price_vat, subtotal, created_at, created_by, is_deleted, converted_quantity)
    VALUES
      (${sqlString(lineId)}, ${sqlString(orderId)}, ${sqlString(line.productId)}, ${sqlString(modelName)},
       ${sqlString(productName)}, ${sqlString(categoryKey)}, 1, ${amount.toFixed(2)}, ${amount.toFixed(2)},
       now(), ${sqlString(MARK)}, false, 0)
  `)
  console.log(`[양성 대조] ${source.partnerCode} / ${orderNo}`)
  return orderNo
}

test.use({ viewport: { width: 1600, height: 1000 } })

test('실 사용자 상태 전이에서 다른 거래처 주문 선택 상태가 살아남지 않는다', async ({ page }) => {
  mkdirSync(SHOT_DIR, { recursive: true })
  const shot = async (name: string) =>
    page.screenshot({ path: join(SHOT_DIR, `${name}.png`), fullPage: true })

  const login = await page.request.post(`${API_BASE}/api/auth/login`, {
    data: { loginId: 'dev_sales', password: PASSWORD },
  })
  expect(login.ok()).toBeTruthy()
  const loginData = (await login.json()).data ?? {}
  const auth = { Authorization: `Bearer ${loginData.token}` }
  await page.addInitScript(
    (v: { token: string; userId: string; role: string; fullName: string }) => {
      Object.defineProperty(window, 'samhanAuth', {
        configurable: true,
        value: {
          getToken: async () => ({ ...v, partnerCode: null }),
          setToken: async () => undefined,
          clearToken: async () => undefined,
        },
      })
    },
    {
      token: loginData.token ?? '',
      userId: loginData.userId ?? '',
      role: loginData.role ?? 'SALES',
      fullName: loginData.displayName ?? '개발영업',
    },
  )

  cleanup()
  try {
    const listResponse = await page.request.get(
      `${API_BASE}/api/v1/partner-orders?page=0&size=100&includeDeleted=false`,
      { headers: auth },
    )
    expect(listResponse.ok()).toBeTruthy()
    const allOrders = ((await listResponse.json()).data?.content ?? []) as OrderSummary[]
    const legacyRows = allOrders.filter((order) =>
      ['DRAFT', 'ON_HOLD'].includes(order.status) &&
      order.mergeEligible === false &&
      Boolean(order.partnerCode),
    )
    expect(legacyRows.length).toBeGreaterThan(1)
    const sourceA = legacyRows[0]
    const sourceB = legacyRows.find((row) => row.partnerCode !== sourceA.partnerCode)!
    expect(sourceB).toBeTruthy()
    const orderA = await createFixture(page, auth, sourceA, 1)
    const orderB = await createFixture(page, auth, sourceB, 2)

    const pickPartner = async (code: string) => {
      const input = page.getByTestId('merge-convert-partner-search')
      await input.fill(code)
      const option = page.getByRole('listbox', { name: '거래처 목록' })
        .locator('[role="option"]')
        .filter({ hasText: code })
        .first()
      await expect(option).toBeVisible({ timeout: 10_000 })
      await option.click()
    }

    await page.goto(`${BASE_URL}/#/sales/partner-orders`)
    await expect(page.getByTestId('merge-convert-open')).toBeVisible({ timeout: 20_000 })
    await shot('01-주문목록-실서버')

    await page.getByTestId('merge-convert-open').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByTestId('merge-convert-order-selection')).toHaveCount(0)
    await shot('02-거래처선택전-주문후보없음')

    await pickPartner(sourceA.partnerCode)
    await expect(page.getByTestId('merge-convert-selected-partner')).toContainText(sourceA.partnerCode)
    await expect(page.getByTestId('merge-convert-order-candidate-summary')).toContainText(/[1-9]\d*건 후보/)
    const orderSearch = page.getByTestId('merge-convert-order-search')
    // legacy(partner_id IS NULL)는 exact UUID 후보 집합에서 fail-closed로 제외된다.
    await orderSearch.fill(sourceA.orderNumber)
    await page.waitForTimeout(600)
    await expect(page.getByTestId(`merge-convert-order-option-${sourceA.orderNumber}`)).toHaveCount(0)
    await orderSearch.fill(orderA)
    const optionA = page.getByTestId(`merge-convert-order-option-${orderA}`)
    await expect(optionA).toBeVisible()
    await optionA.click()
    await expect(page.getByTestId(`merge-convert-order-chip-${orderA}`)).toBeVisible()
    await expect(page.getByRole('dialog')).not.toContainText(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
    )
    await shot('03-거래처A-양성후보선택-legacy미노출')

    await pickPartner(sourceB.partnerCode)
    await expect(page.getByTestId(`merge-convert-order-chip-${orderA}`)).toHaveCount(0)
    await orderSearch.fill(orderB)
    await expect(page.getByTestId(`merge-convert-order-option-${orderB}`)).toBeVisible()
    await shot('04-거래처B전환-A선택제거-B양성후보')

    await page.reload()
    await expect(page.getByTestId('merge-convert-open')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.getByTestId('merge-convert-open').click()
    await expect(page.getByTestId('merge-convert-order-selection')).toHaveCount(0)
    await shot('05-새로고침후-선택상태초기화')

    await pickPartner(sourceA.partnerCode)
    await orderSearch.fill(orderA)
    await page.getByTestId(`merge-convert-order-option-${orderA}`).click()
    await page.goto(`${BASE_URL}/#/`)
    await page.goBack()
    await expect(page.getByTestId('merge-convert-open')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await shot('06-뒤로가기복귀-선택상태미잔존')

    console.log(`[상태 대조] A=${orderA}, B=${orderB}, 전환·새로고침·뒤로가기 모두 선택 잔존 0`)
  } finally {
    cleanup()
    console.log(`[원상 확인] 주문=${psql(`SELECT count(*) FROM partner_orders WHERE created_by=${sqlString(MARK)}`)}`
      + ` / 라인=${psql(`SELECT count(*) FROM partner_order_lines WHERE created_by=${sqlString(MARK)}`)}`)
  }
})

test('거래처 전환 시 창고·충돌 헤더가 새 거래처로 이월되는지 적대 검증한다', async ({ page }) => {
  mkdirSync(SHOT_DIR, { recursive: true })
  const shot = async (name: string) =>
    page.screenshot({ path: join(SHOT_DIR, `${name}.png`), fullPage: true })

  const login = await page.request.post(`${API_BASE}/api/auth/login`, {
    data: { loginId: 'dev_master', password: PASSWORD },
  })
  expect(login.ok()).toBeTruthy()
  const loginData = (await login.json()).data ?? {}
  const auth = { Authorization: `Bearer ${loginData.token}` }
  await page.addInitScript(
    (v: { token: string; userId: string; role: string; fullName: string }) => {
      Object.defineProperty(window, 'samhanAuth', {
        configurable: true,
        value: {
          getToken: async () => ({ ...v, partnerCode: null }),
          setToken: async () => undefined,
          clearToken: async () => undefined,
        },
      })
    },
    {
      token: loginData.token ?? '',
      userId: loginData.userId ?? '',
      role: loginData.role ?? 'MASTER',
      fullName: loginData.displayName ?? '개발마스터',
    },
  )

  cleanup()
  try {
    const listResponse = await page.request.get(
      `${API_BASE}/api/v1/partner-orders?page=0&size=100&includeDeleted=false`,
      { headers: auth },
    )
    const allOrders = ((await listResponse.json()).data?.content ?? []) as OrderSummary[]
    const legacyRows = allOrders.filter((order) =>
      ['DRAFT', 'ON_HOLD'].includes(order.status) &&
      order.mergeEligible === false &&
      Boolean(order.partnerCode),
    )
    const sourceA = legacyRows[0]
    const sourceB = legacyRows.find((row) => row.partnerCode !== sourceA.partnerCode)!
    const ordersA = [
      await createFixture(page, auth, sourceA, 11),
      await createFixture(page, auth, sourceA, 12),
    ]
    const ordersB = [
      await createFixture(page, auth, sourceB, 21),
      await createFixture(page, auth, sourceB, 22),
    ]

    const pickPartner = async (code: string) => {
      const input = page.getByTestId('merge-convert-partner-search')
      await input.fill(code)
      const option = page.getByRole('listbox', { name: '거래처 목록' })
        .locator('[role="option"]')
        .filter({ hasText: code })
        .first()
      await expect(option).toBeVisible({ timeout: 10_000 })
      await option.click()
    }
    const pickOrder = async (orderNo: string) => {
      const input = page.getByTestId('merge-convert-order-search')
      await input.fill(orderNo)
      const option = page.getByTestId(`merge-convert-order-option-${orderNo}`)
      await expect(option).toBeVisible({ timeout: 10_000 })
      await option.click()
    }

    await page.goto(`${BASE_URL}/#/sales/partner-orders`)
    await expect(page.getByTestId('merge-convert-open')).toBeVisible({ timeout: 20_000 })
    await page.getByTestId('merge-convert-open').click()
    await pickPartner(sourceA.partnerCode)
    await pickOrder(ordersA[0])
    await pickOrder(ordersA[1])
    await expect(page.getByTestId('merge-convert-conflict-section')).toBeVisible({ timeout: 15_000 })

    const warehouseInput = page.getByTestId('merge-convert-warehouse').getByRole('combobox')
    await warehouseInput.fill('HQ')
    const warehouseOption = page.getByRole('listbox', { name: '창고 목록' })
      .locator('[role="option"]')
      .first()
    await expect(warehouseOption).toBeVisible({ timeout: 10_000 })
    await warehouseOption.click()

    const conflictsA = page.getByTestId('merge-convert-conflict-section').getByRole('radiogroup')
    const conflictCountA = await conflictsA.count()
    expect(conflictCountA).toBeGreaterThan(0)
    for (let i = 0; i < conflictCountA; i += 1) {
      await conflictsA.nth(i).locator('input[type="radio"]').first().check()
    }
    await page.getByTestId('merge-convert-conflict-memo-radio-custom').check()
    await page.getByTestId('merge-convert-conflict-memo-input-custom').fill('SOL 직접입력 11')
    await expect(page.getByTestId('merge-convert-submit')).toBeEnabled()
    await shot('07-거래처A-창고와충돌값확정')

    await pickPartner(sourceB.partnerCode)
    await pickOrder(ordersB[0])
    await pickOrder(ordersB[1])
    await expect(page.getByTestId('merge-convert-conflict-section')).toBeVisible({ timeout: 15_000 })
    const conflictsB = page.getByTestId('merge-convert-conflict-section').getByRole('radiogroup')
    const conflictCountB = await conflictsB.count()
    expect(conflictCountB).toBeGreaterThan(0)
    for (let i = 0; i < conflictCountB; i += 1) {
      await expect(conflictsB.nth(i).locator('input[type="radio"]:checked')).toHaveCount(0)
    }

    // B 주문의 충돌값을 하나도 고르지 않았는데 A 귀속 shippingFields와 selectedWarehouse가
    // 내부 상태에 남아 제출 가능하다. WarehouseAutocomplete는 선택 뒤 검색 input을 비우므로
    // input value가 아니라 최종 제출 가능 상태로 selectedWarehouse 잔존을 함께 증명한다.
    await expect(page.getByTestId('merge-convert-submit')).toBeDisabled()
    await expect(page.getByTestId('merge-convert-warehouse')).toContainText('출고 창고')
    for (let i = 0; i < conflictCountB; i += 1) {
      await expect(conflictsB.nth(i).locator('input[type="radio"]:checked')).toHaveCount(0)
    }
    await expect(page.getByTestId('merge-convert-conflict-memo-input-custom')).toHaveValue('')
    await shot('08-거래처B-충돌값미선택-제출비활성-이전값초기화')

    console.log('[불변식] 거래처 B 전환 후 이전 거래처의 배송·충돌 확정값·직접입력값은 제출 payload에 도달할 수 없음')
  } finally {
    cleanup()
    console.log(`[원상 확인-충돌] 주문=${psql(`SELECT count(*) FROM partner_orders WHERE created_by=${sqlString(MARK)}`)}`
      + ` / 라인=${psql(`SELECT count(*) FROM partner_order_lines WHERE created_by=${sqlString(MARK)}`)}`)
  }
})

test('모달 재진입 시 후보 캐시가 신규 주문을 누락하지 않는다', async ({ page }) => {
  mkdirSync(SHOT_DIR, { recursive: true })
  const shot = async (name: string) =>
    page.screenshot({ path: join(SHOT_DIR, `${name}.png`), fullPage: true })

  const login = await page.request.post(`${API_BASE}/api/auth/login`, {
    data: { loginId: 'dev_master', password: PASSWORD },
  })
  const loginData = (await login.json()).data ?? {}
  const auth = { Authorization: `Bearer ${loginData.token}` }
  await page.addInitScript(
    (v: { token: string; userId: string; role: string; fullName: string }) => {
      Object.defineProperty(window, 'samhanAuth', {
        configurable: true,
        value: {
          getToken: async () => ({ ...v, partnerCode: null }),
          setToken: async () => undefined,
          clearToken: async () => undefined,
        },
      })
    },
    {
      token: loginData.token ?? '',
      userId: loginData.userId ?? '',
      role: loginData.role ?? 'MASTER',
      fullName: loginData.displayName ?? '개발마스터',
    },
  )

  cleanup()
  try {
    const listResponse = await page.request.get(
      `${API_BASE}/api/v1/partner-orders?page=0&size=100&includeDeleted=false`,
      { headers: auth },
    )
    const allOrders = ((await listResponse.json()).data?.content ?? []) as OrderSummary[]
    const source = allOrders.find((order) =>
      ['DRAFT', 'ON_HOLD'].includes(order.status) &&
      order.mergeEligible === false &&
      Boolean(order.partnerCode),
    )!
    const firstOrder = await createFixture(page, auth, source, 31)
    let candidateRequestCount = 0
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (url.pathname === '/api/v1/partner-orders' &&
        url.searchParams.get('partnerCode') === source.partnerCode) {
        candidateRequestCount += 1
      }
    })
    const pickPartner = async () => {
      const input = page.getByTestId('merge-convert-partner-search')
      await input.click()
      await input.fill(source.partnerCode)
      const option = page.getByRole('listbox', { name: '거래처 목록' })
        .locator('[role="option"]')
        .filter({ hasText: source.partnerCode })
        .first()
      await expect(option).toBeVisible({ timeout: 10_000 })
      await option.click()
    }

    await page.goto(`${BASE_URL}/#/sales/partner-orders`)
    await page.getByTestId('merge-convert-open').click()
    await pickPartner()
    const search = page.getByTestId('merge-convert-order-search')
    await search.fill(firstOrder)
    await expect(page.getByTestId(`merge-convert-order-option-${firstOrder}`)).toBeVisible()
    expect(candidateRequestCount).toBe(1)
    await page.getByTestId('merge-convert-cancel').click()

    // 다른 사용자 주문 생성에 해당하는 허용된 throwaway DB 삽입.
    const secondOrder = await createFixture(page, auth, source, 32)
    await page.getByTestId('merge-convert-open').click()
    await pickPartner()
    await search.click()
    await search.fill(secondOrder)
    await page.waitForTimeout(800)
    console.log(`[계측] 모달 재진입 후보 요청=${candidateRequestCount}`)
    await expect(page.getByTestId(`merge-convert-order-option-${secondOrder}`)).toBeVisible()
    expect(candidateRequestCount).toBe(2)
    await shot('09-재진입-신규주문즉시노출')

    // 양성 대조: 새 QueryClient가 생기는 전체 새로고침 뒤에는 같은 서버 주문이 보인다.
    await page.reload()
    await page.getByTestId('merge-convert-open').click()
    await pickPartner()
    const refreshedSearch = page.getByTestId('merge-convert-order-search')
    await refreshedSearch.fill(secondOrder)
    await expect(page.getByTestId(`merge-convert-order-option-${secondOrder}`)).toBeVisible()
    expect(candidateRequestCount).toBe(3)
    await shot('10-양성대조-새로고침후새주문노출')
    console.log(`[캐시 GREEN] 최초 요청=1, 모달 재진입 요청=${2}로 신규 주문 노출, 전체 새로고침 누적 요청=${candidateRequestCount}`)
  } finally {
    cleanup()
    console.log(`[원상 확인-캐시] 주문=${psql(`SELECT count(*) FROM partner_orders WHERE created_by=${sqlString(MARK)}`)}`
      + ` / 라인=${psql(`SELECT count(*) FROM partner_order_lines WHERE created_by=${sqlString(MARK)}`)}`)
  }
})
