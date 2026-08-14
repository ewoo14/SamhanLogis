/**
 * §7 입출고전표 협업 패널 — Playwright mock 회귀 (Fable5 Round C P2-4).
 *
 * 검증 대상: {@code SlipCollaborationPanel} (전표 상세 `/sales/:id` 하단 협업 섹션) 의
 *   1) 코멘트 등록 → 목록 반영 (+ 해결 처리 → '해결' 배지)
 *   2) 수정 버튼 → 편집 → 수정완료 → 버전이력 패널 유지 및 diff 목록 제거
 *
 * <h2>권한 전제 — mock 매트릭스 (Round C P2-1 fix)</h2>
 * <p>패널 버튼은 {@code canAccess('slip.comments'|'slip.audit-overlay', ...)} 로 가드된다.
 * mock {@code SP_D1_PAGES} + DEFAULT_VIEW/EDIT 에 두 page-code 가 등재되어 있어야
 * (auth V36 seed: MASTER/MANAGER/SALES/WAREHOUSE view+edit) 버튼이 노출된다 — 본 spec 이
 * 그 silent regression 의 회귀 가드다.
 *
 * <h2>Mock 전략 — mock.ts fixture (VITE_MOCK_MODE=1)</h2>
 * <p>{@code VITE_MOCK_MODE=1} 일 때 axios request interceptor 가 {@code getMockResponse()}
 * 로 백엔드 호출을 대체한다(실 HTTP 미발생, page.route 불요 — interceptor 가 앞단).
 * 협업 store 는 {@code globalThis} in-memory 라 테스트별 새 page = 자동 초기화.
 *
 * <h2>UUID 비공개 가드</h2>
 * <p>화면 단언은 작성자/수정자 실명(오병승)·필드 라벨(메모)·본문 텍스트만 사용한다
 * (slipId 'slip-001' 은 path 전용) — [[uuid-no-user-visibility]].
 *
 * 실행 (slip-version-history.spec 패턴 동일):
 *   cd clients/desktop
 *   (별도 터미널) set VITE_MOCK_MODE=1 && npx vite src/renderer --port 5174
 *   set PLAYWRIGHT_SKIP_WEB_SERVER=1 && set AUDIT_BASE_URL=http://127.0.0.1:5174
 *     && node_modules/.bin/playwright test playwright/slip-collab --reporter=line
 */
import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'

/** mock.ts MOCK_SLIPS[0] (OUTBOUND / PROCESSING) 의 id — fixture getSlip 이 이 전표를 반환. */
const SLIP_ID = 'slip-001'
const PAGE_URL = `${BASE_URL}/#/sales/${SLIP_ID}?mockRole=MASTER`
const DRAFT_SLIP_ID = 'slip-005'
const DRAFT_PAGE_URL = `${BASE_URL}/#/sales/${DRAFT_SLIP_ID}?mockRole=MASTER`

/**
 * window.samhanAuth stub — AuthGuard 통과용 (slip-version-history.spec 패턴 동일).
 * mock 모드라도 client.ts interceptor 가 getToken() 을 호출하므로 stub 필요.
 */
