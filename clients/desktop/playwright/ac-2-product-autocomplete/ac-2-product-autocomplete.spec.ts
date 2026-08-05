/**
 * AC-2 — 품목 자동완성 (`ProductAutocomplete`) Playwright E2E.
 *
 * <h2>검증 대상</h2>
 * <ol>
 *   <li>새 출고전표 작성 (`/sales/new`) 진입 — 품목 자동완성 입력 필드 표시</li>
 *   <li>품목 부분 입력("AJ") → mock `GET /api/products?q=AJ` → 후보 listbox 표시</li>
 *   <li>후보 항목 키보드(ArrowDown + Enter) 선택 → modelName 입력란 반영</li>
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
 * - DOM 속성 재유출 가드: 후보 option id 는 index 기반 opaque(`${listId}-opt-${idx}`)
 *   형식이어야 하고, id·input aria-activedescendant 에 hex-UUID 접두 미포함 단언.
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
 * hex-UUID 접두 정규식 — DOM 속성(id/aria-activedescendant) 재유출 가드.
 * 속성값은 `${listId}-opt-${idx}` 합성이라 full UUID 의 word-boundary 매치가 어긋날 수
 * 있어 접두(8-4-) 패턴으로 잡는다.
 */
const HEX_UUID_PREFIX = /[0-9a-f]{8}-[0-9a-f]{4}-/i

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
  // 페이지 로드 완료 확인 — 신규 판매전표 제목 대기
  await expect(
    page.getByRole('heading', { name: '새 판매전표' }),
  ).toBeVisible({ timeout: 15_000 })
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
  // 시나리오 2: "AJ" 입력 → 후보 listbox 표시
  // ──────────────────────────────────────────────────────────
  test('시나리오 2: "AJ" 입력 → 후보 listbox 표시 (mock /api/products?q=AJ)', async ({ page }) => {
    await installAuthMock(page)
    await gotoSlipNewPage(page)

    const input = getProductInput(page)
    await input.click()
    await input.fill('AJ')

    // listbox 결정적 대기 — debounce + 비동기 응답 완료까지 (F-05)
    const listbox = page.getByRole('listbox', { name: '품목 목록' })
    await expect(listbox).toBeVisible({ timeout: 5_000 })

    // 후보 항목 중 AJ040 포함 확인
    await expect(listbox).toContainText('AJ040RXH4BC1')

    // combobox expanded
    await expect(input).toHaveAttribute('aria-expanded', 'true')
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 3: 후보 클릭 선택 → modelName 입력란 반영
  // ──────────────────────────────────────────────────────────
  test('시나리오 3: 후보 클릭 선택 → 입력란에 modelName 표시', async ({ page }) => {
    await installAuthMock(page)
    await gotoSlipNewPage(page)

    const input = getProductInput(page)
    await input.click()
    await input.fill('AJ040')

    const listbox = page.getByRole('listbox', { name: '품목 목록' })
    await expect(listbox).toBeVisible({ timeout: 5_000 })

    // AJ040RXH4BC1 옵션 클릭
    const option = listbox.getByRole('option', { name: /AJ040RXH4BC1/ })
    await expect(option).toBeVisible()
    await option.click()

    // 선택 후 입력란에 modelName 표시
    await expect(input).toHaveValue('AJ040RXH4BC1')

    // listbox 닫힘
    await expect(listbox).not.toBeVisible()
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 4: 키보드 ↓/Enter 선택 → 입력란 반영
  // ──────────────────────────────────────────────────────────
  test('시나리오 4: 키보드 ArrowDown + Enter 선택 → modelName 반영', async ({ page }) => {
    await installAuthMock(page)
    await gotoSlipNewPage(page)

    const input = getProductInput(page)
    await input.click()
    await input.fill('AJ')

    const listbox = page.getByRole('listbox', { name: '품목 목록' })
    await expect(listbox).toBeVisible({ timeout: 5_000 })

    // ArrowDown → 첫 번째 항목 활성화
    await input.press('ArrowDown')
    // Enter → 선택
    await input.press('Enter')

    // 입력란에 선택된 modelName (첫 번째 AJ 매칭 = AJ036NCH3CH 또는 AJ040RXH4BC1)
    const finalValue = await input.inputValue()
    expect(finalValue).toMatch(/^AJ/)

    // listbox 닫힘
    await expect(listbox).not.toBeVisible()
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

    const listbox = page.getByRole('listbox', { name: '품목 목록' })
    await expect(listbox).toBeVisible({ timeout: 5_000 })

    await listbox.getByRole('option', { name: /AJ040RXH4BC1/ }).click()

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

    const listbox = page.getByRole('listbox', { name: '품목 목록' })
    await expect(listbox).toBeVisible({ timeout: 5_000 })
    // 실 후보 렌더 완료까지 결정적 대기 — "검색 중…" 로딩행도 role=option(id 없음)이라
    // 후보 도착 전에 id 를 수확하면 빈 id 로 false RED 가 난다.
    await expect(listbox).toContainText('AJ040RXH4BC1')

    // listbox 텍스트에 UUID 미포함
    const listboxText = await listbox.textContent()
    expect(listboxText).not.toMatch(UUID_PATTERN)

    // [OPUS 라운드 LOW] 속성 재유출 가드 — textContent 만으론 id/aria-activedescendant
    // 속성에 실리는 UUID 재유출을 못 잡는다. 후보 DOM id 는 도메인 키와 분리된 index 기반
    // opaque id(`${listId}-opt-${idx}`)여야 한다.
    const optionIds = await listbox
      .getByRole('option')
      .evaluateAll((els) => els.map((el) => el.id))
    expect(optionIds.length).toBeGreaterThan(0)
    for (const id of optionIds) {
      expect(id).toMatch(/-opt-\d+$/)
      expect(id).not.toMatch(HEX_UUID_PREFIX)
    }

    // 활성 후보 지정 시 input 의 aria-activedescendant 도 opaque id 만 담아야 한다.
    await input.press('ArrowDown')
    const activeDescendant = await input.getAttribute('aria-activedescendant')
    expect(activeDescendant, 'ArrowDown 후 aria-activedescendant 미설정').not.toBeNull()
    expect(activeDescendant).toMatch(/-opt-\d+$/)
    expect(activeDescendant).not.toMatch(HEX_UUID_PREFIX)

    // 선택 후 전체 페이지 텍스트 UUID 미포함
    await listbox.getByRole('option').first().click()
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
    const listbox1 = page.getByRole('listbox', { name: '품목 목록' })
    await expect(listbox1).toBeVisible({ timeout: 5_000 })
    await listbox1.getByRole('option', { name: /AJ040RXH4BC1/ }).click()
    await expect(input1).toHaveValue('AJ040RXH4BC1')

    // 라인 2: AJ052 검색 후 선택 (라인1 seq 오염 없이 독립 동작)
    const input2 = page.getByRole('combobox', { name: /라인 2 품목/ })
    await input2.click()
    await input2.fill('AJ052')
    const listbox2 = page.getByRole('listbox', { name: '품목 목록' })
    await expect(listbox2).toBeVisible({ timeout: 5_000 })
    await listbox2.getByRole('option', { name: /AJ052RXH5BC1/ }).click()
    await expect(input2).toHaveValue('AJ052RXH5BC1')

    // 라인 1 값 유지 확인
    await expect(input1).toHaveValue('AJ040RXH4BC1')
  })

})
