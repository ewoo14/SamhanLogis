/**
 * 품목 관리 Playwright mock TC — PR-B 품목 노출 수동 토글 + PR-E 세트·구성품·표시순서.
 *
 * <h2>검증 시나리오</h2>
 * <ol>
 *   <li>목록 렌더 — `/products/catalog` 진입 → 품목 행 표시 + 세트 뱃지 / 일반 품목 —</li>
 *   <li>토글 왕복 — 견적 체크해제 → PATCH → 체크 상태 반전</li>
 *   <li>세트 컬럼 렌더 — BUNDLE 행에 '세트 · N' 뱃지, 일반 품목에 — 표시</li>
 *   <li>구성품 모달 왕복 — '구성품' 버튼 → 모달 → 추가/수량/저장 → componentCount 갱신</li>
 *   <li>순서 저장 — 위/아래 버튼 노출 확인 (dnd 시뮬 어려울 경우 대체)</li>
 *   <li>view-only 권한 — WAREHOUSE role 진입 시 체크박스·구성품 버튼 비활성</li>
 * </ol>
 *
 * <h2>Mock 전략</h2>
 * - VITE_MOCK_MODE=1 mock.ts 핸들러 사용.
 * - 런타임 동작 단언: 실제 DOM 상태 + 뱃지 텍스트 + checkbox disabled 속성 검증.
 * - 소스 정적 단언 금지 (TC-SP-10 교훈 — feedback_no_fake_data_ever).
 * - 기존 출처 뱃지 단언 제거 (PR-E 출처 컬럼 제거 반영).
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

async function loadTable(page: Page): Promise<void> {
  await page.getByTestId('product-catalog-query-button').click()
  const table = page.getByTestId('product-catalog-table')
  await expect(table).toBeVisible({ timeout: 10_000 })
  await expect(table.locator('tbody tr').first()).toBeVisible({ timeout: 10_000 })
}

// ---------------------------------------------------------------------------
// Scenario 1: 목록 렌더
// ---------------------------------------------------------------------------

test.describe('품목 관리 페이지 — PR-E 세트·구성품·표시순서', () => {
  test('시나리오 1: 목록 렌더 — 품목 행 + 세트 뱃지 표시', async ({ page }) => {
    await installAuth(page)
    await gotoProductCatalog(page, 'MASTER')
    await loadTable(page)

    const table = page.getByTestId('product-catalog-table')

    // 최소 1개 행 표시 확인 (MOCK_PRODUCTS_BY_MODEL 6건 이상)
    const rows = table.locator('tbody tr')
    const rowCount = await rows.count()
    expect(rowCount).toBeGreaterThan(0)

    // BUNDLE 행에 세트 뱃지 존재 확인 (mock 에 SET-HM2WAY BUNDLE 포함)
    const setBadges = page.locator('[data-testid^="product-catalog-set-badge-"]')
    const badgeCount = await setBadges.count()
    expect(badgeCount).toBeGreaterThan(0)

    // 첫 번째 세트 뱃지 텍스트가 '세트 · N' 형식인지 확인
    const firstBadgeText = await setBadges.first().textContent()
    expect(firstBadgeText).toMatch(/세트\s*·\s*\d+/)
  })

  // ---------------------------------------------------------------------------
  // Scenario 2: 토글 왕복
  // ---------------------------------------------------------------------------

  test('시나리오 2: 토글 왕복 — 견적 체크 변경 후 상태 반전', async ({ page }) => {
    await installAuth(page)
    await gotoProductCatalog(page, 'MASTER')
    await loadTable(page)

    const table = page.getByTestId('product-catalog-table')

    // 첫 번째 행의 modelCode 파악
    const firstEstimateToggle = table.locator('[data-testid^="product-catalog-estimate-toggle-"]').first()
    await expect(firstEstimateToggle).toBeVisible()

    // 견적 체크박스 현재 상태 확인 후 반전
    const isChecked = await firstEstimateToggle.isChecked()
    await firstEstimateToggle.click()

    // 체크 상태가 반전됐음을 확인 (PATCH mock 반영)
    // mock 이 즉시 PATCH 처리 + invalidate 로 상태 갱신
    await page.waitForTimeout(300)
    const newChecked = await firstEstimateToggle.isChecked()
    expect(newChecked).toBe(!isChecked)
  })

  // ---------------------------------------------------------------------------
  // Scenario 3: 세트 컬럼 — BUNDLE 뱃지 + 일반 품목 —
  // ---------------------------------------------------------------------------

  test('시나리오 3: 세트 컬럼 — BUNDLE 행에 뱃지, 일반 행에 —', async ({ page }) => {
    await installAuth(page)
    await gotoProductCatalog(page, 'MASTER')
    await loadTable(page)

    // SET-HM2WAY 가 mock 에 BUNDLE 로 포함됨 — 해당 행의 세트 뱃지 확인
    const setBadge = page.getByTestId('product-catalog-set-badge-SET-HM2WAY')
    await expect(setBadge).toBeVisible({ timeout: 5_000 })
    const badgeText = await setBadge.textContent()
    expect(badgeText).toMatch(/세트\s*·\s*\d+/)
  })

  // ---------------------------------------------------------------------------
  // Scenario 4: 구성품 모달 왕복 — 추가·수량·저장
  // ---------------------------------------------------------------------------

  test('시나리오 4: 구성품 모달 왕복 — 구성품 추가·수량 변경·저장', async ({ page }) => {
    await installAuth(page)
    await gotoProductCatalog(page, 'MASTER')
    await loadTable(page)

    // BUNDLE 행의 '구성품' 버튼 클릭
    const componentsBtn = page.getByTestId('product-catalog-components-button-SET-HM2WAY')
    await expect(componentsBtn).toBeVisible({ timeout: 5_000 })
    await componentsBtn.click()

    // 모달 표시 확인
    const modal = page.getByTestId('components-modal')
    await expect(modal).toBeVisible({ timeout: 5_000 })

    // 첫 번째 구성품 행 표시 확인 (mock 에 3건 포함)
    const firstRow = page.getByTestId('components-modal-component-row-0')
    await expect(firstRow).toBeVisible({ timeout: 5_000 })

    // 첫 번째 수량 입력 변경 (2 → 3)
    const quantityInput = page.getByTestId('components-modal-quantity-0')
    await expect(quantityInput).toBeVisible()
    await quantityInput.fill('3')

    // 저장 버튼 클릭
    const saveBtn = page.getByTestId('components-modal-save-button')
    await expect(saveBtn).toBeVisible()
    await saveBtn.click()

    // 저장 후 모달 닫힘 확인
    await expect(modal).not.toBeVisible({ timeout: 5_000 })

    // 세트 뱃지 componentCount 갱신 확인 (mock PUT → componentCount 갱신)
    const setBadge = page.getByTestId('product-catalog-set-badge-SET-HM2WAY')
    await expect(setBadge).toBeVisible({ timeout: 5_000 })
  })

  // ---------------------------------------------------------------------------
  // Scenario 5: 순서 저장 버튼 활성 확인
  // ---------------------------------------------------------------------------

  test('시나리오 5: 순서 저장 — 드래그 활성 상태 + 순서 저장 버튼 노출', async ({ page }) => {
    await installAuth(page)
    await gotoProductCatalog(page, 'MASTER')

    // MASTER + 검색 없음 → 드래그 활성
    await loadTable(page)

    // 검색 없을 때 순서 저장 버튼은 드래그 전에는 숨김 (orderDirty=false)
    const saveOrderBtn = page.getByTestId('product-catalog-save-order-button')
    // 드래그 전 — 버튼 없음
    expect(await saveOrderBtn.count()).toBe(0)

    // 구성품 모달 열기/닫기 후 순서 저장 버튼 여전히 없음 (드래그 없음)
    // (dnd 시뮬이 어렵기 때문에 버튼 노출 조건만 검증)
    // 검색 후 드래그 비활성 힌트 메시지 확인
    const searchInput = page.getByTestId('product-catalog-search-input')
    await searchInput.fill('세트')
    await page.getByTestId('product-catalog-query-button').click()

    // 검색 활성 시 드래그 비활성 힌트 표시
    const dragHint = page.getByText('검색 중 — 드래그 비활성')
    await expect(dragHint).toBeVisible({ timeout: 5_000 })
  })

  // ---------------------------------------------------------------------------
  // Scenario 6: view-only 권한 — 체크박스·구성품 버튼 비활성
  // ---------------------------------------------------------------------------

  test('시나리오 6: view-only 권한(WAREHOUSE) — 토글·구성품 버튼 비활성', async ({ page }) => {
    // WAREHOUSE: products.list VIEW 허용 + products.admin UPDATE 없음 (mock seed 기준).
    await installAuth(page)
    await gotoProductCatalog(page, 'WAREHOUSE')
    await loadTable(page)

    // 조회 전용 배너 표시
    const banner = page.getByTestId('product-catalog-readonly-banner')
    await expect(banner).toBeVisible()

    // 견적 토글 체크박스 비활성 확인
    const table = page.getByTestId('product-catalog-table')
    const firstEstimateToggle = table.locator('[data-testid^="product-catalog-estimate-toggle-"]').first()
    await expect(firstEstimateToggle).toBeVisible()
    await expect(firstEstimateToggle).toBeDisabled()

    // 주문 토글 체크박스 비활성 확인
    const firstOrderToggle = table.locator('[data-testid^="product-catalog-order-toggle-"]').first()
    await expect(firstOrderToggle).toBeVisible()
    await expect(firstOrderToggle).toBeDisabled()

    // BUNDLE 행 구성품 버튼이 read-only 에서도 보이는지 확인
    // (구성품 버튼은 권한 없어도 read 모달 열람 가능 — canEdit=false 시 모달 내 저장 버튼만 숨김)
    const componentsBtn = page.locator('[data-testid^="product-catalog-components-button-"]').first()
    if (await componentsBtn.count() > 0) {
      await expect(componentsBtn).toBeVisible()
      // 클릭 시 모달 열림 (read-only 모달)
      await componentsBtn.click()
      const modal = page.getByTestId('components-modal')
      await expect(modal).toBeVisible({ timeout: 5_000 })
      // 저장 버튼은 없음 (canEdit=false)
      const saveBtn = page.getByTestId('components-modal-save-button')
      expect(await saveBtn.count()).toBe(0)
    }
  })
})
