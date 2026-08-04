/**
 * Phase 2.6c — 재고 예약(reserve) 모델 FE Playwright E2E.
 *
 * <h2>검증 대상</h2>
 * <ol>
 *   <li>재고 현황 화면 (`/inventory/stock-balance`) — 가용/실재고/예약 3구분 컬럼 표시</li>
 *   <li>창고 필터 + 조회 버튼 → DataGrid 갱신</li>
 *   <li>DRAFT 주문 → 출고전표 전환 시도 → 재고 부족 409 → 모달 내 에러 메시지 표시
 *       (BE message 그대로 노출 — 품목명/수량 위주, UUID 미포함)</li>
 *   <li>재고 부족 에러 후 모달 닫히지 않음 + 성공 토스트 미노출</li>
 *   <li>재고 부족 에러 후 모달 닫기 → 모달 닫힘 + 에러 클리어</li>
 *   <li>정상 전환 성공 → 기존 2.6a 성공 경로 회귀 (슬립번호 토스트 노출)</li>
 *   <li>UUID 비공개 가드: 에러 메시지/화면에 UUID 패턴 미포함 확인</li>
 * </ol>
 *
 * <h2>Mock 전략 — VITE_MOCK_MODE=1 (mock.ts Phase 2.6c 블록)</h2>
 * <ul>
 *   <li>GET /inventory/balances          → mock 9행 (가용/예약/실재고 구분)</li>
 *   <li>GET /api/v1/partner-orders/ord-draft → DRAFT, linkedSlipNo=null, convertedQuantity=0</li>
 *   <li>POST /api/v1/partner-orders/{id}/convert-to-slip
 *       mockConvertInventory409=1 → 409 ("재고 부족: 실외기(AJ040RXH4BC1) 요청 2, 가용 0")
 *       기본                     → 성공 { slipNo:'2026/05/30-1', fullyConverted:false }</li>
 * </ul>
 *
 * <h2>no-fake-data 원칙 ([[feedback_no_fake_data_ever]])</h2>
 * <p>본 spec 은 VITE_MOCK_MODE=1 환경에서 Playwright 컴포넌트 회귀 검증 전용.
 * QA 증빙 스크린샷은 실서버 Docker 환경에서 PM 이 별도 수행. mock 캡처 금지.
 *
 * <h2>testid 목록 (기존 2.6a testid 재사용)</h2>
 * <ul>
 *   <li>{@code partner-order-convert-open}        — "출고전표 전환" 버튼</li>
 *   <li>{@code partner-order-convert-modal-body}  — 모달 본문</li>
 *   <li>{@code partner-order-convert-qty-0}       — 라인 전환수량 input</li>
 *   <li>{@code partner-order-convert-submit}      — 전환 제출 버튼</li>
 *   <li>{@code partner-order-convert-modal-error} — 모달 내 에러 배너 (role=alert)</li>
 *   <li>{@code partner-order-convert-toast}       — 성공 토스트 (role=status)</li>
 *   <li>{@code partner-order-convert-error}       — 페이지 레벨 에러 배너 (role=alert)</li>
 * </ul>
 *
 * <h2>UUID 비공개 가드 ([[feedback_uuid_no_user_visibility]])</h2>
 * <p>단언은 품목명/수량 포함 한국어 메시지만 검증. UUID 패턴(\b[0-9a-f]{8}-...\b) 미포함 확인.
 *
 * <h2>실 QA는 Docker 실행 환경에서 PM 수행 ([[no-fake-data-ever]])</h2>
 * <p>본 spec 은 VITE_MOCK_MODE=1 환경에서 컴포넌트 레벨 검증만 수행.
 * 실 inventory_db stock 차감 row 증빙은 Docker 실 QA (Task 8) 에서 별도 캡처.
 *
 * <h2>실행 방법</h2>
 * <pre>
 *   cd clients/desktop
 *   # 별도 터미널:
 *   set VITE_MOCK_MODE=1 && npx vite src/renderer --host 127.0.0.1 --port 5174
 *   # 테스트 실행:
 *   set PLAYWRIGHT_SKIP_WEB_SERVER=1 && set AUDIT_BASE_URL=http://127.0.0.1:5174
 *     && npx playwright test playwright/phase-2-6c-inventory-deduction --reporter=line
 * </pre>
 */
import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'

/** DRAFT 주문 — 전환 버튼 노출 진입점 (mock.ts Phase 2.6a/2.6c 공용). */
const DRAFT_ORDER_ID = 'ord-draft'

/** UUID 정규식 — 에러 메시지 노출 가드. */
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i

