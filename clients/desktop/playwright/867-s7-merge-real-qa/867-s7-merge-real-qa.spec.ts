import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #825 슬7 — 주문 병합 거래처 우선 선택 라이브 GUI QA.
 *
 * 실 게이트웨이 + 실 렌더러 대상이다. 기존 주문은 읽기만 한다.
 * 현재 dev DB에는 V13 이전 legacy 주문만 있으므로, 활성 거래처와 실제 주문 라인을
 * 참조해 마커가 붙은 DRAFT throwaway를 만들고 화면에서 양성/음성 양쪽을 확인한다.
 */
import { expect, test, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5190'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? (process.env.DEV_PASSWORD ?? '')
const SHOT_DIR = resolveQaShotsDir(join(process.cwd(), '..', '..', 'docs', 'qa', '907-luna-round2-2026-07-23'))
const MARK = 'CODEX-907-QA'

type OrderSummary = {
  orderNumber: string
  partnerCode: string
  status: string
  mergeEligible?: boolean
  mergeIneligibilityReason?: string
}

type OrderDetail = {
  partnerCode: string
  bizCode: string
  lines: Array<{
    productId: string
    modelCode?: string
    productName?: string
    categoryKey: string
    quantity: number
    deliveryPrice?: number
    lineTotal?: number
  }>
}

type Fixture = { id: string; orderNo: string }

/** DB fixture 정리도 네트워크 요청이 아닌 동기 호출로 수행해 timeout 때 취소되지 않게 한다. */
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

/** 이전 실행이 중간 종료돼도 다음 실행 시작 시 동일한 마커 잔재를 회수한다. */
function cleanupMarkerRows(): void {
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
  console.log(`[cleanup] ${ids.length}개 throwaway 주문 제거`)
}

function orderPathId(orderNumber: string): string {
  return orderNumber.replace(/\//g, '-')
}

async function createEligibleFixture(
  page: Page,
  auth: Record<string, string>,
  source: OrderSummary,
  ordinal: number,
): Promise<Fixture> {
  const detailResponse = await page.request.get(
    `${API_BASE}/api/v1/partner-orders/${encodeURIComponent(orderPathId(source.orderNumber))}`,
    { headers: auth },
  )
  expect(detailResponse.ok(), `참조 주문 상세 조회 실패: HTTP ${detailResponse.status()}`).toBeTruthy()
  const detail = (await detailResponse.json()).data as OrderDetail
  const line = detail.lines[0]
  expect(line?.productId, `${source.orderNumber} 참조 라인의 productId 없음`).toBeTruthy()

  // 이 UUID는 화면/로그에 출력하지 않고 fixture 조립에만 사용한다.
  const partnerId = psql(
    `SELECT id::text FROM partners WHERE partner_code=${sqlString(source.partnerCode)} AND is_deleted=false LIMIT 1`,
    'partner_db',
  )
  expect(partnerId, `활성 거래처 fixture 없음: ${source.partnerCode}`).toMatch(
    /^[0-9a-f-]{36}$/i,
  )

  const orderId = randomUUID()
  const lineId = randomUUID()
  const orderNo = `2026/07/23-907${ordinal}${Date.now().toString().slice(-5)}`
  const amount = Number(line.deliveryPrice ?? line.lineTotal ?? 1)
  expect(Number.isFinite(amount) && amount > 0, `${source.orderNumber} 참조 금액이 유효하지 않음`).toBeTruthy()
  const modelName = line.modelCode ?? `CODEX-${ordinal}`
  const productName = line.productName ?? `CODEX ${ordinal} 품목`
  const categoryKey = line.categoryKey || 'homemulti'

  psql(`
    INSERT INTO partner_orders
      (id, partner_code, biz_code, order_no, status, slip_publish_status, total_amount,
       idempotency_key, created_at, created_by, is_deleted, revision_count, lock_version, partner_id)
    VALUES
      (${sqlString(orderId)}, ${sqlString(source.partnerCode)}, ${sqlString(detail.bizCode || source.partnerCode)},
       ${sqlString(orderNo)}, 'DRAFT', 'NOT_REQUIRED', ${amount.toFixed(2)}, ${sqlString(`${MARK}-${ordinal}`)},
       now(), ${sqlString(MARK)}, false, 0, 0, ${sqlString(partnerId)});
    INSERT INTO partner_order_lines
      (id, partner_order_id, product_id, model_name, product_name, category_key, quantity,
       price_vat, subtotal, created_at, created_by, is_deleted, converted_quantity)
    VALUES
      (${sqlString(lineId)}, ${sqlString(orderId)}, ${sqlString(line.productId)}, ${sqlString(modelName)},
       ${sqlString(productName)}, ${sqlString(categoryKey)}, 1, ${amount.toFixed(2)}, ${amount.toFixed(2)},
       now(), ${sqlString(MARK)}, false, 0)
  `)
  console.log(`■ ${source.partnerCode} 양성 대조 throwaway 생성: ${orderNo}`)
  return { id: orderId, orderNo }
}

test.use({ viewport: { width: 1600, height: 1000 } })

test('슬7 — 거래처 우선 선택으로 다른 거래처 주문을 섞을 수 없다', async ({ page }) => {
  mkdirSync(SHOT_DIR, { recursive: true })
  const shot = async (name: string) => {
    await page.screenshot({ path: join(SHOT_DIR, `${name}.png`), fullPage: true })
  }

  const login = await page.request.post(`${API_BASE}/api/auth/login`, {
    data: { loginId: 'dev_sales', password: PASSWORD },
  })
  expect(login.ok(), `실서버 로그인 실패: HTTP ${login.status()}`).toBeTruthy()
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

  cleanupMarkerRows()
  const fixtures: Fixture[] = []
  try {
    const listResponse = await page.request.get(
      `${API_BASE}/api/v1/partner-orders?page=0&size=100&includeDeleted=false`,
      { headers: auth },
    )
    expect(listResponse.ok(), `주문 목록 조회 실패: HTTP ${listResponse.status()}`).toBeTruthy()
    const allOrders = ((await listResponse.json()).data?.content ?? []) as OrderSummary[]
    const legacyRows = allOrders.filter(
      (order) =>
        (order.status === 'DRAFT' || order.status === 'ON_HOLD') &&
        order.mergeEligible === false &&
        Boolean(order.partnerCode),
    )
    expect(legacyRows.length, 'legacy 병합 제외 주문 fixture가 없다').toBeGreaterThan(0)

    // A는 legacy가 반드시 같은 거래처에 존재해야 Q2의 양쪽 단언이 성립한다.
    const sourceA = legacyRows[0]
    const sourceB = legacyRows.find((order) => order.partnerCode !== sourceA.partnerCode)
    expect(sourceB, 'S7-4용 두 번째 거래처 legacy fixture가 없다').toBeTruthy()
    const codeA = sourceA.partnerCode
    const codeB = sourceB!.partnerCode
    console.log(`■ legacy A=${sourceA.orderNumber} (${codeA}) · B=${sourceB!.orderNumber} (${codeB})`)

    // Q1: 현재 DB 전제와 무관하게 실제 화면에서 볼 수 있는 eligible 주문을 만든다.
    fixtures.push(await createEligibleFixture(page, auth, sourceA, 1))
    fixtures.push(await createEligibleFixture(page, auth, sourceB!, 2))
    const ordersA = [fixtures[0].orderNo]
    const ordersB = [fixtures[1].orderNo]

    const dialog = page.getByRole('dialog')
    const summary = page.getByTestId('merge-convert-order-candidate-summary')
    const search = page.getByTestId('merge-convert-partner-search')
    const pickPartner = async (code: string) => {
      await expect(search).toBeVisible({ timeout: 10_000 })
      await search.fill(code)
      const listbox = page.getByRole('listbox', { name: '거래처 목록' })
      await expect(listbox, `거래처 검색 결과가 뜨지 않는다: ${code}`).toBeVisible({ timeout: 10_000 })
      const option = listbox.locator('[role="option"]').filter({ hasText: code }).first()
      await expect(option, `검색 결과에 ${code} 가 없다`).toBeVisible({ timeout: 10_000 })
      await option.click()
    }

    await test.step('S7-1 거래처 확정 전에는 주문 후보가 없다', async () => {
      await page.goto(`${BASE_URL}/#/sales/partner-orders`)
      await expect(page.getByTestId('merge-convert-open'), '병합 진입 버튼이 없다').toBeVisible({ timeout: 20_000 })
      await shot('S1-주문목록')
      await page.getByTestId('merge-convert-open').click()
      await expect(dialog).toBeVisible({ timeout: 15_000 })
      await expect(page.getByTestId('merge-convert-partner-selection')).toBeVisible()
      await expect(page.getByTestId('merge-convert-partner-required')).toBeVisible()
      await expect(page.getByTestId('merge-convert-order-selection')).toHaveCount(0)
      await shot('S2-거래처확정전-주문후보없음')
    })

    await test.step(`Q1/Q2 거래처 A(${codeA}) — eligible 후보와 legacy 제외 사유`, async () => {
      await pickPartner(codeA)
      await expect(page.getByTestId('merge-convert-selected-partner')).toContainText(codeA)
      await expect(page.getByTestId('merge-convert-order-selection')).toBeVisible()

      // Q1 양성: 새 partner_id 보유 주문이 실제 후보로 표시된다.
      await expect(summary, 'Q1 실패: 병합 가능한 throwaway 후보가 없다')
        .toContainText(/[1-9]\d*건 후보/, { timeout: 15_000 })
      await expect(summary, 'Q2 실패: eligible 후보와 legacy 제외 건수가 함께 보이지 않는다')
        .toContainText(/건은 병합에서 제외됨/)
      await expect(page.getByTestId('merge-convert-order-ineligible-reason'))
        .toContainText('기존 주문은 거래처 정체성을 확인할 수 없어 병합할 수 없습니다')
      await expect(page.getByTestId('merge-convert-order-ineligible-reason'))
        .toContainText('단건 전표 발행은 계속할 수 있습니다')
      await shot('S3-Q1-Q2-A-양성후보-legacy제외사유')

      const orderSearch = page.getByTestId('merge-convert-order-search')
      await expect(orderSearch).toBeVisible({ timeout: 10_000 })
      await orderSearch.fill(ordersA[0])
      await expect(page.getByTestId(`merge-convert-order-option-${ordersA[0]}`)).toBeVisible({ timeout: 10_000 })

      // Q2 음성: 같은 거래처의 legacy 주문은 후보 option으로 나타나지 않는다.
      await orderSearch.fill(sourceA.orderNumber)
      await page.waitForTimeout(600)
      await expect(page.getByTestId(`merge-convert-order-option-${sourceA.orderNumber}`),
        'Q2 실패: legacy 주문이 병합 후보 option으로 노출됨').toHaveCount(0)
      await orderSearch.fill('')
    })

    await test.step(`S7-4 거래처 B(${codeB}) 로 변경하면 A 선택이 남지 않는다`, async () => {
      const orderSearch = page.getByTestId('merge-convert-order-search')
      await orderSearch.fill(ordersA[0])
      const optionA = page.getByTestId(`merge-convert-order-option-${ordersA[0]}`)
      await expect(optionA).toBeVisible({ timeout: 10_000 })
      await optionA.click()
      await expect(page.getByTestId(`merge-convert-order-chip-${ordersA[0]}`)).toBeVisible({ timeout: 10_000 })
      await shot('S4-거래처A-주문선택')

      await pickPartner(codeB)
      await expect(page.getByTestId('merge-convert-selected-partner')).toContainText(codeB)
      await expect(summary, 'B 거래처 후보가 끝내 0건이다').toContainText(/[1-9]\d*건 후보/, { timeout: 15_000 })
      await expect(page.getByTestId(`merge-convert-order-chip-${ordersA[0]}`)).toHaveCount(0)
      await shot('S5-거래처B전환-이전선택소거')
      // B도 양성 후보가 실제로 검색되는지 유지 단언한다.
      await orderSearch.fill(ordersB[0])
      await expect(page.getByTestId(`merge-convert-order-option-${ordersB[0]}`)).toBeVisible({ timeout: 10_000 })
    })
  } finally {
    // 테스트가 실패하거나 timeout되어도 마커 주문만 동기적으로 정리한다.
    cleanupMarkerRows()
  }
})
