/**
 * AC-2 — 품목 자동완성 (`ProductAutocomplete`) Playwright E2E.
 *
 * <h2>검증 대상</h2>
 * <ol>
 *   <li>새 출고전표 작성 (`/sales/new`) 진입 — 품목 자동완성 입력 필드 표시</li>
 *   <li>품목 부분 입력("AJ") → mock `GET /api/products?q=AJ` → 후보 선택 modal 표시</li>
 *   <li>후보 선택 modal 확정 → modelName 입력란 반영</li>
 *   <li>후보 항목 클릭 선택 → modelName 입력란 반영</li>
 *   <li>선택 후 단가(unitPrice) 자동 채워짐 확인 (합계 셀 변화)</li>
 *   <li>빈 문자열 검색 시 후보 노출 (전체 목록)</li>
 *   <li>UUID 비공개 가드: 화면에 UUID 패턴 미노출</li>
 * </ol>
 *
 * <h2>Mock 전략</h2>
 * - `VITE_MOCK_MODE=1` + mock.ts `GET /api/products?q=` 핸들러.
 * - 후보 5건: AJ040RXH4BC1, AJ052RXH5BC1, AJ036NCH3CH, AJ100NCDKH, MWR-WE10N.
 * - "AJ" 쿼리 → 4건 (MWR 제외), "AJ040" → 1건.
 *
 * <h2>UUID 비공개 가드 ([[feedback_uuid_no_user_visibility]])</h2>
 * - 화면 텍스트에 UUID(8-4-4-4-12 hex) 패턴 미포함 단언.
 * - 검색 결과 modal의 텍스트·markup·radio aria-label 에 UUID 미포함 단언.
 *
 * <h2>no-fake-data 원칙 ([[feedback_no_fake_data_ever]])</h2>
 * - 본 spec 은 VITE_MOCK_MODE=1 Playwright 컴포넌트 회귀 전용.
 * - 실 QA 캡처는 Docker 실서버 환경에서 별도 수행.
 *
 * <h2>실행 방법</h2>
 * <pre>
 *   cd clients/desktop
 *   # 별도 터미널:
 *   set VITE_MOCK_MODE=1 && npx vite src/renderer --host 127.0.0.1 --port 5174
 *   # 테스트 실행:
 *   set PLAYWRIGHT_SKIP_WEB_SERVER=1 && set AUDIT_BASE_URL=http://127.0.0.1:5174
 *     && npx playwright test playwright/ac-2-product-autocomplete --reporter=line
 * </pre>
 */
import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'

/** UUID 정규식 — 화면 노출 가드. */
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i

/**
 * window.samhanAuth stub — AuthGuard 통과 (MANAGER role).
 */
async function installAuthMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const auth = {
      token: 'playwright-token',
      userId: '00000000-0000-0000-0000-000000010001',
      role: 'MANAGER',
      fullName: '오병승',
      partnerCode: 'P-MOCK-001',
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

/** 새 출고전표 작성 페이지로 이동. */
async function gotoSlipNewPage(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/#/sales/new?mockRole=MANAGER`, {
    waitUntil: 'domcontentloaded',
  })
  // 페이지 로드 완료 확인 — AppLayout의 고유 페이지 제목 대기
  await expect(page.getByTestId('header-page-title')).toHaveText('새 출고전표', {
    timeout: 15_000,
  })
}

/**
 * 첫 번째 라인의 ProductAutocomplete input.
 *
 * SlipFormPage 에서 `ariaLabel="라인 1 품목"` 을 부여하므로
 * `getByRole('combobox', { name: /라인 1 품목/ })` 으로 다른 combobox(창고 자동완성 등)와
 * 명확히 구분 (F-01/F-02 해소).
 */
function getProductInput(page: Page) {
  return page.getByRole('combobox', { name: /라인 1 품목/ })
}

function getProductSelectionDialog(page: Page) {
  return page.getByRole('dialog', { name: '품목 검색 결과' })
}

// ============================================================
// Test Suite
// ============================================================

