/**
 * Phase 2.6a — 주문 부분전환(출고전표 전환) Playwright E2E.
 *
 * <h2>검증 대상</h2>
 * <ol>
 *   <li>DRAFT 주문 상세 → "출고전표 전환" 버튼 노출 · 클릭 → 모달 열림
 *       (라인 수량 입력 테이블 + 비가역 경고 + 발행요약 문구)</li>
 *   <li>라인 수량 입력 → 전환 제출 → 성공 토스트
 *       (fullyConverted=false 분기: "잔여 수량이 남아 있습니다")</li>
 *   <li>mockConvertFully=1 → 성공 토스트 (fullyConverted=true: "전체 수량 전환 완료")</li>
 *   <li>CONFIRMED 주문 → 전환 버튼 미노출</li>
 *   <li>linkedSlipNo 있는 주문(ord-linked-slip) → 전환 버튼 미노출</li>
 *   <li>부분전환 완료 라인(convertedQuantity=quantity) → input disabled, 전환완료 표시</li>
 *   <li>잔여=0 라인만 있을 때 모달 제출 버튼 disabled</li>
 *   <li>409(잔여 초과) mock → 모달 내 에러 피드백 (data-testid=partner-order-convert-modal-error)</li>
 * </ol>
 *
 * <h2>Mock 전략 — VITE_MOCK_MODE=1 (mock.ts Phase 2.6a 블록)</h2>
 * <ul>
 *   <li>GET /api/v1/partner-orders/ord-draft         → DRAFT, linkedSlipNo=null, convertedQuantity=0</li>
 *   <li>GET /api/v1/partner-orders/ord-confirmed     → CONFIRMED, linkedSlipNo='SL-20260504-001'</li>
 *   <li>GET /api/v1/partner-orders/ord-linked-slip   → DRAFT, linkedSlipNo='SL-20260504-001'</li>
 *   <li>GET /api/v1/partner-orders/ord-partially-converted
 *           → DRAFT, line-po-001 qty=2 converted=1(잔여1), line-po-002 qty=3 converted=3(잔여0)</li>
 *   <li>POST /api/v1/partner-orders/{id}/convert-to-slip
 *           → { slipNo:'SL-20260530-001', orderStatus, fullyConverted }
 *           (mockConvert409=1 → 409, mockConvertFully=1 → fullyConverted=true)</li>
 * </ul>
 *
 * <h2>testid 목록</h2>
 * <ul>
 *   <li>{@code partner-order-convert-open}        — "출고전표 전환" 버튼 (DRAFT + linkedSlipNo=null 일 때만 렌더)</li>
 *   <li>{@code partner-order-convert-modal}       — 전환 모달 root (Modal data-testid)</li>
 *   <li>{@code partner-order-convert-modal-body}  — 모달 본문 div</li>
 *   <li>{@code partner-order-convert-qty-{index}} — 라인별 전환수량 input (0-indexed)</li>
 *   <li>{@code partner-order-convert-submit}      — "출고전표로 전환" 제출 버튼</li>
 *   <li>{@code partner-order-convert-toast}       — 성공 토스트 (role=status)</li>
 *   <li>{@code partner-order-convert-error}       — 페이지 레벨 에러 배너 (role=alert)</li>
 *   <li>{@code partner-order-convert-modal-error} — 모달 내부 에러 배너 (role=alert)</li>
 * </ul>
 *
 * <h2>UUID 비공개 가드 ([[feedback_uuid_no_user_visibility]])</h2>
 * <p>단언은 orderNumber / slipNo / partnerName / 한국어 라벨만 사용. lineId 는 data-testid index 로 접근.
 *
 * <h2>실행 방법</h2>
 * <pre>
 *   cd clients/desktop
 *   # 별도 터미널:
 *   set VITE_MOCK_MODE=1 && npx vite src/renderer --host 127.0.0.1 --port 5174
 *   # 테스트 실행:
 *   set PLAYWRIGHT_SKIP_WEB_SERVER=1 && set AUDIT_BASE_URL=http://127.0.0.1:5174
 *     && npx playwright test playwright/phase-2-6a-order-convert --reporter=line
 * </pre>
 */
import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'

// ============================================================
// orderId 상수 — mock.ts Phase 2.6a 블록과 1:1 대응
// ============================================================

