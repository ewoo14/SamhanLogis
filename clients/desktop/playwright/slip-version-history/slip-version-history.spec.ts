/**
 * Phase 2.1 Task 7 — 전표 버전이력 + 복원 Playwright E2E.
 *
 * 검증 대상: {@code SlipVersionHistoryPanel} (전표 상세 `/sales/:id` 하단 패널) 의
 *   1) 버전이력 목록 렌더 (최신 우선, 배지 + 변경요약 + S2b 필드/셀 변경 목록)
 *   2) 최신 revision 은 복원 버튼 미노출
 *   3) 과거 revision "이 시점으로 복원" → confirm modal → 확정 → 성공 toast
 *
 * <h2>Mock 전략 — mock.ts fixture (VITE_MOCK_MODE=1)</h2>
 * <p>desktop 클라이언트는 {@code VITE_MOCK_MODE=1} 일 때 axios request interceptor 가
 * {@code getMockResponse()} 로 백엔드 호출을 fixture 로 대체한다(실 HTTP 미발생).
 * 본 spec 의 모든 endpoint — getSlip / comments / audit-logs / notifications /
 * {@code GET /api/v1/slips/&#42;/revisions} / {@code POST .../revisions/&#42;/restore} —
 * 는 {@code mock.ts} fixture 가 응답하므로 별도 {@code page.route} 가 필요 없다
 * (interceptor 가 page.route 보다 앞단이라 page.route 는 발동하지 않는다).
 *
 * <p>revisions fixture 는 2건(rev2 EDIT fieldChanges 2건, rev1 CREATE)이며 actorName 은
 * MOCK_AUTH.fullName(오병승), actorColor 는 presence/coedit 와 동일 단일색상 hex 를 따른다.
 *
 * <h2>UUID 비공개 가드</h2>
 * <p>화면 단언은 actorName / slipNo / 배지·변경요약 텍스트만 사용한다(slipId 'slip-001'
 * 은 path 전용, 화면 노출 검증 X) — [[uuid-no-user-visibility]].
 *
 * 실행 (matrix.spec 패턴 동일):
 *   cd clients/desktop
 *   (별도 터미널) set VITE_MOCK_MODE=1 && npx vite src/renderer --port 5174
 *   set PLAYWRIGHT_SKIP_WEB_SERVER=1 && set AUDIT_BASE_URL=http://127.0.0.1:5174
 *     && npx playwright test playwright/slip-version-history --reporter=line
 */
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolveMockQaShotsDir } from '../support/qa-screenshot-dir'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'

/** mock.ts MOCK_SLIPS[0] (OUTBOUND / PROCESSING) 의 id — fixture getSlip 이 이 전표를 반환. */
const SLIP_ID = 'slip-001'
const PAGE_URL = `${BASE_URL}/#/sales/${SLIP_ID}?mockRole=MASTER`
// 캡처는 커밋된 확정 증거(docs/qa/<slug>/*.png)가 아니라 gitignore 된 _local/ 로 나간다 —
// 재실행이 증거를 덮어쓰지 못하게 한다. 승격은 QA_SHOTS_DIR 로만 opt-in (#926 참조 구현).
const SCREENSHOT_DIR = resolveMockQaShotsDir('../../docs/qa/coedit-s2b-audit-log/screenshots')

/**
 * window.samhanAuth stub — AuthGuard 통과용 (matrix.spec 패턴 동일).
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

test.describe('S2b 전표 버전이력 필드 변경 로그 + 복원', () => {
  test('버전이력 2건 렌더 + 필드/셀 변경 목록 + 최신 복원버튼 미노출 + 과거 복원', async ({ page }) => {
    await installAuthMock(page)

    await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' })

    // 1) 패널 + 목록 렌더 대기.
    await expect(page.getByTestId('slip-version-history-panel')).toBeVisible()
    await expect(page.getByTestId('slip-version-history-list')).toBeVisible()

    // 2) 목록 2건 — rev2(수정 / 필드 변경 2건) + rev1(생성).
    const row2 = page.getByTestId('slip-version-history-row-2')
    const row1 = page.getByTestId('slip-version-history-row-1')
    await expect(row2).toBeVisible()
    await expect(row1).toBeVisible()

    // rev2 — '수정' 배지 + 변경요약 + 필드/셀 변경 목록 포함.
    await expect(row2).toContainText('수정')
    await expect(row2).toContainText('메모')
    await expect(row2).toContainText('긴급 출고 / 2세션 수정')
    await expect(row2).toContainText('품목 1행 수량')
    await expect(row2).toContainText('3')
    await expect(page.getByTestId('slip-version-history-change-header-memo')).toBeVisible()
    await expect(page.getByTestId('slip-version-history-change-lines-0-quantity')).toBeVisible()
    // rev1 — '생성' 배지.
    await expect(row1).toContainText('생성')

    mkdirSync(SCREENSHOT_DIR, { recursive: true })
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/slip-version-history-field-changes.png`,
      fullPage: true,
    })

    // 3) 최신(rev2)은 복원 버튼 미노출, rev1 만 노출.
    await expect(page.getByTestId('slip-version-history-restore-button-2')).toHaveCount(0)
    const restoreBtn = page.getByTestId('slip-version-history-restore-button-1')
    await expect(restoreBtn).toBeVisible()
    await restoreBtn.click()

    // 4) confirm modal — "복원" 확정 버튼.
    const confirmBtn = page.getByTestId('slip-version-history-restore-confirm')
    await expect(confirmBtn).toBeVisible()
    await confirmBtn.click()

    // 5) restore 성공 → toast 에 '버전 1' 텍스트(한국어 통일, 리뷰 Design NB-2).
    await expect(page.getByTestId('slip-version-history-toast')).toContainText('버전 1')
  })
})
