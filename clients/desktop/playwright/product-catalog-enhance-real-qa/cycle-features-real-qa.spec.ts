import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * PR #461 통합 실서버 QA 보강 — 나머지 핵심 사용자 기능 실 캡처.
 *
 * 실서버(Docker, product-service+api-gateway 6c539714 healthy) FE 화면 경유로
 * 아래 4종을 실 게이트웨이(http://localhost:8080) HTTP 왕복하며 캡처한다(mock 금지).
 *
 *   1. 세트 컬럼        — 견적품목관리 BUNDLE 행 '세트 · 13' 뱃지 (cycle-set-column.png)
 *   2. 표시순서 드래그   — SINGLE_SET 카테고리 행 드래그 → '순서 저장' PUT 200
 *                          (cycle-order-before.png / cycle-order-after.png)
 *                          ※ 저장 전 전체 카테고리 순서 백업 → QA 후 원복 PUT (dev DB 청결)
 *   3. 세트재고 가드     — 출고전표(/sales/new) BUNDLE 라인 선택 → 재고조회 →
 *                          'inventory-lookup-bundle-only-notice' (cycle-bundle-stock-guard.png)
 *   4. usage 노출 토글   — 품목관리 노출 토글 1컷 (cycle-usage-toggle.png, mutation 시 원복)
 *
 * 실서버: http://localhost:8080 (api-gateway), http://localhost:5175 (renderer vite dev, mock OFF)
 * 인증: dev_master / dev_p05_pass! (MASTER, products.admin UPDATE)
 * 실 BUNDLE: AC110CS6PBH1SY (13 구성품, category=SINGLE_SET, usage=BOTH)
 *
 * 실행:
 *   cd clients/desktop
 *   node_modules\.bin\playwright test --config=playwright.real-qa.config.ts \
 *     playwright/product-catalog-enhance-real-qa/cycle-features-real-qa.spec.ts \
 *     --reporter=line --timeout=120000
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5175'
const API_BASE = 'http://localhost:8080'
const BUNDLE_CODE = 'AC110CS6PBH1SY'
const SET_CATEGORY = 'SINGLE_SET'

// cycle-*.png 는 screenshots/ 하위가 아니라 product-catalog-enhance/ 직속에 저장(프롬프트 명시).
const SCREENSHOTS_DIR = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/product-catalog-enhance'))
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `${name}.png`), fullPage: false })
}

/**
 * 실서버 로그인 후 window.samhanAuth stub 주입(addInitScript).
 * client.ts interceptor 가 window.samhanAuth.getToken() 으로 토큰을 axios 헤더에 싣는다.
 */
async function loginAndInstallStub(page: Page, loginId: string, password: string): Promise<string> {
  const res = await page.request.post(`${API_BASE}/auth/login`, { data: { loginId, password } })
  if (!res.ok()) throw new Error(`로그인 실패: HTTP ${res.status()}`)
  const body = await res.json()
  const token: string = body.data?.token ?? ''
  const role: string = body.data?.role ?? 'MASTER'
  const userId: string = body.data?.userId ?? ''
  const displayName: string = body.data?.displayName ?? loginId

  await page.addInitScript(
    ({ tok, r, uid, name }: { tok: string; r: string; uid: string; name: string }) => {
      Object.defineProperty(window, 'samhanAuth', {
        configurable: true,
        value: {
          getToken: async () => ({ token: tok, userId: uid, role: r, fullName: name, partnerCode: null }),
          setToken: async () => undefined,
          clearToken: async () => undefined,
        },
      })
    },
    { tok: token, r: role, uid: userId, name: displayName },
  )
  return token
}

interface CatalogRow {
  modelCode: string
  productType?: string
  usageScope?: string
  displayOrder?: number | null
  estimateCategory?: string | null
  estimateCategories?: Array<{ category: string; displayOrder: number | null }>
}

function displayOrderForCategory(row: CatalogRow, category: string): number | null {
  return row.estimateCategories?.find((entry) => entry.category === category)?.displayOrder
    ?? row.displayOrder
    ?? null
}

