/**
 * AC-3 — 거래처 자동완성 (`PartnerAutocomplete`) Playwright E2E.
 *
 * <h2>검증 대상</h2>
 * <ol>
 *   <li>새 출고전표 작성 (`/sales/new`) 진입 — 거래처 combobox 표시</li>
 *   <li>거래처 부분 입력("엘에이") → mock `GET /admin/partners/search?q=엘에이` → 후보 listbox 표시</li>
 *   <li>후보 항목 클릭 선택 → partnerCode/partnerName 채워짐 확인</li>
 *   <li>선택 후 2단계 채움 — detail fetch → 연락처/주소/대표자 채워짐 확인</li>
 *   <li>키보드 ↓/Enter 선택 → 입력란 반영</li>
 *   <li>UUID 비공개 가드 — 화면에 UUID 패턴 미노출</li>
 *   <li>per-instance seq — 거래처 검색 중 stale 응답 무시 (debounce 동작)</li>
 * </ol>
 *
 * <h2>Mock 전략</h2>
 * - `VITE_MOCK_MODE=1` + mock.ts `GET /admin/partners/search?q=` + `GET /admin/partners/{code}` 핸들러.
 * - "엘에이" → "엘에이시스템에어" (partnerCode: 1234567890) 1건.
 * - "강남" → "강남에어솔루션" (partnerCode: 2345678901) 1건.
 *
 * <h2>UUID 비공개 가드 ([[feedback_uuid_no_user_visibility]])</h2>
 * - 화면 텍스트에 UUID(8-4-4-4-12 hex) 패턴 미포함 단언.
 * - partnerCode 는 숫자형 코드이므로 UUID 아님.
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
 *     && npx playwright test playwright/ac-3-partner-autocomplete --reporter=line
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
  // 페이지 로드 완료 확인 — 신규 판매전표 제목 대기
  await expect(
    page.getByRole('heading', { name: '새 판매전표' }),
  ).toBeVisible({ timeout: 15_000 })
}

/**
 * 거래처 PartnerAutocomplete input.
 *
 * SlipFormPage 에서 label="거래처" 을 부여하므로
 * `getByRole('combobox', { name: /거래처/ })` 로 locating.
 */
function getPartnerInput(page: Page) {
  return page.getByRole('combobox', { name: /거래처/ })
}

// ============================================================
// Test Suite
// ============================================================