async function installAuthMock(page: Page) {
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

async function installMockRealtimeHandler(page: Page): Promise<void> {
  await page.route('**/api/v1/**/collab/stream**', route => route.fulfill({
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
    body: ': mock keep-alive\n\n',
  }))
}

async function seedOtherViewerOnce(page: Page) {
  await page.addInitScript(({ slipId }) => {
    const storageKey = `samhan-presence-seeded:${slipId}`
    const g = globalThis as unknown as {
      __SAMHAN_MOCK_SLIP_PRESENCE?: Record<string, Array<{
        sessionId: string
        displayName: string
        color: 'BLUE' | 'GREEN' | 'AMBER' | 'ROSE' | 'VIOLET' | 'CYAN' | 'LIME' | 'PINK'
      }>>
    }
    const seeded = window.localStorage.getItem(storageKey) === '1'
    g.__SAMHAN_MOCK_SLIP_PRESENCE = {
      [slipId]: seeded
        ? []
        : [{ sessionId: 'presence-kim-manager', displayName: '김관리', color: 'GREEN' }],
    }
    window.localStorage.setItem(storageKey, '1')
  }, { slipId: SLIP_ID })
}

test.describe('§7 입출고전표 협업 패널', () => {
  test.beforeEach(async ({ page }) => {
    await installMockRealtimeHandler(page)
  })

  test('코멘트 등록 → 목록 반영 → 해결 처리', async ({ page }) => {
    await installAuthMock(page)
    await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' })

    const panel = page.getByTestId('slip-collaboration-panel')
    await expect(panel).toBeVisible()
    // presence 는 이제 패널 밖(SlipDetailPage 상단)에 렌더 → 페이지 스코프로 단언.
    await expect(page.getByTestId('presence-indicator')).toBeVisible()
    await expect(page.getByLabel('오병승 현재 보고 있음').first()).toBeVisible()

    // 1) 초기 빈 목록 — fresh page = fresh mock store.
    await expect(panel.getByText('아직 코멘트가 없습니다.')).toBeVisible()

    // 2) 코멘트 입력 폼 노출 자체가 canAccess('slip.comments','create') 회귀 가드.
    const input = panel.getByTestId('slip-collab-comment-input')
    await expect(input).toBeVisible()
    await input.fill('배송 전 검수 부탁드립니다')
    await panel.getByRole('button', { name: '등록' }).click()

    // 3) 목록 반영 — 작성자 실명 + 본문 (UUID 비노출).
    const commentItem = panel.getByTestId('slip-collab-comment-item')
    await expect(commentItem).toHaveCount(1)
    await expect(commentItem).toContainText('오병승')
    await expect(commentItem).toContainText('배송 전 검수 부탁드립니다')
    await expect(panel.getByText('아직 코멘트가 없습니다.')).toHaveCount(0)

    // 4) 해결 처리 — canAccess('slip.comments','update') 가드 + mock resolve 핸들러.
    await commentItem.getByRole('button', { name: '해결' }).click()
    await expect(commentItem.getByRole('button', { name: '해결' })).toHaveCount(0)
    await expect(commentItem).toContainText('해결')
  })

  test('수정 버튼 → 편집 → 수정완료 → 버전이력으로 일원화', async ({ page }) => {
    await installAuthMock(page)
    await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' })

    const panel = page.getByTestId('slip-collaboration-panel')
    await expect(panel).toBeVisible()
    await expect(panel.getByRole('heading', { name: '협업' })).toHaveCount(0)
    await expect(panel.getByLabel('수정 이력')).toHaveCount(0)
    await expect(panel.getByTestId('slip-collab-edit-item')).toHaveCount(0)
    const versionHistory = panel.getByTestId('slip-version-history-panel')
    await expect(versionHistory).toBeVisible()
    await page.getByTestId('slip-version-history-open').click()
    await expect(page.getByTestId('slip-version-history-row-2')).toBeVisible()
    await page.getByRole('dialog', { name: '버전 이력' }).getByRole('button', { name: '닫기' }).click()
    await expect(page.getByTestId('slip-detail-edit-request-button')).toHaveCount(0)
    await expect(page.getByTestId('slip-detail-delete-request-button')).toBeVisible()

    // 1) 상세 상단 수정 버튼 노출 자체가 canAccess('slip.audit-overlay','update') 회귀 가드.
    await page.getByTestId('slip-collab-edit-open').click()

    // 2) 편집모드 — 메모 필드 수정 + 사유 입력.
    const form = panel.getByTestId('slip-collab-edit-form')
    await expect(form).toBeVisible()
    await form.getByLabel('메모 수정값').fill('출고 전 거래처 통화 완료')
    await form.getByLabel('수정 사유').fill('현장 요청 반영')
    await form.getByRole('button', { name: '수정완료' }).click()

    // 3) diff 전용 목록은 만들지 않고, 버전이력 패널만 남긴다.
    await expect(panel.getByTestId('slip-collab-edit-item')).toHaveCount(0)
    await expect(panel.getByLabel('수정 이력')).toHaveCount(0)
    await expect(versionHistory).toBeVisible()
    await page.getByTestId('slip-version-history-open').click()

    // 4) 버전이력 항목 선택은 공유 highlight 상태를 반영한다.
    const revisionRow = page.getByTestId('slip-version-history-row-2')
    await revisionRow.click()
    await expect(revisionRow).toHaveAttribute('data-active', 'true')
  })

  test('presence list 백필은 다른 시청자와 본인 아바타를 함께 표시한다', async ({ page }) => {
    await installAuthMock(page)
    await seedOtherViewerOnce(page)
    await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' })

    const panel = page.getByTestId('slip-collaboration-panel')
    await expect(panel).toBeVisible()
    const presence = page.getByTestId('presence-indicator')
    await expect(presence).toHaveAttribute('aria-label', '현재 보고 있음 2명')
    await expect(page.getByLabel('김관리 현재 보고 있음')).toBeVisible()
    await expect(page.getByLabel('오병승 현재 보고 있음')).toBeVisible()

    await page.reload({ waitUntil: 'domcontentloaded' })
    const reloadedPanel = page.getByTestId('slip-collaboration-panel')
    await expect(reloadedPanel).toBeVisible()
    await expect(page.getByLabel('김관리 현재 보고 있음')).toHaveCount(0)
    await expect(page.getByLabel('오병승 현재 보고 있음')).toBeVisible()
    await expect(page.getByTestId('presence-indicator')).toHaveAttribute('aria-label', '현재 보고 있음 1명')
  })

  test('S2a direct edit inline form은 헤더와 품목 셀을 fieldPath 단위 coedit input으로 렌더한다', async ({ page }) => {
    await installAuthMock(page)
    await page.goto(DRAFT_PAGE_URL, { waitUntil: 'domcontentloaded' })

    await page.getByTestId('sales-slip-edit-button').click()
    const inlineForm = page.getByTestId('sales-slip-edit-modal')
    await expect(inlineForm).toBeVisible()
    await expect(page.getByRole('dialog', { name: '출고 전표 수정' })).toHaveCount(0)

    await expect(page.getByTestId('slip-coedit-field-header-partnerName')).toBeVisible()
    await expect(page.getByTestId('slip-coedit-field-header-memo')).toBeVisible()
    await expect(inlineForm.getByRole('combobox', { name: '라인 1 품목' })).toBeVisible()
    await expect(page.getByTestId('slip-coedit-field-items-0-productName')).not.toBeVisible()
    await expect(page.getByTestId('slip-coedit-field-items-0-quantity')).toBeVisible()
    await expect(page.getByTestId('slip-coedit-field-items-0-unitPrice')).toBeVisible()

    // D-R8-7/D-R8-10: 거래처는 자유입력 coedit input 이 아니라 PartnerAutocomplete(단일 선택 경로)로
    // 대체됐다 — partnerName 헤더는 선택/원격 전파(handleSlipPartnerSelect → CRDT 헤더)로만 갱신되며,
    // 이 필드는 그 controlled value(협업 partnerName)를 표시한다(자유입력→구 partnerId 유지 각인
    // R8-QA-3 방지). fieldPath 단위 coedit 편집은 수량·단가 셀로 검증한다.
    await inlineForm.getByLabel('수량 1').fill('3')
    // 재수렴 R-1(#937) 근본수정: 이 화면은 단가 입력을 항상 VAT 포함으로 계산하므로
    // aria-label 도 데이터에 무관한 상수 "단가(VAT포함)" 다(editUnitPriceLabel).
    await inlineForm.getByLabel('단가(VAT포함) 1').fill('120000')

    await expect(inlineForm.getByLabel('수량 1')).toHaveValue('3')
    await expect(inlineForm.getByLabel('단가(VAT포함) 1')).toHaveValue('120000')
    // 진입 시 auto-focus 로 열린 거래처 combobox 는 수량/단가로 포커스가 옮겨가며 blur→닫힌다 →
    // coedit-bound 표시값(=DRAFT 전표 거래처)으로 복원(자유입력 hold 아님).
    await expect(inlineForm.getByLabel('거래처', { exact: true })).toHaveValue('한일냉동기술')
    await expect(inlineForm).not.toContainText(DRAFT_SLIP_ID)
  })

  /**
   * PR #747 재수렴 HIGH fix 라이브(mock) 회귀 가드 — root cause: BE {@code SlipRevisionService}
   * 는 헤더 fieldPath 를 {@code "header."} 접두사로 내려주는데(예: {@code "header.memo"}),
   * FE 코멘트 anchor(OVERLAY_FIELD_OPTIONS)는 접두사 없이 저장된다(예: {@code "memo"}). 두 값이
   * {@link SlipVersionHistoryPanel} 의 {@code normalizeFieldPath} 를 거치지 않고 그대로 비교되면
   * 11개 overlay 필드 전량이 매칭 실패한다 — 이 spec 은 실제 코멘트 등록 → 클릭 → 버전이력
   * 하이라이트(양방향)를 실 브라우저(mock 모드)로 재현해 회귀를 막는다.
   */
  test('코멘트 anchor(메모) 클릭 ↔ 버전이력 header.memo 항목이 서로 하이라이트된다 (양방향, PR #747 재수렴 HIGH fix)', async ({ page }) => {
    await installAuthMock(page)
    await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' })

    const panel = page.getByTestId('slip-collaboration-panel')
    await expect(panel).toBeVisible()

    // 연결 필드 = 메모 선택 후 코멘트 등록 (결정2 anchor 생성 UX — OVERLAY_FIELD_OPTIONS 'memo').
    await panel.getByTestId('slip-collab-comment-anchor-select').selectOption('memo')
    await panel.getByTestId('slip-collab-comment-input').fill('메모 반영 확인 부탁드립니다')
    await panel.getByRole('button', { name: '등록' }).click()

    const commentItem = panel.getByTestId('slip-collab-comment-item')
      .filter({ hasText: '메모 반영 확인 부탁드립니다' })
    await expect(commentItem).toBeVisible()
    const versionHistory = panel.getByTestId('slip-version-history-panel')
    await expect(page.getByTestId('slip-version-history-list')).toHaveCount(0)
    const memoChange = page.getByTestId('slip-version-history-change-header-memo')
    const revisionRow = page.getByTestId('slip-version-history-row-2')

    // 클릭 전 — 기본 화면에는 이력 목록이 없고 코멘트도 미하이라이트.
    await expect(commentItem).not.toHaveAttribute('data-active', 'true')

    // 1) 정방향 — 코멘트(anchor=memo) 클릭 → header.memo 버전이력 항목 + revision 행 하이라이트.
    await commentItem.click()
    await expect(memoChange).toBeVisible()
    await expect(memoChange).toHaveAttribute('data-active', 'true')
    await expect(revisionRow).toHaveAttribute('data-active', 'true')

    // 2) 역방향 — 버전이력 항목(header.memo) 클릭 → 코멘트 하이라이트 (같은 세션에서 이어 확인).
    await memoChange.click()
    await expect(commentItem).toHaveAttribute('data-active', 'true')
    await expect(commentItem).toHaveAttribute('aria-current', 'true')
  })
})