/** DRAFT 주문 (convertedQuantity=0) — 전환 버튼 노출 진입점. */
const DRAFT_ORDER_ID = 'ord-draft'

/** ON_HOLD 주문 — Phase 2.6a 에서도 전환 가능 (CONVERTIBLE_STATUS에 포함). */
const HOLD_ORDER_ID = 'ord-hold'

/** CONFIRMED 주문 — CONVERTIBLE_STATUS 미포함이므로 전환 버튼 미노출. */
const CONFIRMED_ORDER_ID = 'ord-confirmed'

/**
 * DRAFT + linkedSlipNo='SL-20260504-001' 주문.
 * FE 조건 `linkedSlipNo == null` 검사에 걸려 전환 버튼 미노출.
 */
const LINKED_SLIP_ORDER_ID = 'ord-linked-slip'

/**
 * DRAFT + 부분전환 완료 fixture:
 *   line-po-001: qty=2, convertedQuantity=1 (잔여 1 → 전환수량 input 활성)
 *   line-po-002: qty=3, convertedQuantity=3 (잔여 0 → input disabled, "전환완료" 표시)
 */
const PARTIAL_ORDER_ID = 'ord-partially-converted'

/** 주문 상세 URL — hash router. */
const detailUrl = (id: string, extra = '') =>
  `${BASE_URL}/#/sales/partner-orders/${encodeURIComponent(id)}?mockRole=MASTER${extra}`

/**
 * window.samhanAuth stub — AuthGuard 통과 + CONVERT_ROLES(['SALES','MANAGER','MASTER']) 포함.
 * VITE_MOCK_MODE=1 에서도 client.ts interceptor 가 getToken() 을 호출하므로 stub 필수.
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
 * 주문 상세 페이지로 이동하고 "주문서 상세" 헤더가 렌더될 때까지 대기.
 */