/** 주문 상세 URL — hash router. */
const detailUrl = (id: string, extra = '') =>
  `${BASE_URL}/#/sales/partner-orders/${encodeURIComponent(id)}?mockRole=MASTER${extra}`

/**
 * window.samhanAuth stub — AuthGuard 통과 + CONVERT_ROLES(['SALES','MANAGER','MASTER']) 포함.
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
 * 전환 버튼 클릭 → 모달 본문이 보일 때까지 대기 → 출고 창고 선택(submit 활성 precondition).
 *
 * <p>Phase 2.6a 부분전환으로 전환 모달은 출고 창고(WarehouseAutocomplete) 선택 + 라인 qty>0 둘 다
 * 충족해야 submit 이 활성된다. 모든 시나리오의 공통 precondition 이므로 헬퍼에서 창고를 선택한다.
 * WarehouseAutocomplete 는 combobox 입력 + role=option 드롭다운 — 코드로 필터 후 옵션 클릭.
 */
async function openConvertModal(page: Page): Promise<void> {
  const convertBtn = page.getByTestId('partner-order-convert-open')
  await expect(convertBtn).toBeVisible({ timeout: 10_000 })
  await expect(convertBtn).toBeEnabled()
  await convertBtn.click()
  await expect(page.getByTestId('partner-order-convert-modal-body')).toBeVisible({ timeout: 10_000 })

  // 출고 창고 선택(HQ-001 본사창고) — WarehouseAutocomplete combobox 입력 후 옵션 클릭.
  const whInput = page.locator('[data-testid="partner-order-convert-warehouse"] input[role="combobox"]')
  await expect(whInput).toBeVisible({ timeout: 10_000 })
  await whInput.fill('HQ-001')
  const whOption = page.locator('[role="option"]').filter({ hasText: 'HQ-001' }).first()
  await expect(whOption, '출고 창고 옵션(HQ-001) 미표시 — WarehouseAutocomplete 후보 필요').toBeVisible({ timeout: 5_000 })
  await whOption.click()
}

// ============================================================
// Test Suite
// ============================================================

