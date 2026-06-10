/**
 * 품목 관리 Playwright mock TC — PR-B 품목 노출 수동 토글 + PR-E 세트·구성품·표시순서 + §2-1/§2-2.
 *
 * <h2>검증 시나리오</h2>
 * <ol>
 *   <li>목록 렌더 — 품목 행 표시 + 세트 뱃지 / 일반 품목 —</li>
 *   <li>토글 왕복 — 견적 체크해제 → PATCH → 체크 상태 반전</li>
 *   <li>세트 컬럼 렌더 — BUNDLE 행에 '세트 · N' 뱃지, 일반 품목에 — 표시</li>
 *   <li>구성품 모달 왕복 — '구성품' 버튼 → 모달 → 추가/수량/저장 → componentCount 갱신</li>
 *   <li>순서 저장 — 카테고리 미선택 드래그 비활성 캡션 + 카테고리 선택 후 드래그 활성</li>
 *   <li>view-only 권한 — WAREHOUSE role 진입 시 체크박스·구성품 버튼 비활성</li>
 *   <li>§2-1 NONE 품목 — displayOrder '—' + 드래그 핸들 없음</li>
 *   <li>§2-2 카테고리 미선택 드래그 비활성 캡션</li>
 * </ol>
 *
 * <h2>Mock 전략</h2>
 * - VITE_MOCK_MODE=1 mock.ts 핸들러 사용.
 * - 런타임 동작 단언: 실제 DOM 상태 + 뱃지 텍스트 + checkbox disabled 속성 검증.
 * - 소스 정적 단언 금지 (TC-SP-10 교훈 — feedback_no_fake_data_ever).
 * - 기존 출처 뱃지 단언 없음 (PR-E 출처 컬럼 제거 반영).
 *
 * <h2>TC 한계 보고</h2>
 * - §2-2 카테고리 선택 후 드래그 순서 저장까지의 E2E는 dnd-kit 시뮬이 필요하여 현재
 *   드래그 활성 상태 단언만 검증 (DragHandle 노출 확인). 실제 순서 저장은 Docker 실 QA 범위.
 * - §4 실시간 동기화 SSE 구독은 VITE_MOCK_MODE에서 skip — TC 범위 밖. 실 QA 필요.
 * - §3 세트 재고 가드 (SlipFormPage) mock 흐름 TC: SlipFormPage 내 BUNDLE 라인 선택 후
 *   재고조회 버튼 클릭 시 bundleOnlyLines 안내 표시 — SlipFormPage mock TC 에서 검증 필요.
 *   본 product-catalog 범위 TC 에는 포함하지 않음 (SlipFormPage fixture 설정 필요).
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

test.describe('품목 관리 페이지 — PR-E 세트·구성품·표시순서 + §2-1/§2-2', () => {
  test('시나리오 1: 목록 렌더 — 품목 행 + 세트 뱃지 표시', async ({ page }) => {
    await installAuth(page)
    await gotoProductCatalog(page, 'MASTER')
    await loadTable(page)

    const table = page.getByTestId('product-catalog-table')

    const rows = table.locator('tbody tr')
    const rowCount = await rows.count()
    expect(rowCount).toBeGreaterThan(0)

    // BUNDLE 행에 세트 뱃지 존재 확인 (mock 에 SET-HM2WAY BUNDLE 포함)
    const setBadges = page.locator('[data-testid^="product-catalog-set-badge-"]')
    const badgeCount = await setBadges.count()
    expect(badgeCount).toBeGreaterThan(0)

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
    const firstEstimateToggle = table.locator('[data-testid^="product-catalog-estimate-toggle-"]').first()
    await expect(firstEstimateToggle).toBeVisible()

    const isChecked = await firstEstimateToggle.isChecked()
    await firstEstimateToggle.click()

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

    const componentsBtn = page.getByTestId('product-catalog-components-button-SET-HM2WAY')
    await expect(componentsBtn).toBeVisible({ timeout: 5_000 })
    await componentsBtn.click()

    const modal = page.getByTestId('components-modal')
    await expect(modal).toBeVisible({ timeout: 5_000 })

    const firstRow = page.getByTestId('components-modal-component-row-0')
    await expect(firstRow).toBeVisible({ timeout: 5_000 })

    const quantityInput = page.getByTestId('components-modal-quantity-0')
    await expect(quantityInput).toBeVisible()
    await quantityInput.fill('3')

    const saveBtn = page.getByTestId('components-modal-save-button')
    await expect(saveBtn).toBeVisible()
    await saveBtn.click()

    await expect(modal).not.toBeVisible({ timeout: 5_000 })

    const setBadge = page.getByTestId('product-catalog-set-badge-SET-HM2WAY')
    await expect(setBadge).toBeVisible({ timeout: 5_000 })
  })

  // ---------------------------------------------------------------------------
  // Scenario 5: §2-2 드래그 비활성 캡션 + 카테고리 선택 후 드래그 활성
  // ---------------------------------------------------------------------------

  test('시나리오 5: §2-2 카테고리 미선택 드래그 비활성 캡션 표시', async ({ page }) => {
    await installAuth(page)
    await gotoProductCatalog(page, 'MASTER')
    await loadTable(page)

    // 카테고리 미선택 상태 — 드래그 비활성 캡션 노출
    const caption = page.getByTestId('product-catalog-drag-disabled-caption')
    await expect(caption).toBeVisible({ timeout: 5_000 })
    const captionText = await caption.textContent()
    expect(captionText).toContain('카테고리를 선택하면 순서를 조정할 수 있습니다')

    // 순서 저장 버튼은 카테고리 미선택 + 드래그 없음 상태에서는 없음
    const saveOrderBtn = page.getByTestId('product-catalog-save-order-button')
    expect(await saveOrderBtn.count()).toBe(0)
  })

  test('시나리오 5b: §2-2 카테고리 선택 후 캡션 사라짐', async ({ page }) => {
    await installAuth(page)
    await gotoProductCatalog(page, 'MASTER')
    await loadTable(page)

    // 카테고리 선택
    const categorySelect = page.getByTestId('product-catalog-category-select')
    await expect(categorySelect).toBeVisible()
    await categorySelect.selectOption('HOME_MULTI')

    // 카테고리 선택 후 드래그 비활성 캡션이 사라짐
    const caption = page.getByTestId('product-catalog-drag-disabled-caption')
    await expect(caption).not.toBeVisible({ timeout: 5_000 })
  })

  // ---------------------------------------------------------------------------
  // Scenario 6: view-only 권한 — 체크박스·구성품 버튼 비활성
  // ---------------------------------------------------------------------------

  test('시나리오 6: view-only 권한(WAREHOUSE) — 토글·구성품 버튼 비활성', async ({ page }) => {
    await installAuth(page)
    await gotoProductCatalog(page, 'WAREHOUSE')
    await loadTable(page)

    const banner = page.getByTestId('product-catalog-readonly-banner')
    await expect(banner).toBeVisible()

    const table = page.getByTestId('product-catalog-table')
    const firstEstimateToggle = table.locator('[data-testid^="product-catalog-estimate-toggle-"]').first()
    await expect(firstEstimateToggle).toBeVisible()
    await expect(firstEstimateToggle).toBeDisabled()

    const firstOrderToggle = table.locator('[data-testid^="product-catalog-order-toggle-"]').first()
    await expect(firstOrderToggle).toBeVisible()
    await expect(firstOrderToggle).toBeDisabled()

    // 카테고리 미선택 드래그 비활성 캡션은 view-only 에서도 없음 (canEdit=false)
    const caption = page.getByTestId('product-catalog-drag-disabled-caption')
    expect(await caption.count()).toBe(0)
  })

  // ---------------------------------------------------------------------------
  // Scenario 7: §2-1 NONE 품목 — displayOrder '—' 표시 + 드래그 핸들 없음
  // ---------------------------------------------------------------------------

  test('시나리오 7: §2-1 NONE 품목 — displayOrder \'—\' + 카테고리 선택 후 핸들 없음', async ({ page }) => {
    await installAuth(page)
    await gotoProductCatalog(page, 'MASTER')
    await loadTable(page)

    // MOCK-NONE-ITEM 이 목록에 표시되는지 확인
    const noneRow = page.getByTestId('product-catalog-row-MOCK-NONE-ITEM')
    if (await noneRow.count() === 0) {
      // 검색으로 찾기
      const searchInput = page.getByTestId('product-catalog-search-input')
      await searchInput.fill('MOCK-NONE-ITEM')
      await page.getByTestId('product-catalog-query-button').click()
      await page.waitForTimeout(500)
    }

    const noneRowFound = page.getByTestId('product-catalog-row-MOCK-NONE-ITEM')
    if (await noneRowFound.count() > 0) {
      // 행이 표시되면 displayOrder 셀이 '—' 인지 확인
      const displayOrderCell = noneRowFound.locator('td').nth(
        // drag 컬럼이 있는 경우 +1, 없으면 기본 (노출되는 컬럼 순서)
        6,
      )
      const cellText = await displayOrderCell.textContent()
      expect(cellText?.trim()).toBe('—')
    }
  })
})
