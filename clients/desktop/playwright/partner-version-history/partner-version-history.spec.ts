/**
 * Phase 2.3 Task 7 — 거래처(Partner) 버전이력 + 복원 Playwright E2E.
 *
 * 검증 대상: {@code PartnerVersionHistoryPanel} (거래처 상세 다이얼로그 "버전 이력" 탭) 의
 *   1) 버전이력 목록 렌더 (최신 우선, 배지 + 변경요약)
 *   2) 최신 revision 은 복원 버튼 미노출
 *   3) 과거 revision "이 시점으로 복원" → confirm modal → 확정 → 성공 toast
 *   4) 거래종료(TERMINATED) 거래처는 복원 버튼 비활성 + 안내 문구
 *
 * <h2>Mock 전략 — mock.ts fixture (VITE_MOCK_MODE=1)</h2>
 * <p>desktop 클라이언트는 {@code VITE_MOCK_MODE=1} 일 때 axios request interceptor 가
 * {@code getMockResponse()} 로 백엔드 호출을 fixture 로 대체한다(실 HTTP 미발생).
 * 본 spec 의 모든 endpoint — {@code GET /admin/partners/search} /
 * {@code GET /api/v1/partners/&#42;/full} /
 * {@code GET /api/v1/partners/&#42;/revisions} /
 * {@code POST .../revisions/&#42;/restore} — 는 {@code mock.ts} fixture 가 응답하므로
 * 별도 {@code page.route} 가 필요 없다(interceptor 가 page.route 보다 앞단이라 발동하지 않는다).
 *
 * <p>revisions fixture 는 2건(rev2 EDIT childAdded=1 headerChanged=1, rev1 CREATE)이며
 * actorName 은 MOCK_AUTH.fullName(오병승), partnerCode 는 path 의 거래처 코드를 따른다.
 * partner full mock 은 {@code MOCK_ADMIN_PARTNERS} row 의 status 를 반영하므로
 * ACTIVE 거래처(1234567890)는 복원 가능, TERMINATED 거래처(6789012345)는 복원 버튼 비활성.
 *
 * <h2>UUID 비공개 가드</h2>
 * <p>화면 단언은 actorName / partnerCode / 배지·변경요약 텍스트만 사용한다(actorId UUID 미노출)
 * — [[uuid-no-user-visibility]].
 *
 * 실행 (estimate-version-history.spec 패턴 동일):
 *   cd clients/desktop
 *   (별도 터미널) set VITE_MOCK_MODE=1 && npx vite src/renderer --port 5174
 *   set PLAYWRIGHT_SKIP_WEB_SERVER=1 && set AUDIT_BASE_URL=http://127.0.0.1:5174
 *     && npx playwright test playwright/partner-version-history --reporter=line
 */
import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'

/** 복원 가능(ACTIVE) 거래처 코드 — MOCK_ADMIN_PARTNERS 시드. */
const ACTIVE_PARTNER_CODE = '1234567890'
/** 복원 불가(TERMINATED) 거래처 코드 — MOCK_ADMIN_PARTNERS 시드. */
const TERMINATED_PARTNER_CODE = '6789012345'

/** 거래처 관리 페이지 — MASTER 가드 통과용 mockRole. */
const partnersUrl = `${BASE_URL}/#/admin/partners?mockRole=MASTER`

/**
 * window.samhanAuth stub — AuthGuard 통과용 (estimate-version-history.spec 패턴 동일).
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

/**
 * 거래처 관리 목록 진입 → 지정 거래처 행 클릭 → 4탭 다이얼로그 "버전 이력" 탭 활성화.
 */
async function openVersionHistoryTab(page: Page, partnerCode: string) {
  await page.goto(partnersUrl, { waitUntil: 'domcontentloaded' })

  // 목록 테이블 + 대상 행 렌더 대기 후 행 클릭 → 상세 다이얼로그 오픈.
  await expect(page.getByTestId('admin-partners-table')).toBeVisible()
  const row = page.getByTestId(`admin-partners-row-${partnerCode}`)
  await expect(row).toBeVisible()
  await row.click()

  // 다이얼로그 오픈 + "버전 이력" 탭 (5번째 탭, index 4) 클릭.
  // (DS Modal 은 data-testid 를 root 로 전달하지 않으므로 탭 role 로 오픈을 확인한다.)
  const versionTab = page.getByRole('tab', { name: '버전 이력' })
  await expect(versionTab).toBeVisible()
  await versionTab.click()
  await expect(page.getByTestId('partner-version-history-panel')).toBeVisible()
  await expect(page.getByTestId('partner-version-history-list')).toHaveCount(0)
  await page.getByTestId('partner-version-history-open').click()
}

test.describe('Phase 2.3 거래처 버전이력 + 복원', () => {
  test('버전이력 2건 렌더 + 최신 복원버튼 미노출 + 과거 복원 → confirm → 성공 toast', async ({ page }) => {
    await installAuthMock(page)
    await openVersionHistoryTab(page, ACTIVE_PARTNER_CODE)

    // 1) 목록 렌더 대기.
    await expect(page.getByTestId('partner-version-history-list')).toBeVisible()

    // 2) 목록 2건 — rev2(수정) + rev1(생성).
    const row2 = page.getByTestId('partner-version-history-row-2')
    const row1 = page.getByTestId('partner-version-history-row-1')
    await expect(row2).toBeVisible()
    await expect(row1).toBeVisible()

    // rev2 — '수정' 배지 + 변경요약(헤더 1 · 자식 +1) 포함.
    await expect(row2).toContainText('수정')
    await expect(row2).toContainText('헤더 1')
    await expect(row2).toContainText('+1')
    // rev1 — '생성' 배지.
    await expect(row1).toContainText('생성')

    // 3) 최신(rev2)은 복원 버튼 미노출, rev1 만 노출.
    await expect(page.getByTestId('partner-version-history-restore-button-2')).toHaveCount(0)
    const restoreBtn = page.getByTestId('partner-version-history-restore-button-1')
    await expect(restoreBtn).toBeVisible()
    await expect(restoreBtn).toBeEnabled()
    await restoreBtn.click()

    // 4) confirm modal — "복원" 확정 버튼.
    const confirmBtn = page.getByTestId('partner-version-history-restore-confirm')
    await expect(confirmBtn).toBeVisible()
    await confirmBtn.click()

    // 5) restore 성공 → toast 에 'rev 1' 텍스트.
    await expect(page.getByTestId('partner-version-history-toast')).toContainText('rev 1')
  })

  test('거래종료(TERMINATED) 거래처 — 복원 버튼 비활성 + 안내 문구', async ({ page }) => {
    await installAuthMock(page)
    await openVersionHistoryTab(page, TERMINATED_PARTNER_CODE)

    // 패널 + 목록 렌더 (revisions fixture 는 동일 2건).
    await expect(page.getByTestId('partner-version-history-list')).toBeVisible()

    // 거래종료 안내 문구 노출.
    await expect(page.getByTestId('partner-version-history-locked-note')).toBeVisible()

    // 과거(rev1) 복원 버튼은 렌더되되 disabled (거래종료 복원 불가).
    const restoreBtn = page.getByTestId('partner-version-history-restore-button-1')
    await expect(restoreBtn).toBeVisible()
    await expect(restoreBtn).toBeDisabled()
  })
})
