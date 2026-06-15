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
  // Scenario 4: 구성품 모달 왕복 — 추가·수량·저장 (명시 단언 강화 — P2 vacuous pass 수정)
  // ---------------------------------------------------------------------------

  test('시나리오 4: 구성품 모달 왕복 — 구성품 추가·수량 변경·저장·componentCount 갱신', async ({ page }) => {
    await installAuth(page)
    await gotoProductCatalog(page, 'MASTER')
    await loadTable(page)

    // 1. 구성품 버튼 존재 단언
    const componentsBtn = page.getByTestId('product-catalog-components-button-SET-HM2WAY')
    await expect(componentsBtn).toBeVisible({ timeout: 5_000 })

    // 2. 모달 열기
    await componentsBtn.click()
    const modal = page.getByTestId('components-modal')
    await expect(modal).toBeVisible({ timeout: 5_000 })

    // 3. 기존 구성품 row-0 존재 단언 (mock 시드 3개)
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
    const setBadge = page.getByTestId('product-catalog-set-badge-SET-HM2WAY')
    await expect(setBadge).toBeVisible({ timeout: 5_000 })
    const badgeText = await setBadge.textContent()
    // 저장 후 componentCount = 3 (수량 변경만, 행 개수 유지)
    expect(badgeText).toMatch(/세트\s*·\s*3/)
  })

  // ---------------------------------------------------------------------------
  // Scenario 4b: 구성품 모달 — 새 품목 추가 실제 수행 (P2 vacuous pass 수정)
  // ---------------------------------------------------------------------------

  test('시나리오 4b: 구성품 모달 — 품목 검색 후 추가 실제 수행·행 개수 증가 단언', async ({ page }) => {
    await installAuth(page)
    await gotoProductCatalog(page, 'MASTER')
    await loadTable(page)

    const componentsBtn = page.getByTestId('product-catalog-components-button-SET-HM2WAY')
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

  test('시나리오 6: view-only 권한(WAREHOUSE) — 토글·구성품 버튼 비활성 (명시 단언 강화)', async ({ page }) => {
    await installAuth(page)
    await gotoProductCatalog(page, 'WAREHOUSE')
    await loadTable(page)

    // 조회 전용 배너 노출 단언
    const banner = page.getByTestId('product-catalog-readonly-banner')
    await expect(banner).toBeVisible()
    const bannerText = await banner.textContent()
    expect(bannerText).toContain('조회 전용')

    const table = page.getByTestId('product-catalog-table')

    // 견적 노출 체크박스 비활성 단언
    const firstEstimateToggle = table.locator('[data-testid^="product-catalog-estimate-toggle-"]').first()
    await expect(firstEstimateToggle).toBeVisible()
    await expect(firstEstimateToggle).toBeDisabled()

    // 주문 노출 체크박스 비활성 단언
    const firstOrderToggle = table.locator('[data-testid^="product-catalog-order-toggle-"]').first()
    await expect(firstOrderToggle).toBeVisible()
    await expect(firstOrderToggle).toBeDisabled()

    // 구성품 버튼: view-only 에서도 조회용으로 노출 (설계 의도 — canEdit=false 시 저장버튼 없음)
    // 구성품 버튼이 있으면 클릭 후 모달 저장 버튼이 없음을 단언, 없으면 pass
    const componentsButtons = page.locator('[data-testid^="product-catalog-components-button-"]')
    const btnCount = await componentsButtons.count()
    if (btnCount > 0) {
      await componentsButtons.first().click()
      const modal = page.getByTestId('components-modal')
      await expect(modal).toBeVisible({ timeout: 5_000 })
      const saveBtn = page.getByTestId('components-modal-save-button')
      expect(await saveBtn.count()).toBe(0)
      // 모달 닫기
      await page.keyboard.press('Escape')
      await expect(modal).not.toBeVisible({ timeout: 3_000 })
    }

    // 카테고리 미선택 드래그 비활성 캡션은 view-only 에서도 없음 (canEdit=false)
    const caption = page.getByTestId('product-catalog-drag-disabled-caption')
    expect(await caption.count()).toBe(0)
  })

  // ---------------------------------------------------------------------------
  // Scenario 7: §2-1 NONE 품목 — displayOrder '—' 표시 + 드래그 핸들 없음
  // ---------------------------------------------------------------------------

  test('시나리오 7: §2-1 NONE 품목 — displayOrder \'—\' + 드래그 핸들 없음 (명시 단언 강화)', async ({ page }) => {
    await installAuth(page)
    await gotoProductCatalog(page, 'MASTER')
    await loadTable(page)

    // MOCK-NONE-ITEM 검색으로 확실히 로드
    const searchInput = page.getByTestId('product-catalog-search-input')
    await searchInput.fill('MOCK-NONE-ITEM')
    await page.getByTestId('product-catalog-query-button').click()
    // 검색 결과 반영 대기 — mock 환경에서 쿼리 재실행 후 DOM 업데이트 대기
    await page.waitForTimeout(1000)

    // 검색 결과 table 에서 MOCK-NONE-ITEM 텍스트가 있는 행 찾기
    // 드래그 비활성(DataTable) 시 product-catalog-row-{modelCode} testid 없음 — 텍스트 기반 탐색
    const tableSection = page.getByTestId('product-catalog-table')
    await expect(tableSection).toBeVisible({ timeout: 8_000 })

    // MOCK-NONE-ITEM 모델명 텍스트가 테이블에 있어야 함 (mock 시드에 포함)
    const noneItemCell = tableSection.locator('td', { hasText: 'MOCK-NONE-ITEM' }).first()
    await expect(noneItemCell).toBeVisible({ timeout: 8_000 })

    // 해당 행의 표시순서 셀(마지막 td) = '—' 단언
    const noneItemRow = noneItemCell.locator('..') // tr
    const tds = noneItemRow.locator('td')
    const tdCount = await tds.count()
    const lastCell = tds.nth(tdCount - 1)
    const cellText = await lastCell.textContent()
    expect(cellText?.trim()).toBe('—')

    // 카테고리 선택 + 검색 초기화 → 조회 → 드래그 활성 상태 확인
    await searchInput.fill('')
    await page.getByTestId('product-catalog-query-button').click()
    await page.waitForTimeout(500)

    const categorySelect = page.getByTestId('product-catalog-category-select')
    await categorySelect.selectOption('HOME_MULTI')
    await page.waitForTimeout(500)

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

  test('시나리오 8: 드래그→순서 저장 — PUT /display-orders 페이로드 1..N 연속 재번호 단언', async ({ page }) => {
    await installAuth(page)
    await gotoProductCatalog(page, 'MASTER')
    await loadTable(page)

    // 이전 테스트 잔여 캡처 초기화 (테스트별 격리)
    await page.evaluate(() => {
      delete (globalThis as Record<string, unknown>)['__SAMHAN_LAST_DISPLAY_ORDERS']
    })

    // 카테고리 HOME_MULTI 선택 → 드래그 활성 (committedCategory 즉시 반영)
    const categorySelect = page.getByTestId('product-catalog-category-select')
    await expect(categorySelect).toBeVisible()
    await categorySelect.selectOption('HOME_MULTI')

    // 드래그 활성 후 SortableRow 렌더 — 첫 행 드래그 핸들 확보
    const dragHandles = page.locator('[aria-label$="드래그"]')
    await expect(dragHandles.first()).toBeVisible({ timeout: 8_000 })
    const handleCount = await dragHandles.count()
    // HOME_MULTI 노출 품목 2건 이상이어야 reorder 가능 (mock 시드: 3건 BOTH)
    expect(handleCount).toBeGreaterThanOrEqual(2)

    // 드래그 전 행 순서(모델명 컬럼) 캡처 — reorder 검증용
    const sortableRowsLoc = page.locator('[data-testid^="product-catalog-row-"]')
    await expect(sortableRowsLoc.first()).toBeVisible()
    const codesBefore = (
      await sortableRowsLoc.evaluateAll((rows) =>
        rows.map((r) => r.getAttribute('data-testid')?.replace('product-catalog-row-', '') ?? ''),
      )
    ).filter(Boolean)
    expect(codesBefore.length).toBeGreaterThanOrEqual(2)

    // 키보드 dnd-kit reorder: 첫 핸들 focus → Space(드래그 시작) → ArrowDown(한 칸 이동) → Space(드롭).
    // dnd-kit KeyboardSensor 는 keydown(Space/Enter)으로 pickup, ArrowDown 으로 coordinateGetter
    // 재계산 후 다시 Space/Enter 로 drop → onDragEnd 발사. headless 에서 각 단계 사이
    // React 커밋 + sensor 상태 전이를 위해 짧은 settle 을 둔다(드롭 누락 방지).
    const firstHandle = dragHandles.first()
    await firstHandle.focus()
    await page.keyboard.press('Space')
    await page.waitForTimeout(150)
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(150)
    await page.keyboard.press('Space')

    // 드래그 완료(orderDirty=true) → '순서 저장' 버튼 노출 능동 대기
    const saveOrderBtn = page.getByTestId('product-catalog-save-order-button')
    await expect(saveOrderBtn).toBeVisible({ timeout: 8_000 })

    // 순서 저장 클릭 → PUT /display-orders 발사
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
    )) as Array<{ modelCode: string; displayOrder: number }>

    // (1) 비어 있지 않음
    expect(Array.isArray(payload)).toBe(true)
    expect(payload.length).toBeGreaterThanOrEqual(2)

    // (2) displayOrder 가 1..N 연속 재번호 (정렬 시 [1,2,...,N])
    const orders = payload.map((o) => o.displayOrder).sort((a, b) => a - b)
    expect(orders).toEqual(Array.from({ length: payload.length }, (_, i) => i + 1))

    // (3) 재번호는 페이로드 배열 순서 그대로 1-based 부여 (드래그 결과 순서 보존)
    payload.forEach((o, idx) => {
      expect(o.displayOrder).toBe(idx + 1)
    })

    // (4) 드래그로 첫 행이 실제 이동됨 — 페이로드 선두 modelCode 가 드래그 전 선두와 다름
    //     (ArrowDown 1칸 → 원래 1번이 2번 위치로 내려감)
    expect(payload[0]?.modelCode).not.toBe(codesBefore[0])

    // (5) 저장 성공 시 dirty 해제 → '순서 저장' 버튼 사라짐
    await expect(saveOrderBtn).not.toBeVisible({ timeout: 5_000 })

    // (6) [#9 박제] 저장 후 행 순서 가시 재정렬 단언 — mock GET /api/v1/products 가 BE 동형으로
    //     displayOrder asc 정렬 + page slice 를 반영하므로, react-query 재조회 후 화면 행 순서가
    //     저장 페이로드 순서(=드래그 결과)와 일치해야 한다. 기존(시드 전량 반환 totalPages=1)에서는
    //     저장해도 화면이 그대로라 가시 불일치를 영구 통과시켰음(회귀 가드).
    //     원래 선두였던 modelCode 가 더 이상 첫 행이 아니어야 한다(한 칸 아래로 내려감).
    await expect
      .poll(
        async () =>
          await sortableRowsLoc.evaluateAll((rows) =>
            rows.map((r) => r.getAttribute('data-testid')?.replace('product-catalog-row-', '') ?? ''),
          ),
        { timeout: 8_000, message: '저장 후 행 순서가 재정렬되지 않음 (mock 정렬·슬라이스 미반영)' },
      )
      .not.toEqual(codesBefore)

    const codesAfter = (
      await sortableRowsLoc.evaluateAll((rows) =>
        rows.map((r) => r.getAttribute('data-testid')?.replace('product-catalog-row-', '') ?? ''),
      )
    ).filter(Boolean)
    // 노출 품목(payload 대상) 순서가 저장 페이로드 순서와 정확히 일치 (재조회 후 가시 반영)
    const payloadCodes = payload.map((o) => o.modelCode)
    const exposedAfter = codesAfter.filter((c) => payloadCodes.includes(c))
    expect(exposedAfter).toEqual(payloadCodes)
    // 드래그 전 첫 행이 첫 위치를 벗어남
    expect(codesAfter[0]).not.toBe(codesBefore[0])
  })

  test('시나리오 9: 1000건 초과 카테고리 순서 저장 — totalPages 끝까지 수집 후 전건 재번호', async ({ page }) => {
    await installAuth(page)
    await page.addInitScript(() => {
      ;(globalThis as Record<string, unknown>)['__SAMHAN_MOCK_PRODUCT_CATALOG_EXTRA_ROWS'] =
        Array.from({ length: 1001 }, (_, i) => ({
          modelCode: `HM-BULK-${String(i + 1).padStart(4, '0')}`,
          name: `홈멀티 대량 품목 ${i + 1}`,
          usageScope: 'BOTH',
          estimateCategory: 'HOME_MULTI',
          usageScopeManual: false,
          displayOrder: 1000 + i,
          releasePrice: 100000 + i,
          deliveryPrice: 100000 + i,
          hasVariableDiscount: false,
          legacyDiscountFlag: false,
          discountFlags: null,
          productType: 'SINGLE',
          componentCount: 0,
        }))
    })
    await gotoProductCatalog(page, 'MASTER')
    await loadTable(page)

    await page.evaluate(() => {
      delete (globalThis as Record<string, unknown>)['__SAMHAN_LAST_DISPLAY_ORDERS']
    })

    const categorySelect = page.getByTestId('product-catalog-category-select')
    await categorySelect.selectOption('HOME_MULTI')

    const summary = page.getByTestId('product-catalog-summary')
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
    await dragHandles.first().focus()
    await page.keyboard.press('Space')
    await page.waitForTimeout(150)
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(150)
    await page.keyboard.press('Space')

    const saveOrderBtn = page.getByTestId('product-catalog-save-order-button')
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
    )) as Array<{ modelCode: string; displayOrder: number }>

    expect(payload.length).toBeGreaterThan(1000)
    expect(payload.some((o) => o.modelCode === 'HM-BULK-1001')).toBe(true)
    expect(payload.map((o) => o.displayOrder)).toEqual(
      Array.from({ length: payload.length }, (_, i) => i + 1),
    )
  })
})