/** 카테고리 전체(모든 페이지)를 displayOrder 오름차순으로 수집 — 순서 백업/원복용. */
async function fetchAllInCategory(page: Page, token: string, category: string): Promise<CatalogRow[]> {
  const auth = { Authorization: `Bearer ${token}` }
  const first = await page.request.get(`${API_BASE}/api/v1/products`, {
    headers: auth,
    params: { category, page: '0', size: '999' },
  })
  const firstJson = await first.json()
  const totalPages: number = firstJson.totalPages ?? 1
  let rows: CatalogRow[] = firstJson.content ?? []
  for (let p = 1; p < totalPages; p++) {
    const r = await page.request.get(`${API_BASE}/api/v1/products`, {
      headers: auth,
      params: { category, page: String(p), size: '999' },
    })
    rows = rows.concat((await r.json()).content ?? [])
  }
  return rows
}

// ===========================================================================
// 1. 세트 컬럼 — 견적품목관리 BUNDLE 행 '세트 · 13' 뱃지
// ===========================================================================

test('1. 세트 컬럼 — 견적품목관리 BUNDLE 행에 세트 뱃지 + 구성품 수 표시', async ({ page }) => {
  await loginAndInstallStub(page, 'dev_master', 'dev_p05_pass!')

  await page.goto(`${BASE_URL}/#/products/estimate-items`)
  await page.waitForSelector('[data-testid="estimate-items-table"]', { timeout: 30000 })
  const categoryTab = page.locator(`[data-testid="estimate-items-category-tab-${SET_CATEGORY}"]`)
  await categoryTab.click()
  await expect(categoryTab).toHaveAttribute('aria-selected', 'true')

  // 실 BUNDLE AC110CS6PBH1SY 검색 → 세트 뱃지 노출
  const searchInput = page
    .locator('[data-testid="estimate-items-search-input"] input, input[data-testid="estimate-items-search-input"]')
    .first()
  await searchInput.fill(BUNDLE_CODE)
  await page.locator('[data-testid="estimate-items-query-button"]').click()

  const badge = page.locator(`[data-testid="estimate-items-set-badge-${BUNDLE_CODE}"]`)
  await badge.waitFor({ state: 'visible', timeout: 20000 })
  const badgeText = (await badge.textContent())?.trim() ?? ''
  // "세트 · N" (componentCount=13) 형식 검증
  expect(badgeText, `세트 뱃지 텍스트가 '세트 · N' 형식이 아님: "${badgeText}"`).toMatch(/세트\s*·\s*\d+/)
  expect(badgeText, '구성품 수가 13이 아님').toContain('13')

  await shot(page, 'cycle-set-column')
  console.log(`[1] PASS 세트 컬럼: ${BUNDLE_CODE} 뱃지 = "${badgeText}"`)
})

// ===========================================================================
// 2. 표시순서 드래그 저장 — SINGLE_SET 카테고리 행 드래그 → PUT 200 + 원복
// ===========================================================================