test.describe('Phase 2.6c 재고 부족 전환 사전차단', () => {

  // ──────────────────────────────────────────────────────────
  // 시나리오 1: 재고 부족 전환 시도 → 모달 내 에러 메시지 표시
  //
  // mockConvertInventory409=1 → POST 가 409 반환.
  // BE message: "재고 부족: 실외기(AJ040RXH4BC1) 요청 2, 가용 0"
  // FE: convertMutation.onError → 409 → setConvertErrorMessage(message)
  //     → partner-order-convert-modal-error 배너 렌더.
  // ──────────────────────────────────────────────────────────
  test('시나리오 1: 재고 부족 409 → 모달 내 에러 배너에 BE 메시지 표시', async ({ page }) => {
    await installAuthMock(page)
    await gotoDetailAndWait(page, DRAFT_ORDER_ID, '&mockConvertInventory409=1')
    await openConvertModal(page)

    // 수량 입력 후 제출
    const qtyInput = page.getByTestId('partner-order-convert-qty-0')
    await qtyInput.fill('2')

    const submitBtn = page.getByTestId('partner-order-convert-submit')
    await expect(submitBtn).toBeEnabled()
    await submitBtn.click()

    // 모달 내 에러 배너 노출
    const modalError = page.getByTestId('partner-order-convert-modal-error')
    await expect(modalError).toBeVisible({ timeout: 10_000 })

    // BE 메시지 포함 확인 — 품목명/수량 위주
    await expect(modalError).toContainText('재고 부족')
    await expect(modalError).toContainText('요청 2')
    await expect(modalError).toContainText('가용 0')

    // UUID 비공개 가드 — 에러 메시지에 UUID 패턴 미포함
    const errorText = await modalError.innerText()
    expect(UUID_PATTERN.test(errorText)).toBe(false)
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 2: 재고 부족 에러 후 모달 미닫힘 + 성공 토스트 미노출
  //
  // 재고 부족 에러는 모달을 닫지 않음 — 사용자가 수량을 수정하거나 취소 가능.
  // ──────────────────────────────────────────────────────────
  test('시나리오 2: 재고 부족 에러 후 모달 미닫힘 + 성공 토스트 미노출', async ({ page }) => {
    await installAuthMock(page)
    await gotoDetailAndWait(page, DRAFT_ORDER_ID, '&mockConvertInventory409=1')
    await openConvertModal(page)

    const qtyInput = page.getByTestId('partner-order-convert-qty-0')
    await qtyInput.fill('2')

    await page.getByTestId('partner-order-convert-submit').click()

    // 에러 배너 대기
    await expect(page.getByTestId('partner-order-convert-modal-error')).toBeVisible({ timeout: 10_000 })

    // 모달은 닫히지 않음
    await expect(page.getByTestId('partner-order-convert-modal-body')).toBeVisible()

    // 성공 토스트 미노출
    await expect(page.getByTestId('partner-order-convert-toast')).toHaveCount(0)
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 3: 재고 부족 에러 후 모달 취소 → 모달 닫힘 + 에러 배너 클리어
  //
  // 취소 버튼 onError → setConvertOpen(false) + setConvertErrorMessage(null).
  // 모달 닫힘 + 페이지 레벨 에러 배너도 미노출(클리어됨) 확인.
  // ──────────────────────────────────────────────────────────
  test('시나리오 3: 재고 부족 에러 후 모달 취소 → 모달 닫힘 + 에러 클리어', async ({ page }) => {
    await installAuthMock(page)
    await gotoDetailAndWait(page, DRAFT_ORDER_ID, '&mockConvertInventory409=1')
    await openConvertModal(page)

    const qtyInput = page.getByTestId('partner-order-convert-qty-0')
    await qtyInput.fill('2')

    await page.getByTestId('partner-order-convert-submit').click()

    // 에러 배너 확인 후 모달 취소 클릭
    await expect(page.getByTestId('partner-order-convert-modal-error')).toBeVisible({ timeout: 10_000 })

    // 모달 취소 버튼 클릭 (text: "취소")
    await page.getByRole('button', { name: '취소' }).click()

    // 모달 닫힘 확인
    await expect(page.getByTestId('partner-order-convert-modal-body')).toHaveCount(0)

    // 취소 시 convertErrorMessage 클리어 → 페이지 레벨 에러 배너 미노출
    await expect(page.getByTestId('partner-order-convert-error')).toHaveCount(0)
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 4: 정상 전환 성공 — 기존 2.6a 성공 경로 회귀
  //
  // 재고 부족 mock 없음 → 전환 성공 → slipNo 포함 성공 토스트 노출.
  // 2.6c 구현으로 기존 성공 경로가 회귀하지 않음을 확인.
  // ──────────────────────────────────────────────────────────
  test('시나리오 4: 정상 전환 성공 → 성공 토스트 (2.6a 회귀 확인)', async ({ page }) => {
    await installAuthMock(page)
    await gotoDetailAndWait(page, DRAFT_ORDER_ID)
    await openConvertModal(page)

    const qtyInput = page.getByTestId('partner-order-convert-qty-0')
    await qtyInput.fill('1')

    const submitBtn = page.getByTestId('partner-order-convert-submit')
    await expect(submitBtn).toBeEnabled()
    await submitBtn.click()

    // 성공 토스트 노출 — slipNo 포함
    const toast = page.getByTestId('partner-order-convert-toast')
    await expect(toast).toBeVisible({ timeout: 10_000 })
    await expect(toast).toContainText('2026/05/30-1')

    // 모달 닫힘 확인
    await expect(page.getByTestId('partner-order-convert-modal-body')).toHaveCount(0)

    // 에러 배너 미노출
    await expect(page.getByTestId('partner-order-convert-error')).toHaveCount(0)
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 5: UUID 비공개 가드 — 성공 토스트에 UUID 미포함
  //
  // 성공 응답의 slipNo 는 '2026/05/30-1' 형식(UUID 아님).
  // [[feedback_uuid_no_user_visibility]] 준수 확인.
  // ──────────────────────────────────────────────────────────
  test('시나리오 5: 성공 토스트 UUID 미포함 가드', async ({ page }) => {
    await installAuthMock(page)
    await gotoDetailAndWait(page, DRAFT_ORDER_ID)
    await openConvertModal(page)

    const qtyInput = page.getByTestId('partner-order-convert-qty-0')
    await qtyInput.fill('1')

    await page.getByTestId('partner-order-convert-submit').click()

    const toast = page.getByTestId('partner-order-convert-toast')
    await expect(toast).toBeVisible({ timeout: 10_000 })

    const toastText = await toast.innerText()
    expect(UUID_PATTERN.test(toastText)).toBe(false)
  })
})

// ============================================================
// 재고 현황 화면 — 가용/실재고/예약 3구분 표시
// ============================================================

test.describe('재고 현황 화면 (/inventory/stock-balance)', () => {
  async function gotoStockBalance(page: Page): Promise<void> {
    await page.goto(`${BASE_URL}/#/inventory/stock-balance?mockRole=MASTER`, {
      waitUntil: 'domcontentloaded',
    })
    // 재고 현황 헤더 대기 — "재고 현황" 은 사이드바/페이지 제목/h3/빈상태 셀 등 다수 매칭(strict 위반)이므로
    // 페이지 제목 testid 로 한정한다.
    await expect(page.getByTestId('header-page-title')).toHaveText('재고 현황', { timeout: 12_000 })
  }

  // ──────────────────────────────────────────────────────────
  // 시나리오 6: 재고 현황 화면 — 3구분 컬럼 표시
  //
  // 조회 버튼 클릭 → DataGrid 에 가용재고/예약재고/실재고 컬럼 헤더 표시.
  // Phase 2.6c 핵심 신규 요구.
  // ──────────────────────────────────────────────────────────
  test('시나리오 6: 조회 후 DataGrid에 가용재고/예약재고/실재고 컬럼 표시', async ({ page }) => {
    await installAuthMock(page)
    await gotoStockBalance(page)

    const queryBtn = page.getByTestId('inventory-balance-query-button')
    await expect(queryBtn).toBeVisible({ timeout: 6000 })
    await queryBtn.click()

    const grid = page.getByTestId('inventory-balance-grid')
    await expect(grid).toBeVisible({ timeout: 8000 })

    // 3구분 컬럼 헤더 — 업무 용어 확인
    await expect(grid.getByText('가용재고')).toBeVisible()
    await expect(grid.getByText('예약재고')).toBeVisible()
    await expect(grid.getByText('실재고')).toBeVisible()
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 7: UUID 비공개 가드 — 재고 현황 화면에 UUID 미노출
  //
  // productCode/productName/warehouseCode/warehouseName 만 노출.
  // [[feedback_uuid_no_user_visibility]] 준수 확인.
  // ──────────────────────────────────────────────────────────
  test('시나리오 7: 재고 현황 화면 UUID 비공개 가드', async ({ page }) => {
    await installAuthMock(page)
    await gotoStockBalance(page)

    await page.getByTestId('inventory-balance-query-button').click()
    await page.getByTestId('inventory-balance-grid').waitFor({ state: 'visible', timeout: 8000 })

    // UUID 패턴이 페이지 텍스트에 없어야 함
    const pageText = await page.locator('[data-testid="inventory-balance-grid"]').innerText()
    expect(UUID_PATTERN.test(pageText)).toBe(false)

    // 비즈니스 식별자 노출 확인
    const grid = page.getByTestId('inventory-balance-grid')
    await expect(grid).toContainText('AJ040RXH4BC1')   // productCode
    await expect(grid).toContainText('시스템에어컨')     // productName 포함
    await expect(grid).toContainText('HQ-001')          // warehouseCode
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 8: 가용재고 0 품목 — 하단 요약에 경고 카운트 표시
  //
  // mock 데이터: AJ100NCDKH HQ-001 availableQty=0, reservedQty=2, totalQty=2.
  // 하단 요약에 "가용재고 0 품목" 텍스트 확인.
  // ──────────────────────────────────────────────────────────
  test('시나리오 8: 가용재고 0 품목 — 하단 요약 경고 표시', async ({ page }) => {
    await installAuthMock(page)
    await gotoStockBalance(page)

    await page.getByTestId('inventory-balance-query-button').click()

    const summary = page.getByTestId('inventory-balance-summary')
    await expect(summary).toBeVisible({ timeout: 8000 })
    await expect(summary).toContainText('가용재고 0 품목')
    await expect(summary).toContainText('전환 불가')
  })

  test('시나리오 9: VIRTUAL 수량 Ctrl+C — 화면 표시값(—) 복사', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: BASE_URL,
    })
    await installAuthMock(page)
    await gotoStockBalance(page)

    await page.getByTestId('inventory-balance-query-button').click()
    const grid = page.getByTestId('inventory-balance-grid')
    await expect(grid).toBeVisible({ timeout: 8000 })

    const virtualRow = grid.locator('tbody tr').filter({ hasText: 'VR-001' })
    await expect(virtualRow, 'VIRTUAL 창고 mock 행 미표시').toHaveCount(1)
    const quantityCells = virtualRow.locator('td')
    await expect(quantityCells.nth(5)).toHaveText('—')
    await expect(quantityCells.nth(6)).toHaveText('—')
    await expect(quantityCells.nth(7)).toHaveText('—')

    await quantityCells.nth(5).click()
    await quantityCells.nth(7).click({ modifiers: ['Shift'] })
    await page.keyboard.press('Control+c')

    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()), {
        message: 'VIRTUAL 수량 Ctrl+C 결과 미도착',
        timeout: 5000,
      })
      .toBe('—\t—\t—')
  })
})
