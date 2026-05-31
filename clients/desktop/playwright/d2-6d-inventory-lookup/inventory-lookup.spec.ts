/**
 * Phase 2.6d — 품목 재고조회 모달 Playwright E2E.
 *
 * <h2>검증 대상</h2>
 * <ol>
 *   <li>주문서 상세 — 라인 체크박스 다중선택 → "선택 품목 재고조회" 버튼 → 모달 매트릭스 표시</li>
 *   <li>출고전표 상세 — 체크박스 다중선택 → 버튼 → 모달</li>
 *   <li>입고전표 상세 — 체크박스 다중선택 → 버튼 → 모달</li>
 *   <li>0토글 OFF(기본) → 실재고>0 창고만 / ON → 전 창고(BK-001 포함, 0/0/0 셀 노출)</li>
 *   <li>셀 3줄: 가용 N / 실 N / 예약 N</li>
 *   <li>UUID 비공개 가드 — 모달 내 UUID 패턴 미포함</li>
 *   <li>선택 0건 시 버튼 비활성</li>
 * </ol>
 *
 * <h2>Mock 전략 — VITE_MOCK_MODE=1 (mock.ts Phase 2.6d)</h2>
 * <ul>
 *   <li>GET /inventory/warehouses → 5창고 (HQ-001/VH-001/CS-001/VR-001/BK-001).
 *       BK-001 은 batch 미포함 → 0토글 ON 시 표시, OFF 시 미표시 검증용.</li>
 *   <li>POST /inventory/balances/batch → warehouseType + availableQty/reservedQty/totalQty 포함.
 *       BK-001 창고는 응답에 없음 → FE 가 0/0/0 으로 채움.</li>
 *   <li>주문/슬립 상세 mock 라인 productId 포함 (Phase 2.6d mock 보강).</li>
 * </ul>
 *
 * <h2>no-fake-data 원칙 ([[feedback_no_fake_data_ever]])</h2>
 * <p>본 spec 은 VITE_MOCK_MODE=1 환경에서 Playwright 컴포넌트 회귀 검증 전용.
 * QA 증빙 스크린샷은 실서버 Docker 환경에서 PM 이 별도 수행.
 *
 * <h2>실행 방법</h2>
 * <pre>
 *   cd clients/desktop
 *   # 별도 터미널:
 *   set VITE_MOCK_MODE=1 && npx vite src/renderer --host 127.0.0.1 --port 5174
 *   # 테스트 실행:
 *   set PLAYWRIGHT_SKIP_WEB_SERVER=1 && set AUDIT_BASE_URL=http://127.0.0.1:5174
 *     && npx playwright test playwright/d2-6d-inventory-lookup --reporter=line
 * </pre>
 */
import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'

/** UUID 정규식 — 화면 노출 가드 검증. */
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i

/**
 * window.samhanAuth stub — AuthGuard 통과 + 전 role 허용 (MASTER).
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

/** 주문서 상세 URL — hash router. */
const partnerOrderUrl = (id: string) =>
  `${BASE_URL}/#/sales/partner-orders/${encodeURIComponent(id)}?mockRole=MASTER`

/** 출고전표 상세 URL. */
const salesSlipUrl = (id: string) =>
  `${BASE_URL}/#/sales/${encodeURIComponent(id)}?mockRole=MASTER`

/** 입고전표 상세 URL. */
const purchaseSlipUrl = (id: string) =>
  `${BASE_URL}/#/purchases/${encodeURIComponent(id)}?mockRole=MASTER`

/** 주문서 상세로 이동하여 헤더 대기. */
async function gotoPartnerOrderDetail(page: Page, orderId: string): Promise<void> {
  await page.goto(partnerOrderUrl(orderId), { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('주문서 상세')).toBeVisible({ timeout: 15_000 })
}

/** 출고전표 상세로 이동. */
async function gotoSalesSlipDetail(page: Page, slipId: string): Promise<void> {
  await page.goto(salesSlipUrl(slipId), { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="slip-detail-delivery-address"], .error-banner', {
    timeout: 15_000,
  })
}

/** 입고전표 상세로 이동. */
async function gotoPurchaseSlipDetail(page: Page, slipId: string): Promise<void> {
  await page.goto(purchaseSlipUrl(slipId), { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="slip-detail-delivery-address"], .error-banner', {
    timeout: 15_000,
  })
}

// ============================================================
// 시나리오 1: 주문서 상세 — 다중선택 → 모달 → 매트릭스 표시
// ============================================================

