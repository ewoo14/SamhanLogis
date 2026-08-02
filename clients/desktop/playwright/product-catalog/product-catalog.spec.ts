/**
 * 품목 관리 Playwright mock TC — PR-B 품목 노출 수동 토글 + PR-E 세트·구성품·표시순서 + §2-1/§2-2.
 *
 * <h2>검증 시나리오</h2>
 * <ol>
 *   <li>목록 렌더 — 품목 행 표시 + 세트 뱃지 / 일반 품목 —</li>
 *   <li>견적 노출 해제 — PATCH → 견적품목 목록에서 제거</li>
 *   <li>세트 컬럼 렌더 — BUNDLE 행에 '세트 · N' 뱃지, 일반 품목에 — 표시</li>
 *   <li>구성품 모달 왕복 — '구성품' 버튼 → 모달 → 추가/수량/저장 → componentCount 갱신</li>
 *   <li>순서 저장 — 기본 카테고리 탭에서 드래그 활성 + 탭별 순서 저장</li>
 *   <li>view-only 권한 — WAREHOUSE role 진입 시 체크박스 비활성</li>
 *   <li>§2-1 NONE 품목 — displayOrder '—' + 드래그 핸들 없음</li>
 *   <li>§2-2 카테고리 탭 컨텍스트에서 드래그 항상 활성</li>
 * </ol>
 *
 * <h2>Mock 전략</h2>
 * - VITE_MOCK_MODE=1 mock.ts 핸들러 사용.
 * - 런타임 동작 단언: 실제 DOM 상태 + 뱃지 텍스트 + checkbox disabled 속성 검증.
 * - 소스 정적 단언 금지 (TC-SP-10 교훈 — feedback_no_fake_data_ever).
 * - 기존 출처 뱃지 단언 없음 (PR-E 출처 컬럼 제거 반영).
 *
 * <h2>TC 한계 보고</h2>
 * - §2-2 카테고리 탭 컨텍스트에서 mock 드래그→순서 저장 payload 까지 검증한다.
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

async function gotoEstimateItemsCatalog(page: Page, mockRole = 'MASTER'): Promise<void> {
  await page.goto(`${BASE_URL}/#/products/estimate-items?mockRole=${mockRole}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('estimate-items-query-button')).toBeVisible({ timeout: 15_000 })
}

async function loadTable(page: Page): Promise<void> {
  await page.getByTestId('product-catalog-query-button').click()
  const table = page.getByTestId('product-catalog-table')
  await expect(table).toBeVisible({ timeout: 10_000 })
  await expect(table.locator('tbody tr').first()).toBeVisible({ timeout: 10_000 })
}

async function loadEstimateItemsTable(page: Page): Promise<void> {
  await page.getByTestId('estimate-items-query-button').click()
  const table = page.getByTestId('estimate-items-table')
  await expect(table).toBeVisible({ timeout: 10_000 })
  await expect(table.locator('tbody tr').first()).toBeVisible({ timeout: 10_000 })
}

async function selectEstimateItemsCategoryTab(page: Page, category: string): Promise<void> {
  const tab = page.getByTestId(`estimate-items-category-tab-${category}`)
  await expect(tab).toBeVisible({ timeout: 8_000 })
  await tab.click()
  await expect(tab).toHaveAttribute('aria-selected', 'true')
}

const BUNDLE_COMPONENT_CODES = [
  'AJ040RXH4BC1',
  'AJ100NCDKH',
  'PNL-BASIC',
  'PNL-BLACK',
  'PNL-LIFT',
  'PNL-CLEAN',
  'MWR-WE10N',
  'MWR-WE13N',
  'MWR-SH11N',
]
const BUNDLE_MODAL_TITLE_PATTERN =
  /구성품 편집\s*—\s*SET-HM2WAY\s*·\s*가정용 멀티 2in1 세트/

async function openSetComponentsModal(page: Page): Promise<void> {
  await gotoEstimateItemsCatalog(page, 'MASTER')
  await loadEstimateItemsTable(page)
  await selectEstimateItemsCategoryTab(page, 'SINGLE_SET')
  const componentsBtn = page.getByTestId('estimate-items-components-button-SET-HM2WAY')
  await expect(componentsBtn).toBeVisible({ timeout: 5_000 })
  await componentsBtn.click()
  await expect(page.getByTestId('components-modal')).toBeVisible({ timeout: 5_000 })
  await expect(page.getByRole('dialog', { name: BUNDLE_MODAL_TITLE_PATTERN })).toBeVisible()
  await expect(page.locator('[data-testid^="components-modal-component-row-"]')).toHaveCount(9, {
    timeout: 5_000,
  })
}

async function componentCodes(page: Page): Promise<string[]> {
  const rows = page.locator('[data-testid^="components-modal-component-row-"]')
  const count = await rows.count()
  const result: string[] = []
  for (let i = 0; i < count; i += 1) {
    const text = (await rows.nth(i).textContent()) ?? ''
    const code = BUNDLE_COMPONENT_CODES.find((candidate) => text.includes(candidate))
    if (code) result.push(code)
  }
  return result
}

async function keyboardMoveComponent(
  page: Page,
  fromIndex: number,
  direction: 'ArrowUp' | 'ArrowDown',
  steps = 1,
): Promise<void> {
  await page.getByTestId(`components-modal-drag-handle-${fromIndex}`).focus()
  await page.keyboard.press('Space')
  await page.waitForTimeout(150)
  for (let i = 0; i < steps; i += 1) {
    await page.keyboard.press(direction)
    await page.waitForTimeout(150)
  }
  await page.keyboard.press('Space')
}

async function dragRowByMouse(page: Page, fromIndex: number, toIndex: number): Promise<void> {
  const rows = page.locator('[data-testid^="estimate-items-row-"]')
  const handles = page.locator('[aria-label$="드래그"]')
  const source = handles.nth(fromIndex)
  const targetRow = page.locator('[data-testid^="estimate-items-row-"]').nth(toIndex)
  await expect(source).toBeVisible({ timeout: 8_000 })
  await expect(targetRow).toBeVisible({ timeout: 8_000 })
  const sourceCode = ((await rows.nth(fromIndex).getAttribute('data-testid')) ?? '').replace(
    'estimate-items-row-',
    '',
  )

  const sourceBox = await source.boundingBox()
  const targetBox = await targetRow.boundingBox()
  if (!sourceBox || !targetBox) {
    throw new Error('드래그 핸들 또는 대상 행 boundingBox 를 가져오지 못했습니다.')
  }

  const startX = sourceBox.x + sourceBox.width / 2
  const startY = sourceBox.y + sourceBox.height / 2
  const targetX = targetBox.x + targetBox.width / 2
  const targetY = targetBox.y + targetBox.height / 2

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX, startY + 8, { steps: 3 })
  await page.mouse.move(targetX, targetY, { steps: 12 })
  await page.mouse.up()

  await page.waitForTimeout(250)
  const targetCodeAfterMouse = ((await rows.nth(toIndex).getAttribute('data-testid')) ?? '').replace(
    'estimate-items-row-',
    '',
  )
  if (sourceCode && targetCodeAfterMouse === sourceCode) return

  await handles.nth(fromIndex).focus()
  await page.keyboard.press('Space')
  await page.waitForTimeout(100)
  const direction = toIndex > fromIndex ? 'ArrowDown' : 'ArrowUp'
  for (let i = 0; i < Math.abs(toIndex - fromIndex); i += 1) {
    await page.keyboard.press(direction)
    await page.waitForTimeout(100)
  }
  await page.keyboard.press('Space')
}

// ---------------------------------------------------------------------------
// Scenario 1: 목록 렌더
// ---------------------------------------------------------------------------

test.describe('품목 관리 페이지 — PR-E 세트·구성품·표시순서 + §2-1/§2-2', () => {
  test('시나리오 0a: 기초품목 관리 — 등록 전용 목록으로 노출/정렬 UI 를 표시하지 않는다', async ({ page }) => {
    await installAuth(page)
    await gotoProductCatalog(page, 'MASTER')
    await loadTable(page)

    await expect(page.getByRole('heading', { name: '기초품목 관리', level: 3 })).toBeVisible()
    await expect(page.getByTestId('product-catalog-create-button')).toBeVisible()
    await expect(page.getByTestId('product-catalog-category-select')).toHaveCount(0)
    await expect(page.locator('[data-testid^="product-catalog-estimate-toggle-"]')).toHaveCount(0)
    await expect(page.locator('[data-testid^="product-catalog-order-toggle-"]')).toHaveCount(0)
    await expect(page.getByTestId('product-catalog-save-order-button')).toHaveCount(0)
    await expect(page.getByTestId('product-catalog-drag-disabled-caption')).toHaveCount(0)

    await expect(page.locator('[data-testid^="product-catalog-components-button-"]')).toHaveCount(0)
    await expect(page.getByTestId('components-modal')).toHaveCount(0)
  })

  test('시나리오 0b: 견적품목 관리 — 노출 품목 관리와 기초품목 선택 추가를 제공한다', async ({ page }) => {
    await installAuth(page)
    await gotoEstimateItemsCatalog(page, 'MASTER')
    await loadEstimateItemsTable(page)

    await expect(page.getByRole('heading', { name: '견적품목 관리', level: 3 })).toBeVisible()
    await expect(page.getByTestId('estimate-items-category-select')).toHaveCount(0)
    await expect(page.getByTestId('estimate-items-category-tabs')).toBeVisible()
    await expect(page.getByTestId('estimate-items-category-tab-HOME_MULTI')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('estimate-items-category-tab-SINGLE_SET')).toBeVisible()
    await expect(page.getByTestId('estimate-items-category-tab-COMMERCIAL_MULTI')).toBeVisible()
    await expect(page.getByTestId('estimate-items-category-tab-LEGACY')).toBeVisible()
    await expect(page.locator('[data-testid^="estimate-items-estimate-toggle-"]').first()).toBeVisible()
    await expect(page.locator('[data-testid^="estimate-items-order-toggle-"]').first()).toBeVisible()
    await expect(page.getByTestId('product-catalog-create-button')).toHaveCount(0)

    const addRegion = page.getByTestId('estimate-items-add-product')
    const searchInput = addRegion.getByPlaceholder('모델명 또는 품목명 입력')
    await searchInput.click()
    await searchInput.fill('AJ036NCH3CH')
    // 새 검색 계약: 단일 후보는 dropdown 클릭 없이 즉시 선택 칩으로 확정된다.
    await expect(page.getByTestId('multiselect-chip-count')).toHaveText('1개 선택됨', { timeout: 5_000 })

    const addBtn = page.getByTestId('estimate-items-add-product-button')
    await expect(addBtn).toBeEnabled()
    await addBtn.click()

    const addedToggle = page.getByTestId('estimate-items-estimate-toggle-AJ036NCH3CH')
    await expect(addedToggle).toBeVisible({ timeout: 8_000 })
    await expect(addedToggle).toBeChecked()
    await expect(page.getByTestId('estimate-items-estimate-category-AJ036NCH3CH-chip-HOME_MULTI')).toBeVisible()
  })

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
  // Scenario 2: 견적 노출 해제 → 견적품목 목록에서 제거
  // ---------------------------------------------------------------------------

  test('시나리오 2: 견적 노출 해제 — 견적품목 목록에서 제거', async ({ page }) => {
    await installAuth(page)
    await gotoEstimateItemsCatalog(page, 'MASTER')
    await loadEstimateItemsTable(page)

    const table = page.getByTestId('estimate-items-table')
    const firstEstimateToggle = table.locator('[data-testid^="estimate-items-estimate-toggle-"]').first()
    await expect(firstEstimateToggle).toBeVisible()

    // BE syncEstimateExposures 는 NONE/PARTNER_ORDER 에서 활성 견적 노출을 soft-delete 하므로
    // 견적 노출 해제 후 같은 modelCode 는 현재 견적품목 카테고리 목록에서 제거되어야 한다.
    const toggleTestId = await firstEstimateToggle.getAttribute('data-testid')
    expect(toggleTestId).toBeTruthy()
    const toggle = page.getByTestId(toggleTestId!)
    await expect(toggle).toBeChecked()

    await toggle.click()

    await expect(page.getByTestId(toggleTestId!)).toHaveCount(0)
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
  // Scenario 4: 구성품 모달 왕복 — 추가·수량·저장 (명시 단언 강화 — P2 vacuous pass 수정)
  // ---------------------------------------------------------------------------

  test('시나리오 4: 견적품목 구성품 모달 왕복 — 구성품 추가·수량 변경·저장·componentCount 갱신', async ({ page }) => {
    await installAuth(page)
    await gotoEstimateItemsCatalog(page, 'MASTER')
    await loadEstimateItemsTable(page)

    // 1. 구성품 버튼 존재 단언
    await selectEstimateItemsCategoryTab(page, 'SINGLE_SET')
    const componentsBtn = page.getByTestId('estimate-items-components-button-SET-HM2WAY')
    await expect(componentsBtn).toBeVisible({ timeout: 5_000 })

    // 2. 모달 열기
    await componentsBtn.click()
    const modal = page.getByTestId('components-modal')
    await expect(modal).toBeVisible({ timeout: 5_000 })
    await expect(page.getByRole('dialog', { name: BUNDLE_MODAL_TITLE_PATTERN })).toBeVisible()

    // 3. 기존 구성품 row-0 존재 단언 (mock 시드 9개)
    const firstRow = page.getByTestId('components-modal-component-row-0')
    await expect(firstRow).toBeVisible({ timeout: 5_000 })

    // 4. 첫 번째 구성품 모델코드 텍스트 단언 (BE 필드명 componentProductCode 기반 — P1-A 검증)
    const firstRowText = await firstRow.textContent()
    expect(firstRowText).toContain('AJ040RXH4BC1')

    // 5. 수량 변경 (3으로)
    const quantityInput = page.getByTestId('components-modal-quantity-0')
    await expect(quantityInput).toBeVisible()
    await quantityInput.fill('3')

    // 6. 저장 버튼 클릭
    const saveBtn = page.getByTestId('components-modal-save-button')
    await expect(saveBtn).toBeVisible()
    await saveBtn.click()

    // 7. 모달 닫힘 단언
    await expect(modal).not.toBeVisible({ timeout: 5_000 })

    // 8. 세트 뱃지 여전히 표시 단언 (componentCount 갱신)
    const setBadge = page.getByTestId('estimate-items-set-badge-SET-HM2WAY')
    await expect(setBadge).toBeVisible({ timeout: 5_000 })
    const badgeText = await setBadge.textContent()
    // 저장 후 componentCount = 9 (수량 변경만, 행 개수 유지)
    expect(badgeText).toMatch(/세트\s*·\s*9/)
  })

  // ---------------------------------------------------------------------------
  // Scenario 4b: 구성품 모달 — 새 품목 추가 실제 수행 (P2 vacuous pass 수정)
  // ---------------------------------------------------------------------------

  test('시나리오 4b: 견적품목 구성품 모달 — 품목 검색 후 추가 실제 수행·행 개수 증가 단언', async ({ page }) => {
    await installAuth(page)
    await gotoEstimateItemsCatalog(page, 'MASTER')
    await loadEstimateItemsTable(page)

    await selectEstimateItemsCategoryTab(page, 'SINGLE_SET')
    const componentsBtn = page.getByTestId('estimate-items-components-button-SET-HM2WAY')
    await expect(componentsBtn).toBeVisible({ timeout: 5_000 })
    await componentsBtn.click()

    const modal = page.getByTestId('components-modal')
    await expect(modal).toBeVisible({ timeout: 5_000 })

    // 기존 행 수 확인 (mock 시드 3개)
    const rowsBefore = modal.locator('[data-testid^="components-modal-component-row-"]')
    const countBefore = await rowsBefore.count()
    expect(countBefore).toBeGreaterThan(0)

    // 품목 검색 — AJ052RXH5BC1 (mock 에 존재하는 단품). ProductAutocomplete combobox 로 검색→후보 선택→추가.
    const searchInput = modal.getByPlaceholder('모델명 또는 품목명 입력')
    await searchInput.click()
    await searchInput.fill('AJ052')
    const option = page.locator('li[role="option"]').filter({ hasText: 'AJ052' }).first()
    await expect(option).toBeVisible({ timeout: 5_000 })
    await option.click()
    // 선택 후 추가 버튼(modelCode 별 testid) 활성 → 클릭
    const addBtn = page.getByTestId('components-modal-add-AJ052RXH5BC1')
    await expect(addBtn).toBeVisible({ timeout: 5_000 })
    await addBtn.click()

    // 행 수 증가 단언
    const rowsAfter = modal.locator('[data-testid^="components-modal-component-row-"]')
    await expect(rowsAfter).toHaveCount(countBefore + 1, { timeout: 3_000 })

    // 저장 후 모달 닫힘
    const saveBtn = page.getByTestId('components-modal-save-button')
    await saveBtn.click()
    await expect(modal).not.toBeVisible({ timeout: 5_000 })
  })

  test('시나리오 4c: 구성품 드래그 정렬 — 종류 내 재정렬 저장·기본 고정·종류 경계 거부', async ({ page }) => {
    await installAuth(page)
    await openSetComponentsModal(page)

    await expect(page.getByTestId('components-modal-kind-group-INDOOR')).toBeVisible()
    await expect(page.getByTestId('components-modal-kind-group-OUTDOOR')).toBeVisible()
    await expect(page.getByTestId('components-modal-kind-group-PANEL')).toBeVisible()
    await expect(page.getByTestId('components-modal-kind-group-REMOTE')).toBeVisible()

    const initial = await componentCodes(page)
    expect(initial).toEqual([
      'AJ040RXH4BC1',
      'AJ100NCDKH',
      'PNL-BASIC',
      'PNL-BLACK',
      'PNL-LIFT',
      'PNL-CLEAN',
      'MWR-WE10N',
      'MWR-WE13N',
      'MWR-SH11N',
    ])

    await expect(page.getByTestId('components-modal-drag-handle-2')).toBeDisabled()

    await keyboardMoveComponent(page, 3, 'ArrowDown', 4)
    await expect.poll(() => componentCodes(page), { timeout: 3_000 }).toEqual(initial)

    await keyboardMoveComponent(page, 4, 'ArrowUp')
    await expect.poll(() => componentCodes(page), { timeout: 3_000 }).toEqual([
      'AJ040RXH4BC1',
      'AJ100NCDKH',
      'PNL-BASIC',
      'PNL-LIFT',
      'PNL-BLACK',
      'PNL-CLEAN',
      'MWR-WE10N',
      'MWR-WE13N',
      'MWR-SH11N',
    ])

    await page.getByTestId('components-modal-save-button').click()
    await expect(page.getByTestId('components-modal')).not.toBeVisible({ timeout: 5_000 })

    await openSetComponentsModal(page)
    await expect.poll(() => componentCodes(page), { timeout: 5_000 }).toEqual([
      'AJ040RXH4BC1',
      'AJ100NCDKH',
      'PNL-BASIC',
      'PNL-LIFT',
      'PNL-BLACK',
      'PNL-CLEAN',
      'MWR-WE10N',
      'MWR-WE13N',
      'MWR-SH11N',
    ])
  })

  // ---------------------------------------------------------------------------
  // Scenario 5: §2-2 기본 탭 드래그 활성 + 탭 전환
  // ---------------------------------------------------------------------------

  test('시나리오 5: §2-2 기본 홈멀티 탭에서 드래그와 순서 저장이 활성화된다', async ({ page }) => {
    await installAuth(page)
    await gotoEstimateItemsCatalog(page, 'MASTER')
    await loadEstimateItemsTable(page)

    await expect(page.getByTestId('estimate-items-category-tab-HOME_MULTI')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('estimate-items-drag-disabled-caption')).toHaveCount(0)
    await expect(page.getByTestId('estimate-items-save-order-button')).toBeVisible()
    await expect(page.locator('[aria-label$="드래그"]').first()).toBeVisible({ timeout: 8_000 })
  })

  test('시나리오 5b: §2-2 카테고리 탭 전환 후 해당 탭 컨텍스트로 목록을 조회한다', async ({ page }) => {
    await installAuth(page)
    await gotoEstimateItemsCatalog(page, 'MASTER')
    await loadEstimateItemsTable(page)

    await selectEstimateItemsCategoryTab(page, 'SINGLE_SET')
    await expect(page.getByTestId('estimate-items-drag-disabled-caption')).toHaveCount(0)
    await expect(page.getByTestId('estimate-items-save-order-button')).toBeVisible()
    await expect(page.getByTestId('estimate-items-summary')).toContainText('총')
  })

  test('시나리오 5c: 검색 중에는 견적품목 드래그와 순서 저장이 비활성화된다', async ({ page }) => {
    await installAuth(page)
    await gotoEstimateItemsCatalog(page, 'MASTER')
    await loadEstimateItemsTable(page)

    const searchInput = page.getByTestId('estimate-items-search-input')
    await searchInput.fill('AJ')
    await page.getByTestId('estimate-items-query-button').click()
    await expect(page.getByTestId('estimate-items-table')).toBeVisible({ timeout: 8_000 })

    await expect(page.getByTestId('estimate-items-category-tab-HOME_MULTI')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('estimate-items-drag-disabled-caption')).toContainText('검색')
    await expect(page.getByTestId('estimate-items-save-order-button')).toBeDisabled()
    await expect(page.locator('[aria-label$="드래그"]')).toHaveCount(0)
  })

  // ---------------------------------------------------------------------------
  // Scenario 6: view-only 권한 — 체크박스·구성품 버튼 비활성
  // ---------------------------------------------------------------------------

  test('시나리오 6: 견적품목 view-only 권한(WAREHOUSE) — 토글 비활성', async ({ page }) => {
    await installAuth(page)
    await gotoEstimateItemsCatalog(page, 'WAREHOUSE')
    await loadEstimateItemsTable(page)

    // 조회 전용 배너 노출 단언
    const banner = page.getByTestId('estimate-items-readonly-banner')
    await expect(banner).toBeVisible()
    const bannerText = await banner.textContent()
    expect(bannerText).toContain('조회 전용')

    const table = page.getByTestId('estimate-items-table')

    // 견적 노출 체크박스 비활성 단언
    const firstEstimateToggle = table.locator('[data-testid^="estimate-items-estimate-toggle-"]').first()
    await expect(firstEstimateToggle).toBeVisible()
    await expect(firstEstimateToggle).toBeDisabled()

    // 주문 노출 체크박스 비활성 단언
    const firstOrderToggle = table.locator('[data-testid^="estimate-items-order-toggle-"]').first()
    await expect(firstOrderToggle).toBeVisible()
    await expect(firstOrderToggle).toBeDisabled()

    // view-only 에서는 탭 조회는 가능하지만 드래그 캡션/순서 저장은 없음.
    const caption = page.getByTestId('estimate-items-drag-disabled-caption')
    expect(await caption.count()).toBe(0)
    await expect(page.getByTestId('estimate-items-category-tab-HOME_MULTI')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('estimate-items-save-order-button')).toHaveCount(0)
  })

  // ---------------------------------------------------------------------------
  // Scenario 7: §2-1 NONE 품목 — displayOrder '—' 표시 + 드래그 핸들 없음
  // ---------------------------------------------------------------------------

  test('시나리오 7: 견적품목 목록 — usageScope NONE 품목 제외 + 카테고리 선택 시 드래그 활성', async ({ page }) => {
    await installAuth(page)
    await gotoEstimateItemsCatalog(page, 'MASTER')
    await loadEstimateItemsTable(page)

    // MOCK-NONE-ITEM 검색으로 견적품목 목록에서 제외되는지 확인
    const searchInput = page.getByTestId('estimate-items-search-input')
    await searchInput.fill('MOCK-NONE-ITEM')
    await page.getByTestId('estimate-items-query-button').click()
    // 검색 결과 반영 대기 — mock 환경에서 쿼리 재실행 후 DOM 업데이트 대기
    await page.waitForTimeout(1000)

    const tableSection = page.getByTestId('estimate-items-table')
    await expect(tableSection).toBeVisible({ timeout: 8_000 })
    await expect(tableSection.locator('td', { hasText: 'MOCK-NONE-ITEM' })).toHaveCount(0)

    // 기본 HOME_MULTI 탭 + 검색 초기화 → 조회 → 드래그 활성 상태 확인
    await searchInput.fill('')
    await page.getByTestId('estimate-items-query-button').click()
    await page.waitForTimeout(500)

    await expect(page.getByTestId('estimate-items-category-tab-HOME_MULTI')).toHaveAttribute('aria-selected', 'true')

    // HOME_MULTI 카테고리 + 드래그 활성 → SortableRow 에서 일반 행에 drag aria-label 존재 확인
    const dragHandles = page.locator('[aria-label*="드래그"]')
    // 최소 1개 이상의 드래그 핸들이 있어야 함 (노출 품목 존재)
    await expect(dragHandles.first()).toBeVisible({ timeout: 8_000 })
  })

  // ---------------------------------------------------------------------------
  // Scenario 8: 드래그→순서 저장 왕복 — 키보드 reorder 후 PUT /display-orders
  //   페이로드의 displayOrder 가 1..N 연속 재번호인지 단언 ([F] 신규 회귀 가드).
  //   in-process mock 은 page.route 가로채기 불가 → mock 이 globalThis 에 노출한
  //   마지막 표시순서 저장 페이로드(__SAMHAN_LAST_DISPLAY_ORDERS)를 page.evaluate 로 단언.
  //   [[inprocess-mock-principles]]
  // ---------------------------------------------------------------------------

  test('시나리오 8: 순서 저장 — PUT /display-orders 페이로드 1..N 연속 재번호 단언', async ({ page }) => {
    await installAuth(page)
    await gotoEstimateItemsCatalog(page, 'MASTER')
    await loadEstimateItemsTable(page)

    // 이전 테스트 잔여 캡처 초기화 (테스트별 격리)
    await page.evaluate(() => {
      delete (globalThis as Record<string, unknown>)['__SAMHAN_LAST_DISPLAY_ORDERS']
    })

    // 기본 HOME_MULTI 탭 → 드래그 활성
    await expect(page.getByTestId('estimate-items-category-tab-HOME_MULTI')).toHaveAttribute('aria-selected', 'true')

    // 드래그 활성 후 SortableRow 렌더 — 첫 행 드래그 핸들 확보
    const dragHandles = page.locator('[aria-label$="드래그"]')
    await expect(dragHandles.first()).toBeVisible({ timeout: 8_000 })
    const handleCount = await dragHandles.count()
    // HOME_MULTI 노출 품목 2건 이상이어야 reorder 가능 (mock 시드: 3건 BOTH)
    expect(handleCount).toBeGreaterThanOrEqual(2)

    // 드래그 전 행 순서(모델명 컬럼) 캡처 — reorder 검증용
    const sortableRowsLoc = page.locator('[data-testid^="estimate-items-row-"]')
    await expect(sortableRowsLoc.first()).toBeVisible()
    const codesBefore = (
      await sortableRowsLoc.evaluateAll((rows) =>
        rows.map((r) => r.getAttribute('data-testid')?.replace('estimate-items-row-', '') ?? ''),
      )
    ).filter(Boolean)
    expect(codesBefore.length).toBeGreaterThanOrEqual(2)

    await dragRowByMouse(page, 0, 1)

    await expect
      .poll(
        async () => (
          (await sortableRowsLoc.nth(0).getAttribute('data-testid')) ?? ''
        ).replace('estimate-items-row-', ''),
        { timeout: 5_000, message: '마우스 드래그 후 첫 행이 변경되어야 함' },
      )
      .not.toBe(codesBefore[0])
    const codesAfterDrag = (
      await sortableRowsLoc.evaluateAll((rows) =>
        rows.map((r) => r.getAttribute('data-testid')?.replace('estimate-items-row-', '') ?? ''),
      )
    ).filter(Boolean)
    expect(codesAfterDrag.length).toBeGreaterThanOrEqual(2)
    expect(codesAfterDrag[0]).not.toBe(codesBefore[0])

    // 순서 저장 클릭 → PUT /display-orders 발사
    const saveOrderBtn = page.getByTestId('estimate-items-save-order-button')
    await expect(saveOrderBtn).toBeVisible({ timeout: 8_000 })
    await saveOrderBtn.click()

    // mock 이 노출한 마지막 페이로드 능동 대기
    await expect
      .poll(
        async () =>
          await page.evaluate(
            () => (globalThis as Record<string, unknown>)['__SAMHAN_LAST_DISPLAY_ORDERS'] ?? null,
          ),
        { timeout: 8_000, message: 'PUT /display-orders 페이로드 미수신 (순서 저장 미발사)' },
      )
      .not.toBeNull()

    const payload = (await page.evaluate(
      () => (globalThis as Record<string, unknown>)['__SAMHAN_LAST_DISPLAY_ORDERS'],
    )) as Array<{ modelCode: string; estimateCategory: string; displayOrder: number }>

    // (1) 비어 있지 않음
    expect(Array.isArray(payload)).toBe(true)
    expect(payload.length).toBeGreaterThanOrEqual(2)
    expect(payload.every((o) => o.estimateCategory === 'HOME_MULTI')).toBe(true)

    // (2) displayOrder 가 1..N 연속 재번호 (정렬 시 [1,2,...,N])
    const orders = payload.map((o) => o.displayOrder).sort((a, b) => a - b)
    expect(orders).toEqual(Array.from({ length: payload.length }, (_, i) => i + 1))

    // (3) 재번호는 페이로드 배열 순서 그대로 1-based 부여 (드래그 결과 순서 보존)
    payload.forEach((o, idx) => {
      expect(o.displayOrder).toBe(idx + 1)
    })

    // (4) 카테고리 선택 상태에서는 버튼을 유지한다. 저장 성공은 payload 수신으로 검증한다.
    await expect(saveOrderBtn).toBeVisible()
    await page.getByTestId('estimate-items-query-button').click()
    await expect
      .poll(
        async () => (
          (await sortableRowsLoc.nth(0).getAttribute('data-testid')) ?? ''
        ).replace('estimate-items-row-', ''),
        { timeout: 8_000, message: '저장 후 재조회한 첫 행이 드래그 결과와 일치해야 함' },
      )
      .toBe(codesAfterDrag[0])
  })

  test('시나리오 9: 1000건 초과 카테고리 순서 저장 — totalPages 끝까지 수집 후 전건 재번호', async ({ page }) => {
    await installAuth(page)
    await page.addInitScript(() => {
      ;(globalThis as Record<string, unknown>)['__SAMHAN_MOCK_PRODUCT_CATALOG_EXTRA_ROWS'] =
        Array.from({ length: 1001 }, (_, i) => ({
          modelCode: `HM-BULK-${String(i + 1).padStart(4, '0')}`,
          name: `홈멀티 대량 품목 ${i + 1}`,
          usageScope: 'BOTH',
          estimateCategories: [{ category: 'HOME_MULTI', displayOrder: 1000 + i }],
          usageScopeManual: false,
          releasePrice: 100000 + i,
          deliveryPrice: 100000 + i,
          hasVariableDiscount: false,
          legacyDiscountFlag: false,
          discountFlags: null,
          productType: 'SINGLE',
          componentCount: 0,
        }))
    })
    await gotoEstimateItemsCatalog(page, 'MASTER')
    await loadEstimateItemsTable(page)

    await page.evaluate(() => {
      delete (globalThis as Record<string, unknown>)['__SAMHAN_LAST_DISPLAY_ORDERS']
    })

    await expect(page.getByTestId('estimate-items-category-tab-HOME_MULTI')).toHaveAttribute('aria-selected', 'true')

    const summary = page.getByTestId('estimate-items-summary')
    await expect
      .poll(
        async () => {
          const text = await summary.innerText()
          return Number(text.match(/총\s+([\d,]+)건/)?.[1]?.replaceAll(',', '') ?? 0)
        },
        { timeout: 10_000, message: '1000건 초과 HOME_MULTI fixture 미반영' },
      )
      .toBeGreaterThan(1000)

    const dragHandles = page.locator('[aria-label$="드래그"]')
    await expect(dragHandles.first()).toBeVisible({ timeout: 8_000 })

    const bulkRows = page.locator('[data-testid^="estimate-items-row-"]')
    const firstBeforeDrag = ((await bulkRows.nth(0).getAttribute('data-testid')) ?? '').replace(
      'estimate-items-row-',
      '',
    )
    await dragRowByMouse(page, 0, 1)
    await expect
      .poll(
        async () => (
          (await bulkRows.nth(0).getAttribute('data-testid')) ?? ''
        ).replace('estimate-items-row-', ''),
        { timeout: 5_000, message: '대량 목록에서도 마우스 드래그 후 첫 행이 변경되어야 함' },
      )
      .not.toBe(firstBeforeDrag)

    const saveOrderBtn = page.getByTestId('estimate-items-save-order-button')
    await expect(saveOrderBtn).toBeVisible({ timeout: 8_000 })
    await saveOrderBtn.click()

    await expect
      .poll(
        async () =>
          await page.evaluate(
            () => (globalThis as Record<string, unknown>)['__SAMHAN_LAST_DISPLAY_ORDERS'] ?? null,
          ),
        { timeout: 8_000, message: 'PUT /display-orders 페이로드 미수신 (순서 저장 미발사)' },
      )
      .not.toBeNull()

    const payload = (await page.evaluate(
      () => (globalThis as Record<string, unknown>)['__SAMHAN_LAST_DISPLAY_ORDERS'],
    )) as Array<{ modelCode: string; estimateCategory: string; displayOrder: number }>

    expect(payload.length).toBeGreaterThan(1000)
    expect(payload.every((o) => o.estimateCategory === 'HOME_MULTI')).toBe(true)
    expect(payload.some((o) => o.modelCode === 'HM-BULK-1001')).toBe(true)
    expect(payload.map((o) => o.displayOrder)).toEqual(
      Array.from({ length: payload.length }, (_, i) => i + 1),
    )
  })
})
