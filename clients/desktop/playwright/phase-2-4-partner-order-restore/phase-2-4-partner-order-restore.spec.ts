/**
 * Phase 2.4 Task 11 — 거래처 주문(Partner-Order) 버전이력 + 복원 Playwright E2E.
 *
 * 검증 대상: {@code PartnerOrderVersionHistoryPanel} (주문 상세 `/sales/partner-orders/:id` 하단 패널) 의
 *   1) 버전이력 목록 렌더 — CREATE/EDIT/RESTORE 배지 + changeSummary + actorName
 *   2) DRAFT 주문 — 복원 버튼 활성 → DS Modal confirm → 복원 호출 → 성공 toast
 *   3) DRAFT 복원 (slipResyncRequired=false) — 경고 배너 미노출
 *   4) CONFIRMED 주문 — 복원 성공 후 slipResyncRequired=true → 경고 toast 노출
 *   4a) CONFIRMING 주문 — 복원 버튼 비활성 + "확정 처리 중" 안내
 *   4b) CANCELED 주문 — 복원 버튼 비활성 + "취소된 주문" 안내
 *   5) actorName UUID 미노출 — UUID 패턴 문자열은 화면에서 마스킹
 *   6) DELETE revision — 버전이력 목록에 "삭제" 배지 표시
 *
 * <h2>Mock 전략 — mock.ts fixture (VITE_MOCK_MODE=1)</h2>
 * <p>desktop 클라이언트는 {@code VITE_MOCK_MODE=1} 일 때 axios request interceptor 가
 * {@code getMockResponse()} 로 백엔드 호출을 fixture 로 대체한다(실 HTTP 미발생).
 * 본 spec 의 모든 endpoint —
 * {@code GET /api/v1/partner-orders/{id}} /
 * {@code GET /api/v1/partner-orders/{id}/revisions} /
 * {@code POST /api/v1/partner-orders/{id}/revisions/{n}/restore} — 는
 * mock.ts 의 Phase 2.4 블록이 응답한다. orderId 에 따라 status 분기:
 *   - {@code ord-draft}      → DRAFT   (복원 가능)
 *   - {@code ord-confirmed}  → CONFIRMED (복원 시 slipResyncRequired=true)
 *   - {@code ord-confirming} → CONFIRMING (복원 버튼 비활성)
 *   - {@code ord-canceled}   → CANCELED  (복원 버튼 비활성)
 * revisions fixture 는 기본 3건(rev3 RESTORE, rev2 EDIT, rev1 CREATE) 공통 응답.
 * {@code ord-delete-history} 의 경우 rev4(DELETE) 를 추가로 반환한다(시나리오 6).
 *
 * <h2>UUID 비공개 가드 ([[uuid-no-user-visibility]])</h2>
 * <p>화면 단언은 actorName / orderNo / 배지·변경요약 텍스트만 사용한다.
 * UUID 패턴({@code UUID_RE}) 문자열은 {@code displayActor()} 가 null 로 마스킹 → 화면 미노출.
 *
 * <h2>실행 방법</h2>
 * <pre>
 *   cd clients/desktop
 *   # 별도 터미널:
 *   set VITE_MOCK_MODE=1 && npx vite src/renderer --host 127.0.0.1 --port 5174
 *   # 테스트 실행:
 *   set PLAYWRIGHT_SKIP_WEB_SERVER=1 && set AUDIT_BASE_URL=http://127.0.0.1:5174
 *     && npx playwright test playwright/phase-2-4-partner-order-restore --reporter=line
 * </pre>
 *
 * <p>Windows 환경 / Docker Desktop npipe 한계로 Vite 가동 불가 시 CI 환경(Linux Docker) 에서
 * 실행 ([[feedback_testcontainers_windows_docker]]).
 */
import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'

// ============================================================
// orderId 별 mock 응답 분기 (mock.ts Phase 2.4 블록 참조)
// ============================================================

/** DRAFT 주문 — 복원 가능. restore 응답 slipResyncRequired=false. */
const DRAFT_ORDER_ID = 'ord-draft'
/** CONFIRMED 주문 — 복원 가능 (slipResyncRequired=true). */
const CONFIRMED_ORDER_ID = 'ord-confirmed'
/** CONFIRMING 주문 — 복원 버튼 비활성 + 안내 문구. */
const CONFIRMING_ORDER_ID = 'ord-confirming'
/** CANCELED 주문 — 복원 버튼 비활성 + 안내 문구. */
const CANCELED_ORDER_ID = 'ord-canceled'
/** DELETE 이력 포함 주문 — DELETE 배지('삭제') 표시 검증용. */
const DELETE_HISTORY_ORDER_ID = 'ord-delete-history'