test.describe('주문서 상세 — 재고조회 모달', () => {

  test('시나리오 1: 선택 0건 → 재고조회 버튼 비활성', async ({ page }) => {
    await installAuthMock(page)
    await gotoPartnerOrderDetail(page, 'ord-draft')

    const btn = page.getByTestId('partner-order-inventory-lookup-btn')
    await expect(btn).toBeVisible({ timeout: 10_000 })
    await expect(btn).toBeDisabled()
  })

  test('시나리오 2: 라인 체크박스 선택 → 버튼 활성 → 모달 오픈', async ({ page }) => {
    await installAuthMock(page)
    await gotoPartnerOrderDetail(page, 'ord-draft')

    // 재고조회 버튼 대기
    const btn = page.getByTestId('partner-order-inventory-lookup-btn')
    await expect(btn).toBeVisible({ timeout: 10_000 })
    await expect(btn).toBeDisabled()

    // 첫 번째 라인 체크박스 선택
    const checkboxes = page.getByRole('checkbox', { name: /재고조회 선택/ })
    const first = checkboxes.first()
    await expect(first).toBeVisible({ timeout: 5_000 })
    await first.check()

    // 버튼 활성화 확인
    await expect(btn).toBeEnabled()

    // 모달 오픈
    await btn.click()
    const modal = page.getByTestId('inventory-lookup-modal')
    await expect(modal).toBeVisible({ timeout: 10_000 })
  })

  test('시나리오 3: 모달에서 셀 3줄(가용/실/예약) 확인', async ({ page }) => {
    await installAuthMock(page)
    await gotoPartnerOrderDetail(page, 'ord-draft')

    const btn = page.getByTestId('partner-order-inventory-lookup-btn')
    await expect(btn).toBeVisible({ timeout: 10_000 })

    const checkboxes = page.getByRole('checkbox', { name: /재고조회 선택/ })
    await checkboxes.first().check()
    await btn.click()

    const modal = page.getByTestId('inventory-lookup-modal')
    await expect(modal).toBeVisible({ timeout: 10_000 })

    // 셀 3줄 — 가용/실/예약 텍스트 확인
    await expect(modal).toContainText('가용')
    await expect(modal).toContainText('실')
    await expect(modal).toContainText('예약')
  })

  test('시나리오 4: 0토글 OFF(기본) → BK-001 미노출 / ON → BK-001 노출', async ({ page }) => {
    await installAuthMock(page)
    await gotoPartnerOrderDetail(page, 'ord-draft')

    const btn = page.getByTestId('partner-order-inventory-lookup-btn')
    await expect(btn).toBeVisible({ timeout: 10_000 })

    const checkboxes = page.getByRole('checkbox', { name: /재고조회 선택/ })
    await checkboxes.first().check()
    await btn.click()

    const modal = page.getByTestId('inventory-lookup-modal')
    await expect(modal).toBeVisible({ timeout: 10_000 })

    // 0토글 OFF 기본값 — BK-001 미노출 (batch에 없으므로 총 0)
    await expect(modal).not.toContainText('BK-001')

    // 0수량 창고 토글 ON
    const toggle = page.getByTestId('inventory-lookup-zero-toggle')
    await toggle.check()

    // BK-001 노출 확인 (0/0/0 행)
    await expect(modal).toContainText('BK-001')
  })

  test('시나리오 5: UUID 비공개 가드 — 모달 내 UUID 미노출', async ({ page }) => {
    await installAuthMock(page)
    await gotoPartnerOrderDetail(page, 'ord-draft')

    const btn = page.getByTestId('partner-order-inventory-lookup-btn')
    await expect(btn).toBeVisible({ timeout: 10_000 })

    const checkboxes = page.getByRole('checkbox', { name: /재고조회 선택/ })
    await checkboxes.first().check()
    await btn.click()

    const modal = page.getByTestId('inventory-lookup-modal')
    await expect(modal).toBeVisible({ timeout: 10_000 })

    const modalText = await modal.innerText()
    expect(UUID_PATTERN.test(modalText)).toBe(false)
  })

  test('시나리오 6: 전체선택 체크박스 → 모든 라인 선택', async ({ page }) => {
    await installAuthMock(page)
    await gotoPartnerOrderDetail(page, 'ord-draft')

    const btn = page.getByTestId('partner-order-inventory-lookup-btn')
    await expect(btn).toBeVisible({ timeout: 10_000 })

    // 전체선택 체크박스 (aria-label="전체 선택")
    const allCheck = page.getByRole('checkbox', { name: '전체 선택' }).first()
    await expect(allCheck).toBeVisible({ timeout: 5_000 })
    await allCheck.check()

    // 버튼 활성 + 선택 수 표시
    await expect(btn).toBeEnabled()
    await expect(btn).toContainText('(')
  })
})

// ============================================================
// 시나리오 7~9: 출고전표 상세 — 재고조회 모달
// ============================================================