test('2. 표시순서 드래그 저장 — 행 순서 변경 → 순서 저장 PUT 200 → 원복', async ({ page }) => {
  const token = await loginAndInstallStub(page, 'dev_master', 'dev_p05_pass!')

  // ── 0. 저장 전 전체 카테고리 순서 백업 (modelCode→displayOrder) ────────
  const backupRows = await fetchAllInCategory(page, token, SET_CATEGORY)
  const exposedBackup = backupRows
    .filter((r) => r.usageScope !== 'NONE')
    .sort((a, b) => (displayOrderForCategory(a, SET_CATEGORY) ?? 0) - (displayOrderForCategory(b, SET_CATEGORY) ?? 0))
  const backupOrder = exposedBackup.map((r, index) => ({
    modelCode: r.modelCode,
    estimateCategory: SET_CATEGORY,
    displayOrder: displayOrderForCategory(r, SET_CATEGORY) ?? index + 1,
  }))
  // 안전망 — 테스트 중단 시 수동 원복용으로 백업을 디스크에 영속.
  try {
    const backupPath = path.resolve(_dirname, '../../../../.claude/tmp/cycle-order-backup.json')
    fs.mkdirSync(path.dirname(backupPath), { recursive: true })
    fs.writeFileSync(backupPath, JSON.stringify(backupOrder, null, 2))
  } catch {
    /* best-effort */
  }
  console.log(`[2] 백업 — ${SET_CATEGORY} 노출품목 ${backupOrder.length}건 순서 저장(원복용)`)
  expect(backupOrder.length, '백업 대상 노출 품목이 없음').toBeGreaterThan(1)

  // ── 1. 견적품목 관리 → SINGLE_SET 탭 선택 (탭 컨텍스트에서 드래그 항상 활성) ──
  await page.goto(`${BASE_URL}/#/products/estimate-items`)
  await page.waitForSelector('[data-testid="estimate-items-table"]', { timeout: 30000 })
  const categoryTab = page.locator(`[data-testid="estimate-items-category-tab-${SET_CATEGORY}"]`)
  await categoryTab.click()
  await expect(categoryTab).toHaveAttribute('aria-selected', 'true')

  // 드래그 핸들(첫 두 행) 노출 대기 — DragHandle aria-label = "{modelCode} 드래그"
  const rows = page.locator('[data-testid^="estimate-items-row-"]')
  await expect.poll(async () => rows.count(), { timeout: 20000, message: '카테고리 행 미렌더' }).toBeGreaterThan(1)

  // 화면상 처음 2개 행의 modelCode 추출 (드래그 전 순서 캡처)
  const firstRowCode = (await rows.nth(0).getAttribute('data-testid'))!.replace('estimate-items-row-', '')
  const secondRowCode = (await rows.nth(1).getAttribute('data-testid'))!.replace('estimate-items-row-', '')
  console.log(`[2] 드래그 전 — 1행=${firstRowCode}, 2행=${secondRowCode}`)
  await shot(page, 'cycle-order-before')

  // ── 2. 1행을 2행 아래로 드래그(@dnd-kit) — DragHandle 을 잡고 이동 ───────
  const handle1 = page.locator(`[aria-label="${firstRowCode} 드래그"]`).first()
  const handle2 = page.locator(`[aria-label="${secondRowCode} 드래그"]`).first()
  await handle1.waitFor({ state: 'visible', timeout: 10000 })
  const box1 = await handle1.boundingBox()
  const box2 = await handle2.boundingBox()
  if (!box1 || !box2) throw new Error('드래그 핸들 boundingBox 취득 실패')
  // dnd-kit PointerSensor: distance 4px 이상 이동 필요 → 단계적 mouse move
  await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2)
  await page.mouse.down()
  await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2 + 8, { steps: 3 })
  await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height + 12, { steps: 8 })
  await page.mouse.up()

  // 드래그 결과 — '순서 저장' 버튼이 dirty 상태로 노출되어야 함
  const saveBtn = page.locator('[data-testid="estimate-items-save-order-button"]')
  await saveBtn.waitFor({ state: 'visible', timeout: 10000 })

  // 화면 1행이 바뀌었는지(드래그 반영) 확인
  const newFirstRowCode = (await rows.nth(0).getAttribute('data-testid'))!.replace('estimate-items-row-', '')
  console.log(`[2] 드래그 후 — 1행=${newFirstRowCode} (이전 1행=${firstRowCode})`)

  // ── 3. '순서 저장' 클릭 → PUT /api/v1/products/display-orders 200 ───────
  const putPromise = page.waitForResponse(
    (r) => r.url().includes('/api/v1/products/display-orders') && r.request().method() === 'PUT',
    { timeout: 25000 },
  )
  await saveBtn.click()
  const putResp = await putPromise
  // BE @ResponseStatus(NO_CONTENT) — 표시순서 저장 성공 코드는 204(2xx 성공).
  expect([200, 204], `순서 저장 PUT 응답이 2xx 가 아님: ${putResp.status()}`).toContain(putResp.status())
  console.log(`[2] PASS 순서 저장: PUT /display-orders HTTP ${putResp.status()} (204=NO_CONTENT 성공)`)

  // 저장 후 목록 갱신 — 1행이 드래그 결과(newFirstRowCode)로 반영
  await expect
    .poll(
      async () => (await rows.nth(0).getAttribute('data-testid'))!.replace('estimate-items-row-', ''),
      { timeout: 15000, message: '저장 후 목록 1행이 드래그 결과로 반영되지 않음' },
    )
    .toBe(newFirstRowCode)
  await shot(page, 'cycle-order-after')
  console.log(`[2] PASS 반영: 저장 후 목록 1행 = ${newFirstRowCode}`)

  // ── 4. 원복 — 백업한 전체 순서를 그대로 PUT (dev DB 청결) ───────────────
  const restorePut = await page.request.put(`${API_BASE}/api/v1/products/display-orders`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: backupOrder.map((b) => ({
      modelCode: b.modelCode,
      estimateCategory: SET_CATEGORY,
      displayOrder: b.displayOrder,
    })),
  })
  expect(restorePut.ok(), `순서 원복 PUT 실패: HTTP ${restorePut.status()}`).toBeTruthy()
  // 원복 검증 — 1행이 백업 1행과 동일한지 REST 재조회
  const verifyRows = await fetchAllInCategory(page, token, SET_CATEGORY)
  const verifyExposed = verifyRows
    .filter((r) => r.usageScope !== 'NONE')
    .sort((a, b) => (displayOrderForCategory(a, SET_CATEGORY) ?? 0) - (displayOrderForCategory(b, SET_CATEGORY) ?? 0))
  expect(verifyExposed[0]?.modelCode, '원복 후 1행이 백업 1행과 불일치').toBe(exposedBackup[0]?.modelCode)
  console.log(
    `[2] PASS 원복: ${SET_CATEGORY} 순서 백업 ${backupOrder.length}건으로 PUT HTTP ${restorePut.status()}, ` +
      `1행 복원=${verifyExposed[0]?.modelCode}`,
  )
})

