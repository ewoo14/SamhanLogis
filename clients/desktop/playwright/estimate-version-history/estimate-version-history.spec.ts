/**
 * Phase 2.2 Task 7 — 견적서 버전이력 + 복원 Playwright E2E.
 *
 * 검증 대상: {@code EstimateVersionHistoryPanel} (견적 상세 `/sales/estimates/:id` 하단 패널) 의
 *   1) 버전이력 목록 렌더 (최신 우선, 배지 + 변경요약)
 *   2) 최신 revision 은 복원 버튼 미노출
 *   3) 과거 revision "이 시점으로 복원" → confirm modal → 확정 → 성공 toast
 *   4) 편집 불가(QUOTE_ACCEPTED) 견적은 복원 버튼 비활성 + 안내 문구
 *
 * <h2>Mock 전략 — mock.ts fixture (VITE_MOCK_MODE=1)</h2>
 * <p>desktop 클라이언트는 {@code VITE_MOCK_MODE=1} 일 때 axios request interceptor 가
 * {@code getMockResponse()} 로 백엔드 호출을 fixture 로 대체한다(실 HTTP 미발생).
 * 본 spec 의 모든 endpoint — getEstimate /
 * {@code GET /api/v1/slips/estimates/&#42;/revisions} /
 * {@code POST .../revisions/&#42;/restore} — 는 {@code mock.ts} fixture 가 응답하므로
 * 별도 {@code page.route} 가 필요 없다(interceptor 가 page.route 보다 앞단이라 발동하지 않는다).
 *
 * <p>revisions fixture 는 2건(rev2 EDIT lineAdded=1, rev1 CREATE)이며 actorName 은
 * MOCK_AUTH.fullName(오병승), estimateNo 는 대상 견적(est-001 → 2026/05/04-1)을 따른다.
 * est-003(또는 id 에 'accepted' 포함)은 QUOTE_ACCEPTED 로 응답하여 복원 버튼 비활성을 노출한다.
 *
 * <h2>UUID 비공개 가드</h2>
 * <p>화면 단언은 actorName / estimateNo / 배지·변경요약 텍스트만 사용한다(estimateId 'est-001'
 * 은 path 전용, 화면 노출 검증 X) — [[uuid-no-user-visibility]].
 *
 * 실행 (slip-version-history.spec 패턴 동일):
 *   cd clients/desktop
 *   (별도 터미널) set VITE_MOCK_MODE=1 && npx vite src/renderer --port 5174
 *   set PLAYWRIGHT_SKIP_WEB_SERVER=1 && set AUDIT_BASE_URL=http://127.0.0.1:5174
 *     && npx playwright test playwright/estimate-version-history --reporter=line
 */
import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'

/** 복원 가능(QUOTE_DRAFT) 견적 id — buildMockEstimateDetail 이 DRAFT 로 응답. */
const ESTIMATE_ID = 'est-001'
/** 복원 불가(QUOTE_ACCEPTED) 견적 id — buildMockEstimateDetail 이 ACCEPTED 로 응답. */
const ACCEPTED_ESTIMATE_ID = 'est-003'

const detailUrl = (id: string) => `${BASE_URL}/#/sales/estimates/${id}?mockRole=MASTER`

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

test.describe('Phase 2.2 견적서 버전이력 + 복원', () => {
  test('버전이력 2건 렌더 + 최신 복원버튼 미노출 + 과거 복원 → confirm → 성공 toast', async ({ page }) => {
    await installAuthMock(page)

    await page.goto(detailUrl(ESTIMATE_ID), { waitUntil: 'domcontentloaded' })

    // 1) 패널 + 목록 렌더 대기.
    await expect(page.getByTestId('estimate-version-history-panel')).toBeVisible()
    await expect(page.getByTestId('estimate-version-history-list')).toHaveCount(0)
    await page.getByTestId('estimate-version-history-open').click()
    await expect(page.getByTestId('estimate-version-history-list')).toBeVisible()

    // 2) 목록 2건 — rev2(수정 / 라인 +1) + rev1(생성).
    const row2 = page.getByTestId('estimate-version-history-row-2')
    const row1 = page.getByTestId('estimate-version-history-row-1')
    await expect(row2).toBeVisible()
    await expect(row1).toBeVisible()

    // rev2 — '수정' 배지 + 변경요약 "+1" 포함.
    await expect(row2).toContainText('수정')
    await expect(row2).toContainText('+1')
    // rev1 — '생성' 배지.
    await expect(row1).toContainText('생성')

    // 3) 최신(rev2)은 복원 버튼 미노출, rev1 만 노출.
    await expect(page.getByTestId('estimate-version-history-restore-button-2')).toHaveCount(0)
    const restoreBtn = page.getByTestId('estimate-version-history-restore-button-1')
    await expect(restoreBtn).toBeVisible()
    await restoreBtn.click()

    // 4) confirm modal — "복원" 확정 버튼.
    const confirmBtn = page.getByTestId('estimate-version-history-restore-confirm')
    await expect(confirmBtn).toBeVisible()
    await confirmBtn.click()

    // 5) restore 성공 → toast 에 '버전 1' 텍스트 (#31 이력 일원화 — 용어 통일 rev N→버전 N).
    await expect(page.getByTestId('estimate-version-history-toast')).toContainText('버전 1')
  })

  test('편집 불가(QUOTE_ACCEPTED) 견적 — 복원 버튼 비활성 + 안내 문구', async ({ page }) => {
    await installAuthMock(page)

    await page.goto(detailUrl(ACCEPTED_ESTIMATE_ID), { waitUntil: 'domcontentloaded' })

    // 패널 + 목록 렌더 (revisions fixture 는 동일 2건).
    await expect(page.getByTestId('estimate-version-history-panel')).toBeVisible()
    await expect(page.getByTestId('estimate-version-history-list')).toHaveCount(0)
    await page.getByTestId('estimate-version-history-open').click()
    await expect(page.getByTestId('estimate-version-history-list')).toBeVisible()

    // 편집 불가 안내 문구 노출.
    await expect(page.getByTestId('estimate-version-history-locked-note')).toBeVisible()

    // 과거(rev1) 복원 버튼은 렌더되되 disabled (복원 불가 상태).
    const restoreBtn = page.getByTestId('estimate-version-history-restore-button-1')
    await expect(restoreBtn).toBeVisible()
    await expect(restoreBtn).toBeDisabled()
  })
})
