/**
 * Phase 2.5 — 주문 보류(ON_HOLD) + 상태 필터 Playwright E2E.
 *
 * <h2>검증 대상</h2>
 * <ol>
 *   <li>주문 목록 기본 진입 — statusFilter 기본값 'DRAFT' + DRAFT 행만 표시</li>
 *   <li>상태 필터 '완료'(CONVERTED) 전환 → 완료 행만 표시</li>
 *   <li>상태 필터 '전체' 전환 → 접수·완료·보류 행을 모두 표시</li>
 *   <li>DRAFT 주문 상세 → '보류' 버튼 표시·클릭 → hold POST 호출 → ON_HOLD 상태 반영</li>
 *   <li>ON_HOLD 주문 상세 → '보류 해제' 버튼 표시·클릭 → release POST 호출 → DRAFT 반영</li>
 *   <li>상태 라벨 한글 확인 — '접수' / '완료' / '보류'</li>
 * </ol>
 *
 * <h2>Mock 전략 — VITE_MOCK_MODE=1 (mock.ts Phase 2.5 블록)</h2>
 * <ul>
 *   <li>GET /api/v1/partner-orders?status=DRAFT     → DRAFT 행 1건</li>
 *   <li>GET /api/v1/partner-orders?status=ON_HOLD   → ON_HOLD 행 1건</li>
 *   <li>GET /api/v1/partner-orders?status=CONVERTED → 완료(CONFIRMED) 행 1건</li>
 *   <li>GET /api/v1/partner-orders/{id}             → orderId 별 status 분기
 *       (ord-draft=DRAFT / ord-hold=ON_HOLD)</li>
 *   <li>POST /api/v1/partner-orders/{id}/hold       → ON_HOLD PartnerOrderDetail 반환</li>
 *   <li>POST /api/v1/partner-orders/{id}/release    → DRAFT PartnerOrderDetail 반환</li>
 * </ul>
 *
 * <h2>testid 목록</h2>
 * <ul>
 *   <li>{@code partner-order-list-status-filter}  — 상태 필터 드롭다운 (Select)</li>
 *   <li>{@code partner-order-hold}                — 보류 버튼 (DRAFT 상태일 때만 렌더)</li>
 *   <li>{@code partner-order-release}             — 보류 해제 버튼 (ON_HOLD 상태일 때만 렌더)</li>
 *   <li>{@code partner-order-hold-error}          — 보류/해제 오류 배너 (role=alert)</li>
 * </ul>
 *
 * <h2>UUID 비공개 가드 ([[feedback_uuid_no_user_visibility]])</h2>
 * <p>단언은 orderNumber / partnerCode / partnerName / 한국어 상태 라벨만 사용.
 *
 * <h2>실행 방법</h2>
 * <pre>
 *   cd clients/desktop
 *   # 별도 터미널:
 *   set VITE_MOCK_MODE=1 && npx vite src/renderer --host 127.0.0.1 --port 5174
 *   # 테스트 실행:
 *   set PLAYWRIGHT_SKIP_WEB_SERVER=1 && set AUDIT_BASE_URL=http://127.0.0.1:5174
 *     && npx playwright test playwright/phase-2-5-partner-order-hold --reporter=line
 * </pre>
 */
import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'

// ============================================================
// orderId 상수 — mock.ts Phase 2.5 블록과 1:1 대응
// ============================================================

/** DRAFT 주문 — 보류 버튼 진입점. */
const DRAFT_ORDER_ID = 'ord-draft'
/** ON_HOLD 주문 — 보류 해제 버튼 진입점. */
const HOLD_ORDER_ID = 'ord-hold'

/** 목록 URL — mockRole=MASTER 로 AuthGuard 통과. */
const LIST_URL = `${BASE_URL}/#/sales/partner-orders?mockRole=MASTER`

/** 주문 상세 URL — hash router. */
const detailUrl = (id: string) =>
  `${BASE_URL}/#/sales/partner-orders/${encodeURIComponent(id)}?mockRole=MASTER`

/**
 * window.samhanAuth stub — AuthGuard 통과 + EDIT_ROLES(['SALES','MANAGER','MASTER']) 포함.
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
 * 주문 목록 페이지로 이동하고 테이블 또는 emptyState 가 렌더될 때까지 대기.
 */
async function gotoListAndWait(page: Page): Promise<void> {
  await page.goto(LIST_URL, { waitUntil: 'domcontentloaded' })
  // 상태 필터 드롭다운이 렌더되면 페이지 초기화 완료.
  await expect(page.getByTestId('partner-order-list-status-filter')).toBeVisible({
    timeout: 15_000,
  })
}