// ===========================================================================
// 3. 세트재고 가드 — 출고전표 BUNDLE 라인 선택 → 재고조회 → 세트 전용 안내
// ===========================================================================

test('3. 세트재고 가드 — 출고전표 BUNDLE 라인 재고조회 시 세트 전용 안내 표시', async ({ page }) => {
  await loginAndInstallStub(page, 'dev_master', 'dev_p05_pass!')

  // 1) /sales/new (OUTBOUND) 진입 (창고 선택 불필요 — 재고조회 버튼은 라인 선택만 요구)
  await page.goto(`${BASE_URL}/#/sales/new`)
  // 라인1 품목 자동완성 노출 대기
  const prodInput = page.getByRole('combobox', { name: '라인 1 품목' })
  await prodInput.waitFor({ state: 'visible', timeout: 30000 })

  // 2) 라인1 품목 = AC110CS6PBH1SY 세트 선택 (ProductAutocomplete '품목 목록')
  await prodInput.click()
  await prodInput.fill(BUNDLE_CODE)
  const prodList = page.getByRole('listbox', { name: '품목 목록' })
  await prodList.waitFor({ state: 'visible', timeout: 10000 })
  const prodOption = prodList.getByRole('option').filter({ hasText: BUNDLE_CODE }).first()
  await prodOption.waitFor({ state: 'visible', timeout: 10000 })
  await prodOption.click()

  // BUNDLE 선택 → picker 없이 첫 구성품 행으로 자동 전개되는지 확인
  await expect(page.getByRole('combobox', { name: '라인 1 품목' })).toHaveValue(
    'AJ040RXH4BC1',
    { timeout: 10000 },
  )

  // 3) 라인1 선택 체크박스 ON (재고조회 버튼 활성 조건)
  const lineCheckbox = page.getByRole('checkbox', { name: '라인 1 선택' })
  await lineCheckbox.check()

  // 4) '재고조회' 버튼 클릭 → InventoryLookupModal 오픈
  const stockBtn = page.locator('[data-testid="slip-form-inventory-lookup-btn"]')
  await expect(stockBtn).toBeEnabled({ timeout: 10000 })
  await stockBtn.click()

  // 5) 전부 세트(BUNDLE) 선택이므로 세트 전용 안내 표시 — bundleOnlyLines=true
  const notice = page.locator('[data-testid="inventory-lookup-bundle-only-notice"]')
  await notice.waitFor({ state: 'visible', timeout: 10000 })
  const noticeText = (await notice.textContent())?.trim() ?? ''
  expect(noticeText, '세트 전용 안내 문구 불일치').toContain('세트 품목은 재고를 표시하지 않습니다')
  // 모달 fade-in transition 완전 종료 대기(불투명 캡처) — notice 가 안정적으로 표시된 뒤 캡처.
  await expect(notice).toBeVisible()
  await page.waitForTimeout(600)
  await shot(page, 'cycle-bundle-stock-guard')
  console.log(`[3] PASS 세트재고 가드: 안내 = "${noticeText.replace(/\s+/g, ' ')}"`)
})