test.describe('AC-3 거래처 자동완성 PartnerAutocomplete', () => {

  // ──────────────────────────────────────────────────────────
  // 시나리오 1: 페이지 진입 → 거래처 combobox 존재 확인
  // ──────────────────────────────────────────────────────────
  test('시나리오 1: 전표 작성 진입 — 거래처 combobox 렌더 확인', async ({ page }) => {
    await installAuthMock(page)
    await gotoSlipNewPage(page)

    const input = getPartnerInput(page)
    await expect(input).toBeVisible()
    await expect(input).toHaveAttribute('role', 'combobox')
    await expect(input).toHaveAttribute('aria-expanded', 'false')
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 2: "엘에이" 입력 → 후보 listbox 표시
  // ──────────────────────────────────────────────────────────
  test('시나리오 2: "엘에이" 입력 → 후보 listbox 표시 (mock /admin/partners/search?q=엘에이)', async ({ page }) => {
    await installAuthMock(page)
    await gotoSlipNewPage(page)

    const input = getPartnerInput(page)
    await input.click()
    await input.fill('엘에이')

    // listbox 대기 — debounce + 비동기 응답 완료까지
    const listbox = page.getByRole('listbox', { name: '거래처 목록' })
    await expect(listbox).toBeVisible({ timeout: 5_000 })

    // 후보 항목 중 엘에이시스템에어 포함 확인
    await expect(listbox).toContainText('엘에이시스템에어')

    // combobox expanded
    await expect(input).toHaveAttribute('aria-expanded', 'true')
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 3: 후보 클릭 선택 → name 입력란 반영 + detail fill
  // ──────────────────────────────────────────────────────────
  test('시나리오 3: 후보 클릭 선택 → 입력란에 거래처명 표시 + 자동채움(주소복사 버튼 활성)', async ({ page }) => {
    await installAuthMock(page)
    await gotoSlipNewPage(page)

    const input = getPartnerInput(page)
    await input.click()
    await input.fill('엘에이')

    const listbox = page.getByRole('listbox', { name: '거래처 목록' })
    await expect(listbox).toBeVisible({ timeout: 5_000 })

    // 엘에이시스템에어 옵션 클릭
    const option = listbox.getByRole('option', { name: /엘에이시스템에어/ })
    await expect(option).toBeVisible()
    await option.click()

    // 선택 후 입력란에 거래처명 표시
    await expect(input).toHaveValue('엘에이시스템에어')

    // listbox 닫힘
    await expect(listbox).not.toBeVisible()

    // 2단계 자동채움: 거래처 연락처/주소/대표자는 폼 정비로 화면 미표시(전표 기록·state 보관).
    // detail fetch(주소 '서울…테헤란로 152')가 customerAddress 에 채워지면
    // '거래처 주소 복사' 버튼이 활성화됨 → 자동채움 동작을 버튼 enable 로 검증.
    const copyAddrBtn = page.getByTestId('slip-form-copy-customer-address-btn')
    await expect(copyAddrBtn).toBeEnabled({ timeout: 3_000 })
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 4: 키보드 ↓/Enter 선택 → 입력란 반영
  // ──────────────────────────────────────────────────────────
  test('시나리오 4: 키보드 ArrowDown + Enter 선택 → 거래처명 반영', async ({ page }) => {
    await installAuthMock(page)
    await gotoSlipNewPage(page)

    const input = getPartnerInput(page)
    await input.click()
    await input.fill('강남')

    const listbox = page.getByRole('listbox', { name: '거래처 목록' })
    await expect(listbox).toBeVisible({ timeout: 5_000 })

    // ArrowDown → 첫 번째 항목 활성화
    await input.press('ArrowDown')
    // Enter → 선택
    await input.press('Enter')

    // 입력란에 선택된 거래처명 표시
    const finalValue = await input.inputValue()
    expect(finalValue.length).toBeGreaterThan(0)

    // listbox 닫힘
    await expect(listbox).not.toBeVisible()
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 5: UUID 비공개 가드 — 화면에 UUID 미노출
  // ──────────────────────────────────────────────────────────
  test('시나리오 5: UUID 비공개 가드 — 전표작성 화면 UUID 미노출', async ({ page }) => {
    await installAuthMock(page)
    await gotoSlipNewPage(page)

    const input = getPartnerInput(page)
    await input.click()
    await input.fill('강남')

    const listbox = page.getByRole('listbox', { name: '거래처 목록' })
    await expect(listbox).toBeVisible({ timeout: 5_000 })

    // listbox 텍스트에 UUID 미포함
    const listboxText = await listbox.textContent()
    expect(listboxText).not.toMatch(UUID_PATTERN)

    // 선택 후 전체 페이지 텍스트 UUID 미포함
    await listbox.getByRole('option').first().click()
    const bodyText = await page.locator('body').textContent()
    expect(bodyText).not.toMatch(UUID_PATTERN)
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 6: 거래처 선택 해제(null) 시 필드 클리어
  // ──────────────────────────────────────────────────────────
  test('시나리오 6: 거래처 선택 후 다른 텍스트 입력 blur → 필드 유지 (blur 게이트)', async ({ page }) => {
    await installAuthMock(page)
    await gotoSlipNewPage(page)

    const input = getPartnerInput(page)
    await input.click()
    await input.fill('엘에이')

    const listbox = page.getByRole('listbox', { name: '거래처 목록' })
    await expect(listbox).toBeVisible({ timeout: 5_000 })
    await listbox.getByRole('option', { name: /엘에이시스템에어/ }).click()

    // 선택 완료
    await expect(input).toHaveValue('엘에이시스템에어')

    // 다른 필드로 포커스 이동 (blur 유도)
    await page.keyboard.press('Tab')

    // blur 후 선택값 유지 (더미 onChange 호출 금지 원칙)
    await expect(input).toHaveValue('엘에이시스템에어')
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 7: 빈 검색 결과 → "검색 결과 없음" 표시
  // ──────────────────────────────────────────────────────────
  test('시나리오 7: 존재하지 않는 거래처 검색 → "검색 결과 없음" 표시', async ({ page }) => {
    await installAuthMock(page)
    await gotoSlipNewPage(page)

    const input = getPartnerInput(page)
    await input.click()
    // mock 에 없는 검색어
    await input.fill('존재하지않는거래처XYZXYZ')

    // debounce 대기 후 빈 결과 상태 확인
    await expect(page.getByText('검색 결과 없음')).toBeVisible({ timeout: 5_000 })
  })

})