async function gotoDetailAndWait(page: Page, orderId: string, extra = ''): Promise<void> {
  await page.goto(detailUrl(orderId, extra), { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('주문서 상세')).toBeVisible({ timeout: 15_000 })
}

/**
 * 전환 버튼 클릭 → 모달 본문(partner-order-convert-modal-body)이 보일 때까지 대기.
 */
async function openConvertModal(page: Page): Promise<void> {
  const convertBtn = page.getByTestId('partner-order-convert-open')
  await expect(convertBtn).toBeVisible({ timeout: 10_000 })
  await expect(convertBtn).toBeEnabled()
  await convertBtn.click()
  await expect(page.getByTestId('partner-order-convert-modal-body')).toBeVisible({ timeout: 10_000 })
}

// ============================================================
// Test Suite
// ============================================================

test.describe('Phase 2.6a 출고전표 전환', () => {

  // ──────────────────────────────────────────────────────────
  // 시나리오 1: DRAFT 주문 → "출고전표 전환" 버튼 노출 · 클릭 → 모달 열림
  //
  // 검증:
  //   - partner-order-convert-open 버튼 존재
  //   - 클릭 시 partner-order-convert-modal-body 렌더
  //   - 모달 내 비가역 경고 문구("되돌릴 수 없습니다") 포함
  //   - 라인 수량 input (partner-order-convert-qty-0) 렌더
  //   - 제출 버튼 (partner-order-convert-submit) 존재
  // ──────────────────────────────────────────────────────────
  test('시나리오 1: DRAFT 주문 → 전환 버튼 노출 · 클릭 → 모달(라인+비가역경고) 열림', async ({
    page,
  }) => {
    await installAuthMock(page)
    await gotoDetailAndWait(page, DRAFT_ORDER_ID)

    // 전환 버튼 노출 확인
    const convertBtn = page.getByTestId('partner-order-convert-open')
    await expect(convertBtn).toBeVisible()
    await expect(convertBtn).toBeEnabled()
    await expect(convertBtn).toContainText('출고전표 전환')

    // 모달 열기
    await openConvertModal(page)

    // 비가역 경고 문구
    const modalBody = page.getByTestId('partner-order-convert-modal-body')
    await expect(modalBody).toContainText('되돌릴 수 없습니다')

    // 라인 수량 input 렌더 (index 0)
    await expect(page.getByTestId('partner-order-convert-qty-0')).toBeVisible()

    // 제출 버튼 존재
    await expect(page.getByTestId('partner-order-convert-submit')).toBeVisible()

    // 에러 배너 미노출
    await expect(page.getByTestId('partner-order-convert-modal-error')).toHaveCount(0)
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 2: 라인 수량 입력 → 전환 제출 → 부분전환 성공 토스트
  //
  // mockConvertFully 미설정 → fullyConverted=false
  // 토스트 문구: "SL-20260530-001 발행 — 잔여 수량이 남아 있습니다"
  // 모달 닫힘 + partner-order-convert-toast 노출
  // ──────────────────────────────────────────────────────────
  test('시나리오 2: 수량 입력 → 전환 → 부분전환 성공 토스트 (fullyConverted=false)', async ({
    page,
  }) => {
    await installAuthMock(page)
    await gotoDetailAndWait(page, DRAFT_ORDER_ID)
    await openConvertModal(page)

    // line 0 전환수량 입력 (기본값 = 잔여 전량이지만 명시적으로 1 설정)
    const qtyInput = page.getByTestId('partner-order-convert-qty-0')
    await qtyInput.fill('1')

    // 슬라이스 C: 출고 창고 선택 필수 — 비-placeholder 옵션(index 1) 선택
    const warehouseDiv = page.getByTestId('partner-order-convert-warehouse')
    const warehouseSelect = warehouseDiv.locator('select')
    await warehouseSelect.selectOption({ index: 1 })

    // 제출
    const submitBtn = page.getByTestId('partner-order-convert-submit')
    await expect(submitBtn).toBeEnabled()
    await submitBtn.click()

    // 성공 토스트 — slipNo + 부분전환 문구
    const toast = page.getByTestId('partner-order-convert-toast')
    await expect(toast).toBeVisible({ timeout: 10_000 })
    await expect(toast).toContainText('SL-20260530-001')
    await expect(toast).toContainText('잔여 수량이 남아 있습니다')

    // 모달 닫힘 확인
    await expect(page.getByTestId('partner-order-convert-modal-body')).toHaveCount(0)

    // 에러 배너 미노출
    await expect(page.getByTestId('partner-order-convert-error')).toHaveCount(0)
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 3: 전량 전환 성공 토스트 (mockConvertFully=1)
  //
  // fullyConverted=true → 토스트 문구 "전체 수량 전환 완료"
  // ──────────────────────────────────────────────────────────
  test('시나리오 3: 전환 → 전량전환 성공 토스트 (fullyConverted=true)', async ({ page }) => {
    await installAuthMock(page)
    // mockConvertFully=1 로 fullyConverted=true 트리거
    await gotoDetailAndWait(page, DRAFT_ORDER_ID, '&mockConvertFully=1')
    await openConvertModal(page)

    const qtyInput = page.getByTestId('partner-order-convert-qty-0')
    await qtyInput.fill('2')

    // 슬라이스 C: 출고 창고 선택 필수 — 비-placeholder 옵션(index 1) 선택
    const warehouseDiv = page.getByTestId('partner-order-convert-warehouse')
    const warehouseSelect = warehouseDiv.locator('select')
    await warehouseSelect.selectOption({ index: 1 })

    const submitBtn = page.getByTestId('partner-order-convert-submit')
    await expect(submitBtn).toBeEnabled()
    await submitBtn.click()

    const toast = page.getByTestId('partner-order-convert-toast')
    await expect(toast).toBeVisible({ timeout: 10_000 })
    await expect(toast).toContainText('SL-20260530-001')
    await expect(toast).toContainText('전체 수량 전환 완료')
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 4: ON_HOLD 주문 → 전환 버튼 노출 (CONVERTIBLE_STATUS 포함)
  //
  // CONVERTIBLE_STATUS = new Set(['DRAFT', 'ON_HOLD'])
  // ON_HOLD + linkedSlipNo=null → 전환 버튼 노출.
  // ──────────────────────────────────────────────────────────
  test('시나리오 4: ON_HOLD 주문 → 전환 버튼 노출', async ({ page }) => {
    await installAuthMock(page)
    await gotoDetailAndWait(page, HOLD_ORDER_ID)

    const convertBtn = page.getByTestId('partner-order-convert-open')
    await expect(convertBtn).toBeVisible()
    await expect(convertBtn).toBeEnabled()
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 5: CONFIRMED 주문 → 전환 버튼 미노출
  //
  // CONVERTIBLE_STATUS 에 CONFIRMED 미포함.
  // FE: CONVERTIBLE_STATUS.has(query.data.status) === false → 버튼 미렌더.
  // ──────────────────────────────────────────────────────────
  test('시나리오 5: CONFIRMED 주문 → 전환 버튼 미노출', async ({ page }) => {
    await installAuthMock(page)
    await gotoDetailAndWait(page, CONFIRMED_ORDER_ID)

    // CONFIRMED 에는 전환 버튼 없음
    await expect(page.getByTestId('partner-order-convert-open')).toHaveCount(0)

    // 수정·삭제 버튼은 여전히 노출 (MASTER 역할이므로)
    await expect(page.getByTestId('partner-order-edit-open')).toBeVisible()
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 6: linkedSlipNo 있는 주문 → 전환 버튼 미노출
  //
  // FE 조건: query.data.linkedSlipNo == null → false → 버튼 미렌더.
  // ord-linked-slip: status=DRAFT + linkedSlipNo='SL-20260504-001'
  // ──────────────────────────────────────────────────────────
  test('시나리오 6: linkedSlipNo 있는 DRAFT 주문 → 전환 버튼 미노출', async ({ page }) => {
    await installAuthMock(page)
    await gotoDetailAndWait(page, LINKED_SLIP_ORDER_ID)

    await expect(page.getByTestId('partner-order-convert-open')).toHaveCount(0)

    // 연결 전표 필드에 슬립 번호 노출 확인
    await expect(page.getByLabel('연결 전표')).toHaveValue('SL-20260504-001')
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 7: 부분전환 완료 라인 비활성 + 잔여 0 라인 "전환완료" 표시
  //
  // ord-partially-converted:
  //   line-po-001: qty=2, converted=1 → 잔여 1 → input 활성, max=1
  //   line-po-002: qty=3, converted=3 → 잔여 0 → input disabled, "전환완료" 표시
  //
  // 모달 열면 qty-0 (line-po-001) 은 enabled, qty-1 (line-po-002) 는 disabled.
  // ──────────────────────────────────────────────────────────
  test('시나리오 7: 부분전환 완료 라인 — 잔여 0 input disabled / 잔여 1 input 활성', async ({
    page,
  }) => {
    await installAuthMock(page)
    await gotoDetailAndWait(page, PARTIAL_ORDER_ID)
    await openConvertModal(page)

    // line-po-001 (index 0) — 잔여 1 → 활성
    const qty0 = page.getByTestId('partner-order-convert-qty-0')
    await expect(qty0).toBeEnabled()

    // line-po-002 (index 1) — 잔여 0 → disabled + "전환완료" 텍스트
    const qty1 = page.getByTestId('partner-order-convert-qty-1')
    await expect(qty1).toBeDisabled()

    // 모달 본문에 "전환완료" 텍스트 노출
    const modalBody = page.getByTestId('partner-order-convert-modal-body')
    await expect(modalBody).toContainText('전환완료')
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 8: 수량>0 없으면 제출 버튼 disabled
  //
  // FE: Object.values(convertQtyMap).every(q => q <= 0) → disabled.
  // 모달 열기 직후 모든 input 을 0 으로 변경 → 제출 버튼 disabled 확인.
  // ──────────────────────────────────────────────────────────
  test('시나리오 8: 전환수량 모두 0 → 제출 버튼 disabled', async ({ page }) => {
    await installAuthMock(page)
    await gotoDetailAndWait(page, DRAFT_ORDER_ID)
    await openConvertModal(page)

    // 기본값은 잔여 전량으로 채워져 있으므로 0 으로 비우기
    const qtyInput = page.getByTestId('partner-order-convert-qty-0')
    await qtyInput.fill('0')

    // 제출 버튼 disabled 확인
    const submitBtn = page.getByTestId('partner-order-convert-submit')
    await expect(submitBtn).toBeDisabled()
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 9: 409(잔여 초과) mock → 모달 내 에러 피드백
  //
  // mockConvert409=1 → POST 가 409 반환.
  // FE convertMutation.onError: 409 → setConvertErrorMessage → partner-order-convert-modal-error 노출.
  // 모달은 닫히지 않고 에러 배너가 모달 내부에 표시됨.
  // ──────────────────────────────────────────────────────────
  test('시나리오 9: 409 잔여초과 → 모달 내 에러 배너 (partner-order-convert-modal-error)', async ({
    page,
  }) => {
    await installAuthMock(page)
    // mockConvert409=1 → convert-to-slip POST 409 트리거
    await gotoDetailAndWait(page, DRAFT_ORDER_ID, '&mockConvert409=1')
    await openConvertModal(page)

    // 수량 입력 후 제출
    const qtyInput = page.getByTestId('partner-order-convert-qty-0')
    await qtyInput.fill('2')

    // 슬라이스 C: 출고 창고 선택 필수 — 비-placeholder 옵션(index 1) 선택
    const warehouseDiv = page.getByTestId('partner-order-convert-warehouse')
    const warehouseSelect = warehouseDiv.locator('select')
    await warehouseSelect.selectOption({ index: 1 })

    const submitBtn = page.getByTestId('partner-order-convert-submit')
    await expect(submitBtn).toBeEnabled()
    await submitBtn.click()

    // 모달 내부 에러 배너 노출
    const modalError = page.getByTestId('partner-order-convert-modal-error')
    await expect(modalError).toBeVisible({ timeout: 10_000 })
    await expect(modalError).toContainText('잔여 수량을 초과')

    // 모달은 닫히지 않음 (에러 상태이므로)
    await expect(page.getByTestId('partner-order-convert-modal-body')).toBeVisible()

    // 성공 토스트 미노출
    await expect(page.getByTestId('partner-order-convert-toast')).toHaveCount(0)
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 11: 슬라이스 C — 출고 창고 미선택 시 제출 비활성 → 선택 후 전환 성공
  //
  // 검증:
  //   - 수량 입력 후에도 창고 미선택이면 partner-order-convert-submit 이 disabled.
  //   - partner-order-convert-warehouse 내부 select 에서 비-placeholder 옵션 선택 후 submit 이 enabled.
  //   - submit 클릭 → 성공 토스트 (SL-20260530-001 발행 문구).
  // ──────────────────────────────────────────────────────────
  test('시나리오 11: 슬라이스 C — 창고 미선택 시 제출 비활성 → 창고 선택 후 전환 성공', async ({
    page,
  }) => {
    await installAuthMock(page)
    await gotoDetailAndWait(page, DRAFT_ORDER_ID)
    await openConvertModal(page)

    // 수량 입력 (기본값 = 잔여 전량. 1 로 명시 설정)
    const qtyInput = page.getByTestId('partner-order-convert-qty-0')
    await qtyInput.fill('1')

    // 창고 미선택 → 제출 버튼 disabled 확인
    const submitBtn = page.getByTestId('partner-order-convert-submit')
    await expect(submitBtn).toBeDisabled()

    // partner-order-convert-warehouse 내부 select 에서 비-placeholder 옵션 선택 (index 1)
    const warehouseDiv = page.getByTestId('partner-order-convert-warehouse')
    const warehouseSelect = warehouseDiv.locator('select')
    await warehouseSelect.selectOption({ index: 1 })

    // 창고 선택 후 → 제출 버튼 enabled 확인
    await expect(submitBtn).toBeEnabled()

    // 제출 → 성공 토스트
    await submitBtn.click()
    const toast = page.getByTestId('partner-order-convert-toast')
    await expect(toast).toBeVisible({ timeout: 10_000 })
    await expect(toast).toContainText('SL-20260530-001')

    // 모달 닫힘 확인
    await expect(page.getByTestId('partner-order-convert-modal-body')).toHaveCount(0)
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 10: 기존 Phase 2.5 hold/release 기능 회귀 확인
  //
  // Phase 2.6a mock 추가 후 기존 mock 통과 검증.
  // ord-draft: hold 버튼 노출 (DRAFT 상태).
  // ord-hold: release 버튼 노출 (ON_HOLD 상태).
  // ──────────────────────────────────────────────────────────
  test('시나리오 10: 회귀 — Phase 2.5 hold/release 버튼 여전히 노출', async ({ page }) => {
    await installAuthMock(page)

    // DRAFT → hold 버튼 노출
    await gotoDetailAndWait(page, DRAFT_ORDER_ID)
    await expect(page.getByTestId('partner-order-hold')).toBeVisible()

    // ON_HOLD → release 버튼 노출 (신규 페이지 이동)
    await page.goto(detailUrl(HOLD_ORDER_ID), { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('주문서 상세')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('partner-order-release')).toBeVisible()
  })
})
