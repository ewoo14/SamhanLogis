/**
 * 품목 관리 Playwright mock TC — PR-B 품목 노출 수동 토글.
 *
 * <h2>검증 시나리오</h2>
 * <ol>
 *   <li>목록 렌더 — `/products/catalog` 진입 → 품목 행 표시 + '시트자동' 뱃지</li>
 *   <li>토글 왕복 — 견적 체크해제 → PATCH → '수동' 뱃지 갱신</li>
 *   <li>시트 복귀 — '시트 자동 복귀' 버튼 클릭 → DELETE → '시트자동' 뱃지 복원</li>
 *   <li>view-only 권한 — SALES role 진입 시 체크박스 비활성</li>
 * </ol>
 *
 * <h2>Mock 전략</h2>
 * - VITE_MOCK_MODE=1 mock.ts 핸들러 사용.
 * - 런타임 동작 단언: 실제 DOM 상태 + 뱃지 텍스트 + checkbox disabled 속성 검증.
 * - 소스 정적 단언 금지 (TC-SP-10 교훈 — feedback_no_fake_data_ever).
 *
 * <h2>실행 방법</h2>
 * <pre>
 *   cd clients/desktop
 *   node_modules/.bin/playwright test playwright/product-catalog --reporter=line
 * </pre>
 */
import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

/**
 * window.samhanAuth stub — AuthGuard 통과.
 * role 은 `?mockRole=` URL param 으로 mock.ts 에 주입 (module-level MOCK_AUTH.role 를 덮음).
 */
async function installAuth(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const auth = {
      token: 'playwright-token',
      userId: '00000000-0000-0000-0000-000000010001',
      role: 'MANAGER',
      fullName: '테스트사용자',
      partnerCode: null,
    }
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => auth,
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  })
}

async function gotoProductCatalog(page: Page, mockRole = 'MASTER'): Promise<void> {
  await page.goto(`${BASE_URL}/#/products/catalog?mockRole=${mockRole}`, { waitUntil: 'domcontentloaded' })
  // 페이지 로드 확인 — 조회 버튼 표시 대기
  await expect(page.getByTestId('product-catalog-query-button')).toBeVisible({ timeout: 15_000 })
}

// ---------------------------------------------------------------------------
// Scenario 1: 목록 렌더
// ---------------------------------------------------------------------------