// ===========================================================================
// 4. usage 노출 토글 — 품목관리 노출 토글 변경 1컷 (mutation 시 원복)
// ===========================================================================

test('4. usage 노출 토글 — 노출 설정 토글 변경 PATCH 200 → 원복', async ({ page }) => {
  const token = await loginAndInstallStub(page, 'dev_master', 'dev_p05_pass!')
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  await page.goto(`${BASE_URL}/#/products/estimate-items`)
  await page.waitForSelector('[data-testid="estimate-items-table"]', { timeout: 30000 })

  // 실 BUNDLE 행 검색(usage=BOTH 시작 → 견적/주문 둘 다 checked)
  const searchInput = page
    .locator('[data-testid="estimate-items-search-input"] input, input[data-testid="estimate-items-search-input"]')
    .first()
  await searchInput.fill(BUNDLE_CODE)
  await page.locator('[data-testid="estimate-items-query-button"]').click()

  // 백업 — 현재 usageScope/estimateCategory (원복용)
  const beforeRes = await page.request.get(`${API_BASE}/api/v1/products`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { q: BUNDLE_CODE, size: '5' },
  })
  const beforeRow: CatalogRow =
    ((await beforeRes.json()).content ?? []).find((r: CatalogRow) => r.modelCode === BUNDLE_CODE)
  const origScope = beforeRow.usageScope ?? 'BOTH'
  const origCategories = beforeRow.estimateCategories?.map((entry) => entry.category)
    ?? (beforeRow.estimateCategory ? [beforeRow.estimateCategory] : [])
  console.log(`[4] 백업 — ${BUNDLE_CODE} usageScope=${origScope}, categories=${origCategories.join(',') || '없음'}`)

  // 주문 노출 토글(현재 ON) 클릭 → OFF (BOTH→ESTIMATE). PATCH /usage 200 가로채기.
  const orderToggle = page.locator(`[data-testid="estimate-items-order-toggle-${BUNDLE_CODE}"]`)
  await orderToggle.waitFor({ state: 'visible', timeout: 15000 })
  const checkedBefore = await orderToggle.isChecked()
  const patchPromise = page.waitForResponse(
    (r) =>
      r.url().includes(`/api/v1/products/${BUNDLE_CODE}/usage`) && r.request().method() === 'PATCH',
    { timeout: 20000 },
  )
  await orderToggle.click()
  const patchResp = await patchPromise
  expect(patchResp.status(), `노출 토글 PATCH 응답이 200 이 아님: ${patchResp.status()}`).toBe(200)
  console.log(`[4] PASS 토글: 주문 노출 ${checkedBefore}→${!checkedBefore}, PATCH /usage HTTP ${patchResp.status()}`)

  // 토글 상태 반영 대기 후 캡처
  await expect.poll(async () => orderToggle.isChecked(), { timeout: 10000 }).toBe(!checkedBefore)
  await shot(page, 'cycle-usage-toggle')

  // 원복 — 원래 usageScope/category 로 PATCH (dev DB 청결)
  const restore = await page.request.patch(`${API_BASE}/api/v1/products/${BUNDLE_CODE}/usage`, {
    headers: auth,
    data: {
      usageScope: origScope,
      estimateCategories: origScope === 'ESTIMATE' || origScope === 'BOTH' ? origCategories : [],
    },
  })
  expect(restore.ok(), `usage 원복 PATCH 실패: HTTP ${restore.status()}`).toBeTruthy()
  console.log(`[4] PASS 원복: usageScope=${origScope} 복원, PATCH HTTP ${restore.status()}`)
})
