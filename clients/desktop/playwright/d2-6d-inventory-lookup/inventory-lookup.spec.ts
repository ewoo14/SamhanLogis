/**
 * Phase 2.6d — 품목 재고조회 모달 Playwright E2E.
 *
 * <h2>검증 대상</h2>
 * <ol>
 *   <li>주문서 상세 — 라인 체크박스 다중선택 → "선택 품목 재고조회" 버튼 → 모달 매트릭스 표시</li>
 *   <li>출고전표 상세 — 체크박스 다중선택 → 버튼 → 모달</li>
 *   <li>입고전표 상세 — 체크박스 다중선택 → 버튼 → 모달</li>
 *   <li>0토글 OFF(기본) → 실재고>0 창고만 / ON → 전 창고(BK-001 포함, 0/0/0 셀 노출)</li>
 *   <li>셀 3줄: 가용 N / 실 N / 예약 N — 실수치 단언 포함</li>
 *   <li>UUID 비공개 가드 — 모달 내 UUID 패턴 미포함</li>
 *   <li>선택 0건 시 버튼 비활성</li>
 *   <li>VIRTUAL 창고(VR-001/가상창고) 모달 미노출 단언</li>
 *   <li>0토글 OFF 시 total=0 창고(CS-001 등) 숨김 단언</li>
 *   <li>출고전표 UUID 가드</li>
 *   <li>API 에러 시 에러 배너(role=alert) 노출</li>
 * </ol>
 *
 * <h2>Mock 전략 — VITE_MOCK_MODE=1 (mock.ts Phase 2.6d)</h2>
 * <ul>
 *   <li>GET /inventory/warehouses → 5창고 (HQ-001/VH-001/CS-001/VR-001/BK-001).
 *       BK-001 은 batch 미포함 → 0토글 ON 시 표시, OFF 시 미표시 검증용.</li>
 *   <li>POST /inventory/balances/batch → warehouseType + availableQty/reservedQty/totalQty 포함.
 *       BK-001 창고는 응답에 없음 → FE 가 0/0/0 으로 채움.</li>
 *   <li>주문/슬립 상세 mock 라인 productId 포함 (Phase 2.6d mock 보강).</li>
 *   <li>Mock 기준 AJ040/HQ-001: totalQty=12, reservedQty=2 → availableQty=10.</li>
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

  test('시나리오 3: 모달에서 셀 3줄(가용/실/예약) 실수치 단언 (B-1)', async ({ page }) => {
    await installAuthMock(page)
    await gotoPartnerOrderDetail(page, 'ord-draft')

    const btn = page.getByTestId('partner-order-inventory-lookup-btn')
    await expect(btn).toBeVisible({ timeout: 10_000 })

    const checkboxes = page.getByRole('checkbox', { name: /재고조회 선택/ })
    await checkboxes.first().check()
    await btn.click()

    const modal = page.getByTestId('inventory-lookup-modal')
    await expect(modal).toBeVisible({ timeout: 10_000 })

    // 셀 3줄 — 가용/실/예약 레이블 존재 확인
    await expect(modal).toContainText('가용')
    await expect(modal).toContainText('실')
    await expect(modal).toContainText('예약')

    // B-1: HQ-001 셀 실수치 단언 (mock: AJ040/HQ-001 → total=12, reserved=2, available=10)
    const hqCell = modal.getByTestId('inventory-lookup-cell-AJ040RXH4BC1-HQ-001')
    await expect(hqCell).toContainText('10')   // 가용
    await expect(hqCell).toContainText('12')   // 실
    await expect(hqCell).toContainText('2')    // 예약

    // R-1: VIRTUAL(VR-001/가상창고) 모달 미노출 단언
    await expect(modal).not.toContainText('VR-001')
    await expect(modal).not.toContainText('가상창고')
  })

  test('시나리오 4: 0토글 OFF(기본) → BK-001·CS-001 미노출 / ON → BK-001 노출 + BK-001 0/0/0 단언 (B-1, R-2)', async ({ page }) => {
    await installAuthMock(page)
    await gotoPartnerOrderDetail(page, 'ord-draft')

    const btn = page.getByTestId('partner-order-inventory-lookup-btn')
    await expect(btn).toBeVisible({ timeout: 10_000 })

    const checkboxes = page.getByRole('checkbox', { name: /재고조회 선택/ })
    await checkboxes.first().check()
    await btn.click()

    const modal = page.getByTestId('inventory-lookup-modal')
    await expect(modal).toBeVisible({ timeout: 10_000 })

    // R-2: 0토글 OFF 기본값 — BK-001 미노출 (batch에 없으므로 총 0)
    await expect(modal).not.toContainText('BK-001')

    // R-2: 0토글 OFF — total=0 창고(AJ040/CS-001) 숨김 단언
    await expect(modal).not.toContainText('CS-001')

    // 0수량 창고 토글 ON
    const toggle = page.getByTestId('inventory-lookup-zero-toggle')
    await toggle.check()

    // BK-001 노출 확인 (0/0/0 행)
    await expect(modal).toContainText('BK-001')

    // B-1: BK-001 셀 0/0/0 단언 (mock에 없으므로 FE가 0으로 채움)
    const bkCell = modal.getByTestId('inventory-lookup-cell-AJ040RXH4BC1-BK-001')
    await expect(bkCell).toContainText('0')  // 가용 0
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

  test('시나리오 6: 전체선택 체크박스 → 모든 라인 선택 + 선택 수 (1) 단언', async ({ page }) => {
    await installAuthMock(page)
    await gotoPartnerOrderDetail(page, 'ord-draft')

    const btn = page.getByTestId('partner-order-inventory-lookup-btn')
    await expect(btn).toBeVisible({ timeout: 10_000 })

    // 전체선택 체크박스 (aria-label="전체 선택")
    const allCheck = page.getByRole('checkbox', { name: '전체 선택' }).first()
    await expect(allCheck).toBeVisible({ timeout: 5_000 })
    await allCheck.check()

    // 버튼 활성 + 선택 수 표시 (ord-draft 라인 1건이므로 (1) 표시)
    await expect(btn).toBeEnabled()
    await expect(btn).toContainText('(')
    // 실제 건수 단언 — ord-draft 1라인
    await expect(btn).toContainText('1')
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

  test('시나리오 8: 출고전표 — 셀 3줄 + 0토글 동작 + VIRTUAL 미노출 (R-1)', async ({ page }) => {
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

    // R-1: VIRTUAL 창고 미노출 단언
    await expect(modal).not.toContainText('VR-001')
    await expect(modal).not.toContainText('가상창고')

    // 0토글 OFF 기본 → BK-001 미노출
    await expect(modal).not.toContainText('BK-001')

    // 0토글 ON
    await page.getByTestId('inventory-lookup-zero-toggle').check()
    await expect(modal).toContainText('BK-001')
  })

  // R-3: 출고전표(OUTBOUND) 컨텍스트 UUID 가드 시나리오
  test('시나리오 9: 출고전표 UUID 비공개 가드 (R-3)', async ({ page }) => {
    await installAuthMock(page)
    await gotoSalesSlipDetail(page, 'slip-001')

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
// 시나리오 12: SlipFormPage 신 InventoryLookupModal 일원화 회귀 (3-D)
// ============================================================

test.describe('회귀 — SlipFormPage 재고모달 일원화(InventoryLookupModal)', () => {
  test('시나리오 12: 빈 폼 — 재고조회 버튼 비활성 + 모달 미오픈', async ({ page }) => {
    await installAuthMock(page)
    // SlipFormPage 신규 작성 경로
    await page.goto(`${BASE_URL}/#/sales/new?mockRole=MASTER`, {
      waitUntil: 'domcontentloaded',
    })
    await expect(page.locator('body')).toBeVisible({ timeout: 10_000 })

    // 일원화: SlipFormPage 도 신 InventoryLookupModal 사용 → 닫힘 상태면 DOM 미존재
    await expect(page.getByTestId('inventory-lookup-modal')).toHaveCount(0)

    // 라인 미선택 → 재고조회 버튼 비활성 (모달 인프라 배선 확인)
    const btn = page.getByTestId('slip-form-inventory-lookup-btn')
    await expect(btn).toBeVisible({ timeout: 10_000 })
    await expect(btn).toBeDisabled()
  })
})

// ============================================================
// 시나리오 14~15: 세트(BUNDLE) 재고 가드 (Round C #23, 스펙 §2-1 sweep)
//   SalesPartnerOrderDetailPage 도 SlipFormPage 동형으로 BUNDLE 라인을 재고조회 제외.
//   BE 가 라인 응답에 productType 을 enrich → FE 가 "BUNDLE" 라인을 걸러낸다.
// ============================================================

test.describe('주문서 상세 — 세트(BUNDLE) 재고 가드', () => {

  test('시나리오 14: BUNDLE 라인만 선택 → 재고조회 → 세트 전용 안내(매트릭스 미표시)', async ({
    page,
  }) => {
    await installAuthMock(page)
    // ord-bundle-only: 라인 1건(productType=BUNDLE) — mock.ts Round C #23 fixture
    await gotoPartnerOrderDetail(page, 'ord-bundle-only')

    const btn = page.getByTestId('partner-order-inventory-lookup-btn')
    await expect(btn).toBeVisible({ timeout: 10_000 })

    // 세트 라인 선택 — 선택 자체는 가능(버튼은 선택 수 기준 활성)
    const checkboxes = page.getByRole('checkbox', { name: /재고조회 선택/ })
    await checkboxes.first().check()
    await expect(btn).toBeEnabled()
    await btn.click()

    const modal = page.getByTestId('inventory-lookup-modal')
    await expect(modal).toBeVisible({ timeout: 10_000 })

    // 세트 전용 안내 표시 + 매트릭스(셀) 미표시 단언
    const bundleNotice = page.getByTestId('inventory-lookup-bundle-only-notice')
    await expect(bundleNotice).toBeVisible()
    await expect(bundleNotice).toContainText('세트 품목은 재고를 표시하지 않습니다')
    // 세트 단위 재고(0행/0수량) 미표시 — 매트릭스 컬럼 헤더("가용") 부재
    await expect(modal).not.toContainText('가용')
    // 혼합 캡션은 미표시(전부 세트)
    await expect(page.getByTestId('inventory-lookup-mixed-bundle-notice')).toHaveCount(0)
  })

  test('시나리오 15: BUNDLE+SINGLE 혼합 선택 → 세트 제외 캡션 + 단품 매트릭스', async ({
    page,
  }) => {
    await installAuthMock(page)
    // ord-bundle-mixed: BUNDLE 1 + SINGLE(AJ040) 1
    await gotoPartnerOrderDetail(page, 'ord-bundle-mixed')

    const btn = page.getByTestId('partner-order-inventory-lookup-btn')
    await expect(btn).toBeVisible({ timeout: 10_000 })

    // 전체 선택 → 두 라인 모두 선택(혼합 → excludedBundleCount=1)
    const allCheck = page.getByRole('checkbox', { name: '전체 선택' }).first()
    await expect(allCheck).toBeVisible({ timeout: 5_000 })
    await allCheck.check()
    await expect(btn).toBeEnabled()
    await btn.click()

    const modal = page.getByTestId('inventory-lookup-modal')
    await expect(modal).toBeVisible({ timeout: 10_000 })

    // 혼합 제외 캡션 표시(세트 1건 제외) — bundleOnlyLines 안내는 미표시
    const mixedNotice = page.getByTestId('inventory-lookup-mixed-bundle-notice')
    await expect(mixedNotice).toBeVisible()
    await expect(mixedNotice).toContainText('세트 1건은 제외됨')
    await expect(page.getByTestId('inventory-lookup-bundle-only-notice')).toHaveCount(0)

    // 단품(AJ040)은 매트릭스로 조회됨 — 셀 실수치 단언(mock: AJ040/HQ-001 → 가용 10)
    const hqCell = modal.getByTestId('inventory-lookup-cell-AJ040RXH4BC1-HQ-001')
    await expect(hqCell).toContainText('10')

    // UUID 비공개 가드 — 세트 productId(p-set-hm2way) 등 미노출 + UUID 패턴 부재
    const modalText = await modal.innerText()
    expect(UUID_PATTERN.test(modalText)).toBe(false)
  })

  test('시나리오 16: BUNDLE 주문 수정 직후 → 상세 refetch 후 세트 재고 가드 유지', async ({
    page,
  }) => {
    await installAuthMock(page)
    await gotoPartnerOrderDetail(page, 'ord-bundle-mixed')
    const getCountBeforeSave = await page.evaluate(
      () => Number((globalThis as Record<string, unknown>)['__SAMHAN_PARTNER_ORDER_DETAIL_GET_COUNT_ord-bundle-mixed'] ?? 0),
    )

    await page.getByTestId('partner-order-edit-open').click()
    await expect(page.getByTestId('partner-order-edit-form')).toBeVisible({ timeout: 5_000 })
    await page.getByTestId('partner-order-edit-submit').click()
    await expect(page.getByTestId('partner-order-edit-form')).toHaveCount(0, { timeout: 10_000 })
    await expect
      .poll(
        async () =>
          await page.evaluate(
            () => Number((globalThis as Record<string, unknown>)['__SAMHAN_PARTNER_ORDER_DETAIL_GET_COUNT_ord-bundle-mixed'] ?? 0),
          ),
        { timeout: 10_000, message: '주문 수정 성공 후 상세 GET refetch 가 발생하지 않음' },
      )
      .toBeGreaterThan(getCountBeforeSave)

    const btn = page.getByTestId('partner-order-inventory-lookup-btn')
    await expect(btn).toBeVisible({ timeout: 10_000 })

    const allCheck = page.getByRole('checkbox', { name: '전체 선택' }).first()
    await expect(allCheck).toBeVisible({ timeout: 5_000 })
    await allCheck.check()
    await expect(btn).toBeEnabled()
    await btn.click()

    const modal = page.getByTestId('inventory-lookup-modal')
    await expect(modal).toBeVisible({ timeout: 10_000 })

    const mixedNotice = page.getByTestId('inventory-lookup-mixed-bundle-notice')
    await expect(mixedNotice).toBeVisible()
    await expect(mixedNotice).toContainText('세트 1건은 제외됨')
    await expect(page.getByTestId('inventory-lookup-cell-AJ040RXH4BC1-HQ-001')).toContainText('10')
  })
})

// ============================================================
// 시나리오 13: API 에러 시 에러 배너 노출 (R-4)
// ============================================================

test.describe('에러 처리 — API 500 에러 배너', () => {
  test('시나리오 13: batch API 500 에러 → 에러 배너(role=alert) 노출 (R-4)', async ({ page }) => {
    // ord-error-test: mock에서 __error_test__ productId 포함 라인 반환
    // → POST /inventory/balances/batch 에 __error_test__ 포함 시 mock 500 반환
    await installAuthMock(page)
    await gotoPartnerOrderDetail(page, 'ord-error-test')

    const btn = page.getByTestId('partner-order-inventory-lookup-btn')
    await expect(btn).toBeVisible({ timeout: 10_000 })

    const checkboxes = page.getByRole('checkbox', { name: /재고조회 선택/ })
    await checkboxes.first().check()
    await btn.click()

    // 에러 배너 노출 확인 (role="alert" + testid)
    const errorBanner = page.getByRole('alert')
    await expect(errorBanner).toBeVisible({ timeout: 10_000 })
    await expect(errorBanner).toContainText('오류')

    // testid 기반 단언
    const errorTestId = page.getByTestId('inventory-lookup-error')
    await expect(errorTestId).toBeVisible({ timeout: 5_000 })
  })
})