/** 주문 상세 URL — hash router, mockRole=MASTER 로 동적 권한 bypass. */
const detailUrl = (id: string) =>
  `${BASE_URL}/#/sales/partner-orders/${encodeURIComponent(id)}?mockRole=MASTER`

/**
 * window.samhanAuth stub — AuthGuard 통과용 (estimate/partner-version-history.spec 패턴 동일).
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
 * 주문 상세 페이지로 이동하고 버전이력 패널이 렌더될 때까지 대기한다.
 * 패널은 주문 상세 카드 하단에 항상 배치되므로 orderId 로 바로 진입.
 */
async function gotoDetailAndWaitForPanel(page: Page, orderId: string): Promise<void> {
  await page.goto(detailUrl(orderId), { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('partner-order-version-history-panel')).toBeVisible({
    timeout: 15_000,
  })
  await page.getByTestId('partner-order-version-history-open').click()
}

// ============================================================
// Test Suite
// ============================================================

test.describe('Phase 2.4 거래처 주문 버전이력 + 복원', () => {
  // ──────────────────────────────────────────────────────────
  // 시나리오 1: 버전이력 패널 렌더 + revision 목록 표시
  // ──────────────────────────────────────────────────────────
  test('시나리오 1: 버전이력 3건 렌더 — CREATE/EDIT/RESTORE 배지 + changeSummary + actorName', async ({
    page,
  }) => {
    await installAuthMock(page)
    await gotoDetailAndWaitForPanel(page, DRAFT_ORDER_ID)

    // 목록 컨테이너
    const historyList = page.getByTestId('partner-order-version-history-list')
    await expect(historyList).toBeVisible()

    // rev3 (RESTORE), rev2 (EDIT), rev1 (CREATE) 행 전부 존재
    const row3 = page.getByTestId('partner-order-version-history-row-3')
    const row2 = page.getByTestId('partner-order-version-history-row-2')
    const row1 = page.getByTestId('partner-order-version-history-row-1')
    await expect(row3).toBeVisible()
    await expect(row2).toBeVisible()
    await expect(row1).toBeVisible()

    // rev3 — '복원' 배지 + RESTORE source 표시 "(버전 1)" (#31 이력 일원화 — 용어 통일 rev N→버전 N)
    await expect(row3).toContainText('복원')
    await expect(row3).toContainText('버전 1')

    // rev2 — '수정' 배지 + changeSummary (헤더 1 · 라인 +1)
    await expect(row2).toContainText('수정')
    await expect(row2).toContainText('헤더 1')
    await expect(row2).toContainText('+1')

    // rev1 — '생성' 배지 + "변경 없음"
    await expect(row1).toContainText('생성')
    await expect(row1).toContainText('변경 없음')

    // actorName '오병승' 표시 (UUID 아님 → 마스킹 없음)
    await expect(historyList).toContainText('오병승')

    // 최신(rev3)은 복원 버튼 미노출 — 현재 상태이므로 복원 불필요
    await expect(
      page.getByTestId('partner-order-version-history-restore-button-3'),
    ).toHaveCount(0)
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 2: DRAFT 주문 — 복원 → confirm → 성공 toast (slipResyncRequired=false)
  // ──────────────────────────────────────────────────────────
  test('시나리오 2: DRAFT 주문 복원 버튼 활성 → Modal confirm → 복원 성공 toast', async ({
    page,
  }) => {
    await installAuthMock(page)
    await gotoDetailAndWaitForPanel(page, DRAFT_ORDER_ID)

    await expect(page.getByTestId('partner-order-version-history-list')).toBeVisible()

    // rev1 복원 버튼 활성 확인
    const restoreBtn1 = page.getByTestId('partner-order-version-history-restore-button-1')
    await expect(restoreBtn1).toBeVisible()
    await expect(restoreBtn1).toBeEnabled()
    await restoreBtn1.click()

    // DS Modal 오픈 + 확정 버튼 확인
    // 주의: DS Modal 컴포넌트(Modal.tsx)는 ModalProps 에 data-testid 를 포함하지 않으므로
    // Modal 컨테이너는 role="dialog" 로 찾는다. confirm 버튼은 footer Button 에
    // data-testid 가 직접 부여되어 있으므로 getByTestId 사용 가능.
    const restoreModal = page.getByRole('dialog', { name: '주문 복원' })
    await expect(restoreModal).toBeVisible()
    await expect(restoreModal).toContainText('버전 1')

    const confirmBtn = page.getByTestId('partner-order-version-history-restore-confirm')
    await expect(confirmBtn).toBeVisible()
    await expect(confirmBtn).toBeEnabled()
    await confirmBtn.click()

    // 복원 성공 toast — '버전 1' 포함, kind=success (출고전표 경고 없음) (#31 용어 통일 rev N→버전 N)
    const toast = page.getByTestId('partner-order-version-history-toast')
    await expect(toast).toBeVisible()
    await expect(toast).toContainText('버전 1')
    // slipResyncRequired=false → '출고전표' 경고 문구 미노출
    await expect(toast).not.toContainText('판매전표')
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 3: CONFIRMED 주문 — 복원 → slipResyncRequired=true → 경고 toast 노출
  // ──────────────────────────────────────────────────────────
  test('시나리오 3: CONFIRMED 주문 복원 → slipResyncRequired=true → 출고전표 경고 toast', async ({
    page,
  }) => {
    await installAuthMock(page)
    await gotoDetailAndWaitForPanel(page, CONFIRMED_ORDER_ID)

    await expect(page.getByTestId('partner-order-version-history-list')).toBeVisible()

    // CONFIRMED 상태이지만 복원 허용 (제외목록 방식: CONFIRMING/CANCELED 만 차단)
    // → 복원 버튼 활성 확인
    const restoreBtn1 = page.getByTestId('partner-order-version-history-restore-button-1')
    await expect(restoreBtn1).toBeVisible()
    await expect(restoreBtn1).toBeEnabled()

    // locked-note 미노출 (CONFIRMED 는 잠금 안내 없음)
    await expect(
      page.getByTestId('partner-order-version-history-locked-note'),
    ).toHaveCount(0)

    await restoreBtn1.click()

    // DS Modal 은 data-testid 미전달 → role="dialog" 로 오픈 확인 후 confirm 클릭.
    await expect(page.getByRole('dialog', { name: '주문 복원' })).toBeVisible()
    const confirmBtn = page.getByTestId('partner-order-version-history-restore-confirm')
    await expect(confirmBtn).toBeVisible()
    await confirmBtn.click()

    // slipResyncRequired=true → 경고 toast ('출고전표' 포함)
    const toast = page.getByTestId('partner-order-version-history-toast')
    await expect(toast).toBeVisible()
    await expect(toast).toContainText('판매전표')
    await expect(toast).toContainText('버전 1')
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 4a: CONFIRMING 주문 — 복원 버튼 비활성 + 안내 문구
  // ──────────────────────────────────────────────────────────
  test('시나리오 4a: CONFIRMING 주문 — 복원 버튼 비활성 + "확정 처리 중" 안내', async ({
    page,
  }) => {
    await installAuthMock(page)
    await gotoDetailAndWaitForPanel(page, CONFIRMING_ORDER_ID)

    await expect(page.getByTestId('partner-order-version-history-list')).toBeVisible()

    // locked-note 노출 — "확정 처리 중" 문구
    const lockedNote = page.getByTestId('partner-order-version-history-locked-note')
    await expect(lockedNote).toBeVisible()
    await expect(lockedNote).toContainText('확정 처리 중')

    // 과거(rev1) 복원 버튼은 렌더되되 disabled
    const restoreBtn1 = page.getByTestId('partner-order-version-history-restore-button-1')
    await expect(restoreBtn1).toBeVisible()
    await expect(restoreBtn1).toBeDisabled()
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 4b: CANCELED 주문 — 복원 버튼 비활성 + "취소된 주문" 안내
  // ──────────────────────────────────────────────────────────
  test('시나리오 4b: CANCELED 주문 — 복원 버튼 비활성 + "취소된 주문" 안내', async ({
    page,
  }) => {
    await installAuthMock(page)
    await gotoDetailAndWaitForPanel(page, CANCELED_ORDER_ID)

    await expect(page.getByTestId('partner-order-version-history-list')).toBeVisible()

    // locked-note 노출 — "취소된 주문" 문구
    const lockedNote = page.getByTestId('partner-order-version-history-locked-note')
    await expect(lockedNote).toBeVisible()
    await expect(lockedNote).toContainText('취소된 주문')

    // 과거(rev1) 복원 버튼은 렌더되되 disabled
    const restoreBtn1 = page.getByTestId('partner-order-version-history-restore-button-1')
    await expect(restoreBtn1).toBeVisible()
    await expect(restoreBtn1).toBeDisabled()
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 5: actorName UUID 비노출 가드
  // ──────────────────────────────────────────────────────────
  test('시나리오 5: actorName UUID 패턴은 화면에 노출되지 않는다', async ({ page }) => {
    await installAuthMock(page)
    await gotoDetailAndWaitForPanel(page, DRAFT_ORDER_ID)

    await expect(page.getByTestId('partner-order-version-history-list')).toBeVisible()

    // UUID 패턴 정규식 — FE displayActor() 가 마스킹하므로 화면에서 검색되면 안 됨.
    // fixture actorName='오병승' 은 UUID 아니므로 화면에 노출, UUID 패턴은 없음.
    const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    const panel = page.getByTestId('partner-order-version-history-panel')
    const panelText = await panel.innerText()
    expect(
      uuidPattern.test(panelText),
      `버전이력 패널에 UUID 가 노출되어 있습니다: "${panelText.match(uuidPattern)?.[0]}"`,
    ).toBe(false)

    // actorName '오병승' 은 정상 노출 (UUID 아님 → 마스킹 없음)
    await expect(page.getByRole('dialog', { name: '버전 이력' })).toContainText('오병승')
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 6: DELETE revision — '삭제' 배지(danger variant) 표시
  // ──────────────────────────────────────────────────────────
  test('시나리오 6: DELETE revision — 버전이력 목록에 "삭제" 배지 표시', async ({ page }) => {
    await installAuthMock(page)
    // ord-delete-history orderId → mock.ts 가 DELETE revision 포함 fixture 반환.
    // (mock.ts Phase 2.4 블록 내 orderId==='ord-delete-history' 분기 + rev4 DELETE 포함)
    await gotoDetailAndWaitForPanel(page, DELETE_HISTORY_ORDER_ID)

    const historyList = page.getByTestId('partner-order-version-history-list')
    await expect(historyList).toBeVisible()

    // rev4 행이 존재하고 '삭제' 텍스트를 포함해야 한다.
    const row4 = page.getByTestId('partner-order-version-history-row-4')
    await expect(row4).toBeVisible()
    await expect(row4).toContainText('삭제')
  })

  // ──────────────────────────────────────────────────────────
  // 시나리오 7: 동일 revision 재복원 — 두 번째 복원도 toast 표시
  //
  // 검증 목적: rev1 복원 후 다시 rev1 을 복원해도 서버가 200 OK 를 반환하고
  //   UI 가 성공 toast 를 표시하는지 확인한다 (멱등성 시나리오).
  //   mock.ts 는 동일 revisionNo 에 대한 재복원 요청에도 동일한 성공 응답을 반환하므로
  //   "동일 revision 재복원 허용" 비즈니스 규칙이 UI 레벨에서 차단되지 않음을 검증한다.
  // ──────────────────────────────────────────────────────────
  test('시나리오 7: 동일 revision(rev1) 재복원 — 두 번째 toast 도 표시된다', async ({ page }) => {
    await installAuthMock(page)
    await gotoDetailAndWaitForPanel(page, DRAFT_ORDER_ID)

    await expect(page.getByTestId('partner-order-version-history-list')).toBeVisible()

    // 첫 번째 복원
    const restoreBtn1 = page.getByTestId('partner-order-version-history-restore-button-1')
    await expect(restoreBtn1).toBeVisible()
    await expect(restoreBtn1).toBeEnabled()
    await restoreBtn1.click()

    await expect(page.getByRole('dialog', { name: '주문 복원' })).toBeVisible()
    const confirmBtn = page.getByTestId('partner-order-version-history-restore-confirm')
    await expect(confirmBtn).toBeVisible()
    await confirmBtn.click()

    // 첫 번째 toast 확인 (#31 용어 통일 rev N→버전 N)
    const toast = page.getByTestId('partner-order-version-history-toast')
    await expect(toast).toBeVisible()
    await expect(toast).toContainText('버전 1')

    // toast 닫힘 대기 (자동 닫힘) 또는 재열기 가능 상태로 복구 대기
    // toast 가 사라질 때까지 최대 5 초 대기
    await expect(toast).toBeHidden({ timeout: 5_000 }).catch(() => {
      // toast 가 유지되는 경우에도 두 번째 복원 시도 허용
    })

    // 두 번째 복원 — 동일 rev1 재복원
    await expect(restoreBtn1).toBeVisible()
    await expect(restoreBtn1).toBeEnabled()
    await restoreBtn1.click()

    await expect(page.getByRole('dialog', { name: '주문 복원' })).toBeVisible()
    const confirmBtn2 = page.getByTestId('partner-order-version-history-restore-confirm')
    await confirmBtn2.click()

    // 두 번째 toast 표시 — UI 가 재복원을 차단하지 않음을 검증
    await expect(page.getByTestId('partner-order-version-history-toast')).toBeVisible()
    await expect(page.getByTestId('partner-order-version-history-toast')).toContainText('버전 1')
  })
})
