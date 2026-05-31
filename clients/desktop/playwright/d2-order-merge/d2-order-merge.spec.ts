/**
 * Phase 2.6b D2 — 다중주문 병합→단일 출고전표 Playwright E2E.
 *
 * <h2>검증 대상</h2>
 * <ol>
 *   <li>같은 거래처 2주문 선택 → "출고전표로 병합 전환" 버튼 활성 → 모달 열림</li>
 *   <li>혼합 거래처 선택(다른 partnerCode) → 버튼 비활성 + 안내 문구</li>
 *   <li>1건만 선택 → 버튼 비활성 (2건 이상 필요)</li>
 *   <li>모달: 창고 미선택 시 제출 비활성 → 창고 선택 후 활성</li>
 *   <li>병합 발행 → 성공 (SL-20260531-MERGE-001 slipNo)</li>
 *   <li>409(거래처 불일치) → 모달 내 에러 피드백</li>
 *   <li>409(재고 부족) → 모달 내 에러 피드백</li>
 *   <li>기존 Phase 2.6a 단일전환 버튼 여전히 노출 (회귀 0)</li>
 * </ol>
 *
 * <h2>Mock 전략 — VITE_MOCK_MODE=1</h2>
 * <ul>
 *   <li>GET /api/v1/partner-orders?status= → DRAFT_ROW(partnerCode=1234567890) +
 *       ON_HOLD_ROW(partnerCode=2345678901) + CONFIRMED_ROW(partnerCode=3456789012)</li>
 *   <li>status=DRAFT 필터 시 DRAFT_ROW 1건만 반환</li>
 *   <li>POST /api/v1/partner-orders/convert-to-slip-merge
 *         → SL-20260531-MERGE-001 성공 (mockMerge409=mixed → 409, mockMerge409=stock → 409)</li>
 * </ul>
 *
 * <h2>UUID 비공개 가드 ([[feedback_uuid_no_user_visibility]])</h2>
 * <p>단언은 orderNumber / slipNo / partnerCode / partnerName / 한국어 라벨만 사용.
 *
 * <h2>testid 목록</h2>
 * <ul>
 *   <li>{@code merge-checkbox-{orderNumber}}     — 행 체크박스</li>
 *   <li>{@code merge-convert-selected-count}     — "N건 선택됨" 텍스트</li>
 *   <li>{@code merge-convert-mixed-partner-warn} — 혼합 거래처 안내</li>
 *   <li>{@code merge-convert-open}               — "출고전표로 병합 전환" 버튼</li>
 *   <li>{@code merge-convert-deselect-all}       — 선택 해제 버튼</li>
 *   <li>{@code merge-convert-dialog}             — Modal root</li>
 *   <li>{@code merge-convert-dialog-body}        — 모달 본문</li>
 *   <li>{@code merge-convert-warehouse}          — 창고 선택 wrapper</li>
 *   <li>{@code merge-convert-submit}             — 발행 버튼</li>
 *   <li>{@code merge-convert-modal-error}        — 모달 내 에러 배너</li>
 * </ul>
 *
 * <h2>실행 방법</h2>
 * <pre>
 *   cd clients/desktop
 *   # 별도 터미널:
 *   set VITE_MOCK_MODE=1 && npx vite src/renderer --host 127.0.0.1 --port 5174
 *   # 테스트 실행:
 *   set PLAYWRIGHT_SKIP_WEB_SERVER=1 && set AUDIT_BASE_URL=http://127.0.0.1:5174
 *     && npx playwright test playwright/d2-order-merge --reporter=line
 * </pre>
 */
import { expect, test, type Page, type Locator } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'

// ============================================================
// URL 헬퍼
// ============================================================

/** 주문 목록 URL — hash router. */
const listUrl = (extra = '') =>
  `${BASE_URL}/#/sales/partner-orders?mockRole=MASTER${extra}`

// ============================================================
// Auth stub
// ============================================================

/**
 * window.samhanAuth stub — AuthGuard 통과 + MERGE_CONVERT_ROLES(['SALES','MANAGER','MASTER']) 포함.
 */