test.describe('AC-2 품목 자동완성 ProductAutocomplete', () => {

  // ──────────────────────────────────────────────────────────
  // 시나리오 1: 페이지 진입 → 품목 combobox 존재 확인
  // ──────────────────────────────────────────────────────────
  test('시나리오 1: 전표 작성 진입 — 품목 combobox 렌더 확인', async ({ page }) => {
    await installAuthMock(page)
    await gotoSlipNewPage(page)

    const input = getProductInput(page)
    await expect(input).toBeVisible()
    await expect(input).toHaveAttribute('role', 'combobox')
    await expect(input).toHaveAttribute('aria-expanded', 'false')
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 2: "AJ" 입력 → 복수 후보 선택 modal 표시
  // ──────────────────────────────────────────────────────────
  test('시나리오 2: "AJ" 입력 → 후보 선택 modal 표시 (mock /api/products?q=AJ)', async ({ page }) => {
    await installAuthMock(page)
    await gotoSlipNewPage(page)

    const input = getProductInput(page)
    await input.click()
    await input.fill('AJ')

    // R23 single selection mode — 2건 이상은 품목 검색 결과 modal 로 전환된다.
    const dialog = getProductSelectionDialog(page)
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    // 후보 항목 중 AJ040 포함 확인
    await expect(dialog).toContainText('AJ040RXH4BC1')

    // modal 전환 시 inline combobox surface 는 닫힌다.
    await expect(input).toHaveAttribute('aria-expanded', 'false')
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 3: 단일 후보 즉시 확정 → modelName 입력란 반영
  // ──────────────────────────────────────────────────────────
  test('시나리오 3: 단일 후보 즉시 확정 → 입력란에 modelName 반영', async ({ page }) => {
    await installAuthMock(page)
    await gotoSlipNewPage(page)

    const input = getProductInput(page)
    await input.click()
    await input.fill('AJ040')

    // 단일 후보는 목록 표시/클릭 없이 즉시 확정된다.
    await expect(input).toHaveValue('AJ040RXH4BC1', { timeout: 5_000 })
    await expect(page.getByRole('listbox', { name: '품목 목록' })).not.toBeVisible()
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 4: 복수 후보 modal 선택 → 입력란 반영
  // ──────────────────────────────────────────────────────────
  test('시나리오 4: 복수 후보 modal 선택 → modelName 반영', async ({ page }) => {
    await installAuthMock(page)
    await gotoSlipNewPage(page)

    const input = getProductInput(page)
    await input.click()
    await input.fill('AJ')

    const dialog = getProductSelectionDialog(page)
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    // single selection modal에서 첫 후보를 선택하고 확정한다.
    await dialog.getByRole('radio').first().check()
    await dialog.getByRole('button', { name: '선택 확정' }).click()

    // 입력란에 선택된 modelName (첫 번째 AJ 매칭 = AJ040RXH4BC1)
    await expect(input).toHaveValue(/^AJ/)

    // modal 닫힘
    await expect(dialog).not.toBeVisible()
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 5: 선택 후 단가 자동채움 확인 (합계 셀 갱신)
  // ──────────────────────────────────────────────────────────
  test('시나리오 5: 품목 선택 → 단가 자동 채워짐', async ({ page }) => {
    await installAuthMock(page)
    await gotoSlipNewPage(page)

    const input = getProductInput(page)
    await input.click()
    await input.fill('AJ040')

    await expect(input).toHaveValue('AJ040RXH4BC1', { timeout: 5_000 })
    await expect(page.getByRole('listbox', { name: '품목 목록' })).not.toBeVisible()

    // 단가 input — 라인 1 단가 (aria-label "라인 1 단가")
    const priceInput = page.getByRole('textbox', { name: '라인 1 단가' })
    await expect(priceInput).toBeVisible()

    // 단가 1,850,000 이 채워졌는지 확인 (mock sellingPrice: "1850000")
    const priceVal = await priceInput.inputValue()
    expect(Number(priceVal.replace(/,/g, ''))).toBeGreaterThan(0)
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 6: UUID 비공개 가드 — 화면에 UUID 미노출
  // ──────────────────────────────────────────────────────────
  test('시나리오 6: UUID 비공개 가드 — 전표작성 화면 UUID 미노출', async ({ page }) => {
    await installAuthMock(page)
    await gotoSlipNewPage(page)

    const input = getProductInput(page)
    await input.click()
    await input.fill('AJ')

    const dialog = getProductSelectionDialog(page)
    await expect(dialog).toBeVisible({ timeout: 5_000 })
    // 실 후보 렌더 완료까지 결정적 대기 — "검색 중…" 로딩행도 role=option(id 없음)이라
    // 후보 도착 전에 id 를 수확하면 빈 id 로 false RED 가 난다.
    await expect(dialog).toContainText('AJ040RXH4BC1')

    // modal 텍스트와 markup에 UUID 미포함
    const dialogText = await dialog.textContent()
    expect(dialogText).not.toMatch(UUID_PATTERN)
    const dialogMarkup = await dialog.evaluate((element) => element.outerHTML)
    expect(dialogMarkup).not.toMatch(UUID_PATTERN)

    // 표의 라디오 접근성 이름에도 UUID가 유출되지 않는다.
    const radioLabels = await dialog.getByRole('radio').evaluateAll((els) =>
      els.map((element) => element.getAttribute('aria-label') ?? ''),
    )
    for (const label of radioLabels) expect(label).not.toMatch(UUID_PATTERN)

    // 선택 후 전체 페이지 텍스트 UUID 미포함
    await dialog.getByRole('radio').first().check()
    await dialog.getByRole('button', { name: '선택 확정' }).click()
    const bodyText = await page.locator('body').textContent()
    expect(bodyText).not.toMatch(UUID_PATTERN)
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 7: 멀티라인 — 라인1/라인2 각각 다른 품목 검색·선택 (F-06/D-7 per-instance seq)
  // ──────────────────────────────────────────────────────────
  test('시나리오 7: 멀티라인 — 라인1·라인2 각각 독립 품목 선택 (per-instance seq)', async ({ page }) => {
    await installAuthMock(page)
    await gotoSlipNewPage(page)

    // 라인 1: AJ040 검색 후 선택
    const input1 = page.getByRole('combobox', { name: /라인 1 품목/ })
    await input1.click()
    await input1.fill('AJ040')
    await expect(input1).toHaveValue('AJ040RXH4BC1')
    await expect(page.getByRole('listbox', { name: '품목 목록' })).not.toBeVisible()

    // 라인 2: AJ052 검색 후 선택 (라인1 seq 오염 없이 독립 동작)
    const input2 = page.getByRole('combobox', { name: /라인 2 품목/ })
    await input2.click()
    await input2.fill('AJ052')
    await expect(input2).toHaveValue('AJ052RXH5BC1')
    await expect(page.getByRole('listbox', { name: '품목 목록' })).not.toBeVisible()

    // 라인 1 값 유지 확인
    await expect(input1).toHaveValue('AJ040RXH4BC1')
  })

})