/**
 * 주문 상세 페이지로 이동하고 상단 액션 영역이 렌더될 때까지 대기.
 */
async function gotoDetailAndWait(page: Page, orderId: string): Promise<void> {
  await page.goto(detailUrl(orderId), { waitUntil: 'domcontentloaded' })
  // 상세 카드 — 거래처 · 파트너명 포함 card 렌더 대기.
  await expect(page.getByText('주문서 상세')).toBeVisible({ timeout: 15_000 })
}

// ============================================================
// Test Suite
// ============================================================

test.describe('Phase 2.5 주문 보류 + 상태 필터', () => {

  // ──────────────────────────────────────────────────────────
  // 시나리오 1: 목록 기본 진입 — statusFilter 기본값 DRAFT
  //
  // SalesPartnerOrderListPage 는 useState 초기값으로 statusFilter='DRAFT' 를 설정하므로
  // 진입 즉시 ?status=DRAFT 로 listPartnerOrders 를 호출한다.
  // mock.ts 는 status=DRAFT 시 orderNumber='2026/05/04-1', partnerName='엘에이시스템에어'
  // 를 반환한다. 필터 드롭다운 선택값도 '접수'(DRAFT 라벨) 이어야 한다.
  // ──────────────────────────────────────────────────────────
  test('시나리오 1: 목록 기본 진입 — 상태 필터 드롭다운 기본값 접수(DRAFT) + DRAFT 행 표시', async ({
    page,
  }) => {
    await installAuthMock(page)
    await gotoListAndWait(page)

    const statusFilter = page.getByTestId('partner-order-list-status-filter')

    // 드롭다운 기본 선택값 확인 — value='DRAFT'
    await expect(statusFilter).toHaveValue('DRAFT')

    // 테이블에 DRAFT 행 표시 — orderNumber '2026/05/04-1' 포함
    await expect(page.getByRole('table')).toBeVisible()
    await expect(page.getByRole('table')).toContainText('2026/05/04-1')

    // 상태 배지 라벨 — '접수' (DRAFT 라벨)
    await expect(page.getByRole('table')).toContainText('접수')

    // ON_HOLD 행 미노출 — DRAFT 필터이므로 보류 행 없음
    await expect(page.getByRole('table')).not.toContainText('보류')
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 2: 상태 필터 '완료'(CONVERTED) 전환 → 완료 행 표시
  //
  // mock.ts status=CONFIRMED → orderNumber='2026/05/03-1', partnerName='한빛쾌적',
  // linkedSlipNo='2026/05/03-1' 반환.
  // ──────────────────────────────────────────────────────────
  test('시나리오 2: 상태 필터 "완료"(CONVERTED) 전환 → 완료 행 표시', async ({
    page,
  }) => {
    await installAuthMock(page)
    await gotoListAndWait(page)

    const statusFilter = page.getByTestId('partner-order-list-status-filter')

    // 실제 화면의 완료 필터 값(CONVERTED)을 선택한다.
    await statusFilter.selectOption('CONVERTED')
    await expect(statusFilter).toHaveValue('CONVERTED')

    // 완료 행 렌더 대기 — '완료' 라벨 포함
    await expect(page.getByRole('table')).toContainText('완료', { timeout: 10_000 })

    // CONFIRMED 행 orderNumber / partnerName 확인
    await expect(page.getByRole('table')).toContainText('2026/05/03-1')
    await expect(page.getByRole('table')).toContainText('한빛쾌적')

    // linkedSlipNo 표시
    await expect(page.getByRole('table')).toContainText('2026/05/03-1')

    // DRAFT 행(엘에이시스템에어 2026/05/04-1) 미노출
    await expect(page.getByRole('table')).not.toContainText('엘에이시스템에어')
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 3: 상태 필터 '전체' 전환 → 접수·완료·보류 행 표시
  //
  // mock.ts status=ON_HOLD → orderNumber='2026/05/05-2', partnerName='강남에어솔루션' 반환.
  // ──────────────────────────────────────────────────────────
  test('시나리오 3: 상태 필터 "전체" 전환 → 접수·완료·보류 행 표시', async ({
    page,
  }) => {
    await installAuthMock(page)
    await gotoListAndWait(page)

    const statusFilter = page.getByTestId('partner-order-list-status-filter')

    // 보류는 독립 필터가 아니라 전체 목록에서 관측한다.
    await statusFilter.selectOption('')
    await expect(statusFilter).toHaveValue('')

    // 전체 목록에는 ON_HOLD 행이 포함된다.
    await expect(page.getByRole('table')).toContainText('보류', { timeout: 10_000 })

    // ON_HOLD 행 orderNumber / partnerName 확인
    await expect(page.getByRole('table')).toContainText('2026/05/05-2')
    await expect(page.getByRole('table')).toContainText('강남에어솔루션')

    await expect(page.getByRole('table')).toContainText('접수')
    await expect(page.getByRole('table')).toContainText('완료')
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 4: DRAFT 주문 상세 → '보류' 버튼 표시 · 클릭 → ON_HOLD 반영
  //
  // ord-draft → mock status=DRAFT → '보류' 버튼(data-testid='partner-order-hold') 노출.
  // 클릭 → POST /api/v1/partner-orders/ord-draft/hold → ON_HOLD PartnerOrderDetail 반환.
  // 성공 후: '보류 해제' 버튼 노출, '보류' 버튼 사라짐 (status=ON_HOLD 분기).
  // ──────────────────────────────────────────────────────────
  test('시나리오 4: DRAFT 주문 상세 → "보류" 버튼 클릭 → hold POST → ON_HOLD 반영', async ({
    page,
  }) => {
    await installAuthMock(page)
    await gotoDetailAndWait(page, DRAFT_ORDER_ID)

    // DRAFT 상태 → '보류' 버튼 노출
    const holdBtn = page.getByTestId('partner-order-hold')
    await expect(holdBtn).toBeVisible()
    await expect(holdBtn).toBeEnabled()

    // '보류 해제' 버튼은 아직 미노출 (DRAFT 이므로)
    await expect(page.getByTestId('partner-order-release')).toHaveCount(0)

    // POST /hold 클릭
    await holdBtn.click()

    // 성공 응답 후 — queryClient.setQueryData 로 상태 즉시 갱신 (refetch 불필요).
    // ON_HOLD 가 되면 '보류 해제' 버튼 노출, '보류' 버튼 소멸.
    await expect(page.getByTestId('partner-order-release')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('partner-order-hold')).toHaveCount(0)

    // 상태 배지 '보류' 로 갱신 확인 — 상세 카드 헤더 badge
    await expect(page.getByText('보류').first()).toBeVisible()

    // 오류 배너 미노출 (정상 응답)
    await expect(page.getByTestId('partner-order-hold-error')).toHaveCount(0)
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 5: ON_HOLD 주문 상세 → '보류 해제' 버튼 · 클릭 → DRAFT 반영
  //
  // ord-hold → mock status=ON_HOLD → '보류 해제' 버튼(data-testid='partner-order-release') 노출.
  // 클릭 → POST /api/v1/partner-orders/ord-hold/release → DRAFT PartnerOrderDetail 반환.
  // 성공 후: '보류' 버튼 노출, '보류 해제' 버튼 사라짐 (status=DRAFT 분기).
  // ──────────────────────────────────────────────────────────
  test('시나리오 5: ON_HOLD 주문 상세 → "보류 해제" 버튼 클릭 → release POST → DRAFT 반영', async ({
    page,
  }) => {
    await installAuthMock(page)
    await gotoDetailAndWait(page, HOLD_ORDER_ID)

    // ON_HOLD 상태 → '보류 해제' 버튼 노출
    const releaseBtn = page.getByTestId('partner-order-release')
    await expect(releaseBtn).toBeVisible()
    await expect(releaseBtn).toBeEnabled()

    // '보류' 버튼은 아직 미노출 (ON_HOLD 이므로)
    await expect(page.getByTestId('partner-order-hold')).toHaveCount(0)

    // POST /release 클릭
    await releaseBtn.click()

    // 성공 응답 후 — DRAFT 가 되면 '보류' 버튼 노출, '보류 해제' 버튼 소멸.
    await expect(page.getByTestId('partner-order-hold')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('partner-order-release')).toHaveCount(0)

    // 상태 배지 '접수' 로 갱신 확인
    await expect(page.getByText('접수').first()).toBeVisible()

    // 오류 배너 미노출
    await expect(page.getByTestId('partner-order-hold-error')).toHaveCount(0)
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 6: 상태 라벨 한글 표기 확인
  //
  // PARTNER_ORDER_STATUS_LABEL 매핑:
  //   DRAFT     → '접수'
  //   ON_HOLD   → '보류'
  //   CONFIRMED → '완료'
  //
  // 목록에서 세 상태를 각각 필터링하여 라벨이 한국어로 정상 표시되는지 검증.
  // ──────────────────────────────────────────────────────────
  test('시나리오 6: 상태 라벨 한글 확인 — 접수/완료/보류 배지 노출', async ({ page }) => {
    await installAuthMock(page)
    await gotoListAndWait(page)

    const statusFilter = page.getByTestId('partner-order-list-status-filter')

    // ① DRAFT 필터 → '접수' 배지
    await statusFilter.selectOption('DRAFT')
    await expect(page.getByRole('table')).toContainText('접수', { timeout: 10_000 })
    await expect(page.getByRole('table')).not.toContainText('완료')

    // ② CONVERTED 필터 → '완료' 배지
    await statusFilter.selectOption('CONVERTED')
    await expect(page.getByRole('table')).toContainText('완료', { timeout: 10_000 })
    await expect(page.getByRole('table')).not.toContainText('접수')

    // ③ 전체 필터 → '보류' 배지
    await statusFilter.selectOption('')
    await expect(page.getByRole('table')).toContainText('보류', { timeout: 10_000 })
    await expect(page.getByRole('table')).toContainText('접수')
    await expect(page.getByRole('table')).toContainText('완료')
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 7: 보류 409 오류 — 오류 배너 표시 (mockHold409 쿼리 파라미터)
  //
  // DRAFT 가 아닌 상태에서 /hold 를 호출하면 BE 가 409 응답.
  // FE 는 holdMutation.onError 에서 holdErrorMessage 를 세팅하고
  // data-testid='partner-order-hold-error' 배너를 노출한다.
  // mock.ts 는 ?mockHold409=1 쿼리 파라미터 시 409 를 반환.
  // ──────────────────────────────────────────────────────────
  test('시나리오 7: 보류 409 오류 → "접수(DRAFT) 상태인 주문서만 보류" 오류 배너', async ({
    page,
  }) => {
    await installAuthMock(page)
    // ord-draft 상세 진입 + mockHold409=1 → hold POST 409 트리거
    await page.goto(
      `${BASE_URL}/#/sales/partner-orders/${encodeURIComponent(DRAFT_ORDER_ID)}?mockRole=MASTER&mockHold409=1`,
      { waitUntil: 'domcontentloaded' },
    )
    await expect(page.getByText('주문서 상세')).toBeVisible({ timeout: 15_000 })

    // DRAFT 상태이므로 '보류' 버튼 노출
    const holdBtn = page.getByTestId('partner-order-hold')
    await expect(holdBtn).toBeVisible()
    await holdBtn.click()

    // 오류 배너 노출 — '접수(DRAFT)' 문구 포함
    const errorBanner = page.getByTestId('partner-order-hold-error')
    await expect(errorBanner).toBeVisible({ timeout: 10_000 })
    await expect(errorBanner).toContainText('접수')
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 8: 보류 해제 409 오류 — 오류 배너 표시 (mockRelease409 쿼리 파라미터)
  //
  // ON_HOLD 가 아닌 상태에서 /release 를 호출하면 BE 가 409 응답.
  // FE 는 releaseMutation.onError 에서 holdErrorMessage 세팅 →
  // data-testid='partner-order-hold-error' 배너 노출.
  // ──────────────────────────────────────────────────────────
  test('시나리오 8: 보류 해제 409 오류 → "보류(ON_HOLD) 상태인 주문서만 해제" 오류 배너', async ({
    page,
  }) => {
    await installAuthMock(page)
    // ord-hold 상세 진입 + mockRelease409=1 → release POST 409 트리거
    await page.goto(
      `${BASE_URL}/#/sales/partner-orders/${encodeURIComponent(HOLD_ORDER_ID)}?mockRole=MASTER&mockRelease409=1`,
      { waitUntil: 'domcontentloaded' },
    )
    await expect(page.getByText('주문서 상세')).toBeVisible({ timeout: 15_000 })

    // ON_HOLD 상태이므로 '보류 해제' 버튼 노출
    const releaseBtn = page.getByTestId('partner-order-release')
    await expect(releaseBtn).toBeVisible()
    await releaseBtn.click()

    // 오류 배너 노출 — '보류(ON_HOLD)' 문구 포함
    const errorBanner = page.getByTestId('partner-order-hold-error')
    await expect(errorBanner).toBeVisible({ timeout: 10_000 })
    await expect(errorBanner).toContainText('보류')
  })
})