test.describe('품목 관리 페이지 — PR-B 노출 수동 토글', () => {
  test('시나리오 1: 목록 렌더 — 품목 행 + 뱃지 표시', async ({ page }) => {
    await installAuth(page)
    await gotoProductCatalog(page, 'MASTER')

    // 조회 버튼 클릭 → 품목 목록 로드
    await page.getByTestId('product-catalog-query-button').click()

    // DataTable 표시 대기
    const table = page.getByTestId('product-catalog-table')
    await expect(table).toBeVisible({ timeout: 10_000 })

    // 최소 1개 행 표시 확인 (MOCK_PRODUCTS_BY_MODEL 6건 이상)
    const rows = table.locator('tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 5_000 })
    const rowCount = await rows.count()
    expect(rowCount).toBeGreaterThan(0)

    // 첫 번째 행에 '시트자동' 또는 '수동' 뱃지 존재 확인
    const firstBadge = table.locator('[data-testid^="product-catalog-source-badge-"]').first()
    await expect(firstBadge).toBeVisible()
    const badgeText = await firstBadge.textContent()
    expect(badgeText).toMatch(/시트자동|수동/)
  })

  // ---------------------------------------------------------------------------
  // Scenario 2: 토글 왕복 (견적 체크 → PATCH → '수동' 뱃지)
  // ---------------------------------------------------------------------------

  test('시나리오 2: 토글 왕복 — 견적 체크 변경 후 수동 뱃지 표시', async ({ page }) => {
    await installAuth(page)
    await gotoProductCatalog(page, 'MASTER')

    // 조회
    await page.getByTestId('product-catalog-query-button').click()
    const table = page.getByTestId('product-catalog-table')
    await expect(table.locator('tbody tr').first()).toBeVisible({ timeout: 10_000 })

    // 첫 번째 행의 modelCode 파악
    const firstEstimateToggle = table.locator('[data-testid^="product-catalog-estimate-toggle-"]').first()
    await expect(firstEstimateToggle).toBeVisible()

    // data-testid 에서 modelCode 추출
    const testId = await firstEstimateToggle.getAttribute('data-testid')
    const modelCode = testId?.replace('product-catalog-estimate-toggle-', '') ?? ''
    expect(modelCode.length).toBeGreaterThan(0)

    // 견적 체크박스 현재 상태 확인 후 반전
    const isChecked = await firstEstimateToggle.isChecked()
    await firstEstimateToggle.click()

    // PATCH 후 뱃지가 '수동'으로 변경되어야 함
    const sourceBadge = page.getByTestId(`product-catalog-source-badge-${modelCode}`)
    await expect(sourceBadge).toHaveText('수동', { timeout: 5_000 })

    // 체크 상태가 반전됐음을 확인
    const newChecked = await firstEstimateToggle.isChecked()
    expect(newChecked).toBe(!isChecked)
  })

  // ---------------------------------------------------------------------------
  // Scenario 3: 시트 복귀 (DELETE → '시트자동' 뱃지)
  // ---------------------------------------------------------------------------

  test('시나리오 3: 시트 자동 복귀 버튼 → DELETE → 시트자동 뱃지', async ({ page }) => {
    await installAuth(page)
    await gotoProductCatalog(page, 'MASTER')

    // 조회
    await page.getByTestId('product-catalog-query-button').click()
    const table = page.getByTestId('product-catalog-table')
    await expect(table.locator('tbody tr').first()).toBeVisible({ timeout: 10_000 })

    // 먼저 토글을 눌러 '수동' 상태로 만듦
    const firstEstimateToggle = table.locator('[data-testid^="product-catalog-estimate-toggle-"]').first()
    await expect(firstEstimateToggle).toBeVisible()
    const testId = await firstEstimateToggle.getAttribute('data-testid')
    const modelCode = testId?.replace('product-catalog-estimate-toggle-', '') ?? ''

    // 수동으로 변경 (토글 클릭)
    await firstEstimateToggle.click()
    const sourceBadge = page.getByTestId(`product-catalog-source-badge-${modelCode}`)
    await expect(sourceBadge).toHaveText('수동', { timeout: 5_000 })

    // '시트 자동 복귀' 버튼 표시 확인 및 클릭
    const clearBtn = page.getByTestId(`product-catalog-clear-${modelCode}`)
    await expect(clearBtn).toBeVisible({ timeout: 3_000 })
    await clearBtn.click()

    // DELETE 후 뱃지가 '시트자동'으로 복원
    await expect(sourceBadge).toHaveText('시트자동', { timeout: 5_000 })

    // '시트 자동 복귀' 버튼은 사라짐 (usageScopeManual=false)
    await expect(clearBtn).not.toBeVisible({ timeout: 3_000 })
  })

  // ---------------------------------------------------------------------------
  // Scenario 4: view-only 권한 — 체크박스 비활성
  // ---------------------------------------------------------------------------

  test('시나리오 4: view-only 권한(WAREHOUSE) — 토글 체크박스 비활성', async ({ page }) => {
    // WAREHOUSE: products.list VIEW 허용 + products.admin UPDATE 없음 (mock seed 기준).
    // SALES 역할이 아닌 WAREHOUSE 역할로 검증 — products.admin 미부여 역할로 view-only 동작 확인.
    // mockRole=WAREHOUSE 를 URL 로 주입 → mock.ts MOCK_AUTH.role=WAREHOUSE
    await installAuth(page)
    await gotoProductCatalog(page, 'WAREHOUSE')

    // 조회
    await page.getByTestId('product-catalog-query-button').click()
    const table = page.getByTestId('product-catalog-table')
    await expect(table.locator('tbody tr').first()).toBeVisible({ timeout: 10_000 })

    // 조회 전용 배너 표시
    const banner = page.getByTestId('product-catalog-readonly-banner')
    await expect(banner).toBeVisible()

    // 견적 토글 체크박스 비활성 확인
    const firstEstimateToggle = table.locator('[data-testid^="product-catalog-estimate-toggle-"]').first()
    await expect(firstEstimateToggle).toBeVisible()
    await expect(firstEstimateToggle).toBeDisabled()

    // 주문 토글 체크박스 비활성 확인
    const firstOrderToggle = table.locator('[data-testid^="product-catalog-order-toggle-"]').first()
    await expect(firstOrderToggle).toBeVisible()
    await expect(firstOrderToggle).toBeDisabled()
  })
})