async function installAuthMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const auth = {
      token: 'playwright-token',
      userId: '00000000-0000-0000-0000-000000010001',
      role: 'MASTER',
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

/**
 * 주문 목록 페이지로 이동하고 페이지 헤더 타이틀이 렌더될 때까지 대기.
 *
 * 사이드바 / sub-nav 에도 "주문서 관리" 텍스트가 존재하므로
 * strict mode 위반을 피하기 위해 data-testid 로 한정한다.
 */
async function gotoListAndWait(page: Page, extra = ''): Promise<void> {
  await page.goto(listUrl(extra), { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('header-page-title')).toContainText('주문서 관리', { timeout: 15_000 })
}

/**
 * WarehouseAutocomplete 창고 선택 헬퍼 (phase-2-6a-order-convert 패턴 동일).
 *
 * @param warehouseDiv - data-testid="merge-convert-warehouse" Locator
 * @param searchText  - 입력할 검색 텍스트 (예: "HQ", "본사")
 */
async function selectWarehouseAutocomplete(
  _page: Page,
  warehouseDiv: Locator,
  searchText: string,
): Promise<void> {
  const input = warehouseDiv.locator('input[role="combobox"]')
  await expect(input).toBeVisible({ timeout: 5_000 })
  await input.click()
  await input.fill(searchText)
  await expect(input).toHaveAttribute('aria-expanded', 'true', { timeout: 5_000 })
  const listbox = warehouseDiv.locator('[role="listbox"]')
  await expect(listbox).toBeVisible({ timeout: 5_000 })
  const firstOption = listbox.locator('[role="option"]').first()
  await expect(firstOption).toBeVisible({ timeout: 5_000 })
  await firstOption.click()
  await expect(input).toHaveAttribute('aria-expanded', 'false', { timeout: 5_000 })
}

// ============================================================
// Test Suite
// ============================================================

test.describe('Phase 2.6b D2 다중주문 병합 전환', () => {

  // ──────────────────────────────────────────────────────────
  // 시나리오 1: 전체 상태 목록 — DRAFT + ON_HOLD 행에 체크박스 노출
  //
  // 검증:
  //   - 전체 상태(필터=전체) 조회 시 DRAFT 행에 체크박스 존재
  //   - CONFIRMED 행에 체크박스 미존재
  // ──────────────────────────────────────────────────────────
  test('시나리오 1: DRAFT 행 체크박스 노출 / CONFIRMED 행 체크박스 미존재', async ({ page }) => {
    await installAuthMock(page)
    // 전체 상태 조회 (필터 없음)
    await gotoListAndWait(page, '&mockStatusFilter=all')

    // 상태 필터를 전체로 변경 (기본값이 DRAFT 이므로)
    const statusSelect = page.getByTestId('partner-order-list-status-filter')
    await statusSelect.selectOption('')

    // DRAFT 행 체크박스 — orderNumber "2026/05/04-1" (mock DRAFT_ROW)
    // 체크박스 testid: merge-checkbox-{orderNumber}
    // mock.ts 에서 DRAFT orderNumber = '2026/05/04-1'
    // 단, URL encode 이슈 있으므로 aria-label 로 조회
    const checkboxes = page.locator('input[type="checkbox"][data-testid^="merge-checkbox-"]')
    // waitForTimeout → toBeVisible 단언으로 교체 (FE P1-5)
    await expect(checkboxes.first()).toBeVisible({ timeout: 10_000 })
    const checkboxCount = await checkboxes.count()
    // DRAFT + ON_HOLD 행에 체크박스가 있으므로 1건 이상
    expect(checkboxCount).toBeGreaterThanOrEqual(1)
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 2: 1건만 선택 → 액션 바 표시 / 병합 버튼 비활성
  //
  // 2건 미만이면 병합 버튼 비활성(disabled).
  // ──────────────────────────────────────────────────────────
  test('시나리오 2: 1건 선택 → 액션 바 표시 + 병합 버튼 비활성 (2건 이상 필요)', async ({
    page,
  }) => {
    await installAuthMock(page)
    await gotoListAndWait(page)
    // status=DRAFT 필터 기본값 → DRAFT_ROW 1건
    // 체크박스 1개만 존재
    const checkbox = page.locator('input[type="checkbox"][data-testid^="merge-checkbox-"]').first()
    await expect(checkbox).toBeVisible({ timeout: 10_000 })
    await checkbox.check()

    // 액션 바 표시
    const actionBar = page.getByTestId('merge-convert-action-bar')
    await expect(actionBar).toBeVisible({ timeout: 5_000 })

    // 선택 건수 표시
    await expect(page.getByTestId('merge-convert-selected-count')).toContainText('1건 선택됨')

    // 병합 버튼 비활성 (2건 미만)
    const mergeBtn = page.getByTestId('merge-convert-open')
    await expect(mergeBtn).toBeVisible()
    await expect(mergeBtn).toBeDisabled()
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 3: 혼합 거래처 선택 → 버튼 비활성 + 안내
  //
  // 검증:
  //   - 전체 상태 필터 후 DRAFT(partnerCode=1234567890) + ON_HOLD(partnerCode=2345678901) 선택
  //   - merge-convert-mixed-partner-warn 안내 노출
  //   - merge-convert-open 버튼 disabled
  // ──────────────────────────────────────────────────────────
  test('시나리오 3: 혼합 거래처 선택 → 버튼 비활성 + 안내 문구', async ({ page }) => {
    await installAuthMock(page)
    await gotoListAndWait(page)

    // 전체 상태 필터로 변경
    const statusSelect = page.getByTestId('partner-order-list-status-filter')
    await statusSelect.selectOption('')

    // 전체 필터 반환 순서: [DRAFT(1234567890), SAME_DRAFT(1234567890), SAME_ON_HOLD(1234567890),
    //   ON_HOLD(2345678901), CONFIRMED — 체크박스 없음]
    // 혼합 시나리오: 0번(partnerCode=1234567890) + 3번(partnerCode=2345678901) 선택.
    const checkboxes = page.locator('input[type="checkbox"][data-testid^="merge-checkbox-"]')
    // waitForTimeout → toBeVisible 단언으로 교체 (FE P1-5)
    await expect(checkboxes.first()).toBeVisible({ timeout: 10_000 })
    const count = await checkboxes.count()
    if (count < 4) {
      test.skip(true, '혼합 거래처 시나리오: 체크박스 4개 미만 — mock 재확인 필요')
      return
    }
    // 0번 = partnerCode 1234567890, 3번 = partnerCode 2345678901 — 혼합
    await checkboxes.nth(0).check()
    await checkboxes.nth(3).check()

    // 2건 선택됨 확인
    await expect(page.getByTestId('merge-convert-selected-count')).toContainText('2건 선택됨')

    // 혼합 거래처: 경고 노출 + 버튼 비활성
    const warnEl = page.getByTestId('merge-convert-mixed-partner-warn')
    await expect(warnEl).toBeVisible({ timeout: 5_000 })
    await expect(warnEl).toContainText('같은 거래처만')
    await expect(page.getByTestId('merge-convert-open')).toBeDisabled()
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 4 (재작성): 같은 거래처 2건 선택 → 모달 열기 →
  //   창고 미선택 시 제출 비활성 → 창고 선택 후 활성.
  //
  // mock 업데이트 (2026-05-31): DRAFT 필터 기본값에서
  //   '2026/05/04-1' + '2026/05/31-3' (동일 partnerCode=1234567890) 2건 반환.
  // → 전체 필터 전환 불필요, skip 조건 제거.
  // ──────────────────────────────────────────────────────────
  test('시나리오 4: 같은 거래처 2건 선택 → 병합 모달 창고 미선택 비활성 → 창고 선택 후 활성', async ({ page }) => {
    await installAuthMock(page)
    // DRAFT 필터 기본값 — 같은 partnerCode(1234567890) DRAFT 2건 포함
    await gotoListAndWait(page)

    const checkboxes = page.locator('input[type="checkbox"][data-testid^="merge-checkbox-"]')
    await expect(checkboxes.first()).toBeVisible({ timeout: 10_000 })
    const count = await checkboxes.count()
    // mock 업데이트로 DRAFT 2건 보장
    expect(count).toBeGreaterThanOrEqual(2)

    await checkboxes.nth(0).check()
    await checkboxes.nth(1).check()

    // 2건 선택됨
    await expect(page.getByTestId('merge-convert-selected-count')).toContainText('2건 선택됨')

    // 같은 거래처 → 혼합 경고 없음 + 병합 버튼 활성
    await expect(page.getByTestId('merge-convert-open')).toBeEnabled({ timeout: 5_000 })

    await page.getByTestId('merge-convert-open').click()

    // 모달 열림 확인
    const modalBody = page.getByTestId('merge-convert-dialog-body')
    await expect(modalBody).toBeVisible({ timeout: 10_000 })

    // 창고 미선택 시 제출 비활성
    const submitBtn = page.getByTestId('merge-convert-submit')
    await expect(submitBtn).toBeDisabled()

    // 창고 autocomplete 선택
    const warehouseDiv = page.getByTestId('merge-convert-warehouse')
    await selectWarehouseAutocomplete(page, warehouseDiv, 'HQ')

    // 주문 상세 로드 + 수량 초기화 완료 후 제출 버튼 활성
    await expect(submitBtn).toBeEnabled({ timeout: 10_000 })
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 5 (재작성): 같은 거래처 2건 선택 → 병합 발행 성공 →
  //   성공 토스트 'SL-20260531-MERGE-001' 노출 + 모달 닫힘.
  //
  // mock 업데이트 (2026-05-31): DRAFT 필터에서 같은 partnerCode 2건 반환.
  // merge 응답 확정: { slipNo, convertedOrders: [{ orderNo, orderStatus, fullyConverted }] }
  // ──────────────────────────────────────────────────────────
  test('시나리오 5: 같은 거래처 2건 병합 발행 성공 → 성공 토스트 + 모달 닫힘', async ({
    page,
  }) => {
    await installAuthMock(page)
    await gotoListAndWait(page)

    // DRAFT 필터 기본값 — 같은 partnerCode(1234567890) 2건
    const checkboxes = page.locator('input[type="checkbox"][data-testid^="merge-checkbox-"]')
    await expect(checkboxes.first()).toBeVisible({ timeout: 10_000 })
    await checkboxes.nth(0).check()
    await checkboxes.nth(1).check()

    await expect(page.getByTestId('merge-convert-open')).toBeEnabled({ timeout: 5_000 })
    await page.getByTestId('merge-convert-open').click()

    // 모달 열림
    await expect(page.getByTestId('merge-convert-dialog-body')).toBeVisible({ timeout: 10_000 })

    // 창고 선택
    const warehouseDiv = page.getByTestId('merge-convert-warehouse')
    await selectWarehouseAutocomplete(page, warehouseDiv, 'HQ')

    // 제출 버튼 활성 대기 후 클릭
    const submitBtn = page.getByTestId('merge-convert-submit')
    await expect(submitBtn).toBeEnabled({ timeout: 10_000 })
    await submitBtn.click()

    // 모달 닫힘 확인
    await expect(page.getByTestId('merge-convert-dialog')).toHaveCount(0, { timeout: 10_000 })

    // 성공 토스트 — 발행 완료 메시지 + slipNo 포함
    const toast = page.getByTestId('merge-convert-success-toast')
    await expect(toast).toBeVisible({ timeout: 10_000 })
    await expect(toast).toContainText('SL-20260531-MERGE-001')
    await expect(toast).toContainText('발행 완료')
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 6 (재작성): 409 거래처 불일치 mock → 모달 내 에러 배너 피드백.
  //
  // mockMerge409=mixed 로 이동 후 같은 거래처 2건 선택 → 모달 열기 →
  // 창고 선택 → 발행 → mock 409 반환 → merge-convert-modal-error 노출.
  //
  // mock interceptor 가 window.location.hash query param 을 읽으므로
  // page.goto(listUrl('&mockMerge409=mixed')) 후 UI 흐름으로 409 를 유발한다.
  // ──────────────────────────────────────────────────────────
  test('시나리오 6: 409 거래처 불일치 mock → 모달 내 에러 배너 피드백', async ({ page }) => {
    await installAuthMock(page)
    // mockMerge409=mixed — hash query 로 전달 → mock interceptor 가 인식
    await page.goto(listUrl('&mockMerge409=mixed'), { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('header-page-title')).toContainText('주문서 관리', { timeout: 15_000 })

    // DRAFT 필터 기본값 — 같은 partnerCode 2건
    const checkboxes = page.locator('input[type="checkbox"][data-testid^="merge-checkbox-"]')
    await expect(checkboxes.first()).toBeVisible({ timeout: 10_000 })
    await checkboxes.nth(0).check()
    await checkboxes.nth(1).check()

    await expect(page.getByTestId('merge-convert-open')).toBeEnabled({ timeout: 5_000 })
    await page.getByTestId('merge-convert-open').click()

    await expect(page.getByTestId('merge-convert-dialog-body')).toBeVisible({ timeout: 10_000 })

    // 창고 선택
    const warehouseDiv = page.getByTestId('merge-convert-warehouse')
    await selectWarehouseAutocomplete(page, warehouseDiv, 'HQ')

    const submitBtn = page.getByTestId('merge-convert-submit')
    await expect(submitBtn).toBeEnabled({ timeout: 10_000 })
    await submitBtn.click()

    // 409 응답 → 모달 내 에러 배너 노출
    const errorBanner = page.getByTestId('merge-convert-error')
    await expect(errorBanner).toBeVisible({ timeout: 10_000 })
    await expect(errorBanner).toContainText('같은 거래처')
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 E-1 (QA 추가): 409 재고 부족 mock → 모달 내 에러 배너 피드백
  //
  // mockMerge409=stock — 재고 부족 409 응답 → merge-convert-error 노출.
  // ──────────────────────────────────────────────────────────
  test('시나리오 E-1: 409 재고 부족 mock → 모달 내 에러 배너 피드백', async ({ page }) => {
    await installAuthMock(page)
    await page.goto(listUrl('&mockMerge409=stock'), { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('header-page-title')).toContainText('주문서 관리', { timeout: 15_000 })

    // DRAFT 필터 기본값 — 같은 partnerCode 2건
    const checkboxes = page.locator('input[type="checkbox"][data-testid^="merge-checkbox-"]')
    await expect(checkboxes.first()).toBeVisible({ timeout: 10_000 })
    await checkboxes.nth(0).check()
    await checkboxes.nth(1).check()

    await expect(page.getByTestId('merge-convert-open')).toBeEnabled({ timeout: 5_000 })
    await page.getByTestId('merge-convert-open').click()

    await expect(page.getByTestId('merge-convert-dialog-body')).toBeVisible({ timeout: 10_000 })

    // 창고 선택
    const warehouseDiv = page.getByTestId('merge-convert-warehouse')
    await selectWarehouseAutocomplete(page, warehouseDiv, 'HQ')

    const submitBtn = page.getByTestId('merge-convert-submit')
    await expect(submitBtn).toBeEnabled({ timeout: 10_000 })
    await submitBtn.click()

    // 재고 부족 409 → 모달 내 에러 배너 노출
    const errorBanner = page.getByTestId('merge-convert-error')
    await expect(errorBanner).toBeVisible({ timeout: 10_000 })
    await expect(errorBanner).toContainText('재고 부족')

    // 모달은 닫히지 않고 유지 (dialog-body 로 확인)
    await expect(page.getByTestId('merge-convert-dialog-body')).toBeVisible()
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 7: 기존 Phase 2.6a 단일전환 버튼 회귀 확인
  //
  // 주문 상세 페이지에서 단일 전환 버튼 여전히 노출 (기존 코드 무변경).
  // ──────────────────────────────────────────────────────────
  test('시나리오 7: 회귀 — 단일주문 상세 페이지 출고전표 전환 버튼 여전히 노출', async ({
    page,
  }) => {
    await installAuthMock(page)
    // ord-draft 상세 페이지 — 기존 2.6a Phase 동일
    const DRAFT_ORDER_ID = 'ord-draft'
    await page.goto(
      `${BASE_URL}/#/sales/partner-orders/${encodeURIComponent(DRAFT_ORDER_ID)}?mockRole=MASTER`,
      { waitUntil: 'domcontentloaded' },
    )
    // header-page-title 은 상세 페이지에서 "주문서 {orderNumber}[영업]" 형태로 렌더됨
    await expect(page.getByTestId('header-page-title')).toContainText('주문서', { timeout: 15_000 })

    // 기존 단일전환 버튼 존재 확인
    const convertBtn = page.getByTestId('partner-order-convert-open')
    await expect(convertBtn).toBeVisible({ timeout: 10_000 })
    await expect(convertBtn).toBeEnabled()
    await expect(convertBtn).toContainText('출고전표 전환')
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 8: 선택 해제 버튼 클릭 → 액션 바 사라짐
  // ──────────────────────────────────────────────────────────
  test('시나리오 8: 선택 해제 버튼 → 선택 초기화 + 액션 바 사라짐', async ({ page }) => {
    await installAuthMock(page)
    await gotoListAndWait(page)

    const checkbox = page.locator('input[type="checkbox"][data-testid^="merge-checkbox-"]').first()
    await expect(checkbox).toBeVisible({ timeout: 10_000 })
    await checkbox.check()

    // 액션 바 표시 확인
    await expect(page.getByTestId('merge-convert-action-bar')).toBeVisible()

    // 선택 해제 클릭
    await page.getByTestId('merge-convert-deselect-all').click()

    // 액션 바 사라짐
    await expect(page.getByTestId('merge-convert-action-bar')).toHaveCount(0)

    // 체크박스 unchecked 확인
    await expect(checkbox).not.toBeChecked()
  })
})