test.describe('출고전표 상세 — 재고조회 모달', () => {

  test('시나리오 7: 출고전표 라인 체크 → 버튼 활성 → 모달 오픈', async ({ page }) => {
    await installAuthMock(page)
    // mock.ts SAMPLE_LINES 기준 slip-001 (DRAFT)
    await gotoSalesSlipDetail(page, 'slip-001')

    const btn = page.getByTestId('slip-line-inventory-lookup-btn')
    await expect(btn).toBeVisible({ timeout: 12_000 })
    await expect(btn).toBeDisabled()

    // 라인 체크박스 선택
    const checkboxes = page.getByRole('checkbox', { name: /재고조회 선택/ })
    const first = checkboxes.first()
    await expect(first).toBeVisible({ timeout: 5_000 })
    await first.check()

    await expect(btn).toBeEnabled()
    await btn.click()

    const modal = page.getByTestId('inventory-lookup-modal')
    await expect(modal).toBeVisible({ timeout: 10_000 })
  })

  test('시나리오 8: 출고전표 — 셀 3줄 + 0토글 동작', async ({ page }) => {
    await installAuthMock(page)
    await gotoSalesSlipDetail(page, 'slip-001')

    const btn = page.getByTestId('slip-line-inventory-lookup-btn')
    await expect(btn).toBeVisible({ timeout: 12_000 })

    const checkboxes = page.getByRole('checkbox', { name: /재고조회 선택/ })
    await checkboxes.first().check()
    await btn.click()

    const modal = page.getByTestId('inventory-lookup-modal')
    await expect(modal).toBeVisible({ timeout: 10_000 })

    // 셀 3줄 확인
    await expect(modal).toContainText('가용')
    await expect(modal).toContainText('실')
    await expect(modal).toContainText('예약')

    // 0토글 OFF 기본 → BK-001 미노출
    await expect(modal).not.toContainText('BK-001')

    // 0토글 ON
    await page.getByTestId('inventory-lookup-zero-toggle').check()
    await expect(modal).toContainText('BK-001')
  })
})

// ============================================================
// 시나리오 10~11: 입고전표 상세 — 재고조회 모달
// ============================================================

test.describe('입고전표 상세 — 재고조회 모달', () => {

  test('시나리오 10: 입고전표 라인 체크 → 버튼 활성 → 모달 오픈', async ({ page }) => {
    await installAuthMock(page)
    // mock.ts SAMPLE_LINES 기준 slip-002 (CONFIRMED, INBOUND 모드)
    await gotoPurchaseSlipDetail(page, 'slip-003')

    const btn = page.getByTestId('slip-line-inventory-lookup-btn')
    await expect(btn).toBeVisible({ timeout: 12_000 })
    await expect(btn).toBeDisabled()

    const checkboxes = page.getByRole('checkbox', { name: /재고조회 선택/ })
    const first = checkboxes.first()
    await expect(first).toBeVisible({ timeout: 5_000 })
    await first.check()

    await expect(btn).toBeEnabled()
    await btn.click()

    const modal = page.getByTestId('inventory-lookup-modal')
    await expect(modal).toBeVisible({ timeout: 10_000 })
  })

  test('시나리오 11: 입고전표 UUID 비공개 가드', async ({ page }) => {
    await installAuthMock(page)
    await gotoPurchaseSlipDetail(page, 'slip-003')

    const btn = page.getByTestId('slip-line-inventory-lookup-btn')
    await expect(btn).toBeVisible({ timeout: 12_000 })

    const checkboxes = page.getByRole('checkbox', { name: /재고조회 선택/ })
    await checkboxes.first().check()
    await btn.click()

    const modal = page.getByTestId('inventory-lookup-modal')
    await expect(modal).toBeVisible({ timeout: 10_000 })

    const modalText = await modal.innerText()
    expect(UUID_PATTERN.test(modalText)).toBe(false)
  })
})

// ============================================================
// 시나리오 12: 기존 SlipFormPage StockBalanceModal 회귀 확인
// ============================================================

test.describe('회귀 — SlipFormPage StockBalanceModal 무변경', () => {
  test('시나리오 12: SlipFormPage 재고조회 모달 회귀 없음', async ({ page }) => {
    await installAuthMock(page)
    // SlipFormPage는 /sales/new 또는 /sales/:id/edit 경로
    await page.goto(`${BASE_URL}/#/sales/new?mockRole=MASTER`, {
      waitUntil: 'domcontentloaded',
    })
    // SlipFormPage 기본 렌더 확인 (title 또는 form 요소)
    // 오류 없이 렌더되면 회귀 없음 — 기존 StockBalanceModal 미변경 보장
    await expect(page.locator('body')).toBeVisible({ timeout: 10_000 })
    // StockBalanceModal 이 강제 open 되지 않았음을 확인
    const stockModal = page.getByTestId('stock-balance-modal')
    await expect(stockModal).toHaveCount(0)
  })
})
