/**
 * AC-4 — #825 슬2 거래처 입력 표준화 5화면 PartnerAutocomplete mock 회귀.
 *
 * <h2>검증 대상 (통일/전환 5화면)</h2>
 * <ol>
 *   <li>수금계획 `/accounting/reports/collection-plans` — 등록 `collection-plan-partner`
 *       + 필터 `collection-plan-partner-filter`</li>
 *   <li>받을어음 `/accounting/reports/notes-receivable` — 등록 `notes-receivable-partner`
 *       + 필터 `notes-receivable-partner-filter`</li>
 *   <li>전표현황 `/accounting/reports/journal-status` — 필터 `journal-status-partner-filter`</li>
 *   <li>일마감 `/accounting/daily-closings` — 실행 `daily-closing-exec-partner`</li>
 *   <li>발송금지 거래처 `/admin/blocked-partners` — 단건 등록 다이얼로그
 *       `admin-blocked-add-partner-code-input`</li>
 * </ol>
 *
 * <h2>시나리오 공통</h2>
 * 검색어 입력 → `li[role="option"]` 후보 표시(네이티브 select 아님) → 선택 → listbox 닫힘
 * + 입력값 반영. 등록 화면은 저장 후 partnerCode 왕복을 단언한다.
 *
 * <h2>in-process mock 제약과 단언 전략 ([[feedback_inprocess_mock_principles]])</h2>
 * VITE_MOCK_MODE=1 의 mock 은 브라우저측 axios 어댑터라 실 HTTP 미발생 —
 * in-process 핸들된 경로에는 `page.route` 가 no-op 이다. 따라서:
 * <ul>
 *   <li><b>payload partnerCode 왕복</b> — 등록 POST 를 in-process mock 이 수신·저장하고
 *       목록 GET 이 `partnerCode` 파라미터로 서버측 필터하는 것을 이용해
 *       "등록 → 거래처 필터 조회 → 등록 행만 표시(시드 행 제외)" 로 end-to-end 단언.
 *       (수금계획·받을어음)</li>
 *   <li><b>activeOnly(status=ACTIVE) 파라미터</b> — request 가로채기 불가 대신 mock 이
 *       status 파라미터로 실제 필터하는 것을 이용해 차등 단언: SUSPENDED '미래시스템' 이
 *       등록측(activeOnly)에서는 "검색 결과 없음", 필터측(전체)에서는 후보 표시.</li>
 *   <li><b>일마감 실행 POST</b> — in-process 핸들(정적 목록 echo 미반영)이라 payload 는
 *       Playwright 에서 관측 불가. 실행 성공 왕복(onSuccess 메모 초기화)만 단언하고,
 *       partnerCode payload 는 vitest `DailyClosingPage.test.tsx` 하네스가 단언한다.</li>
 *   <li><b>발송금지 단건 POST</b> — `/api/v1/partners/admin/blocks` POST 는 in-process
 *       미핸들 → 실 HTTP fallthrough → `page.route` 가 유효. postDataJSON 으로
 *       partnerCode payload 를 직접 단언한다.</li>
 * </ul>
 *
 * <h2>UUID 비공개 가드 ([[feedback_uuid_no_user_visibility]])</h2>
 * listbox·본문 텍스트에 UUID(8-4-4-4-12 hex) 패턴 미포함 단언 포함.
 *
 * <h2>실행 방법</h2>
 * <pre>
 *   cd clients/desktop
 *   npx playwright test playwright/ac-4-partner-standardize --reporter=line
 *   (webServer 자동 기동 — VITE_MOCK_MODE=1, :5173)
 * </pre>
 */
import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'

/** UUID 정규식 — 화면 노출 가드. */
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i

/** BE ApiResponse envelope — page.route fulfill 용. */
function envelope<T>(data: T): {
  success: boolean
  code: string
  message: string
  data: T
  timestamp: string
} {
  return {
    success: true,
    code: 'OK',
    message: '성공',
    data,
    timestamp: new Date().toISOString(),
  }
}

/**
 * in-process 미핸들 경로의 라이브 게이트웨이 누수 차단.
 *
 * <p>mock 어댑터 미매칭 요청은 실 HTTP(baseURL localhost:8080)로 fallthrough 한다.
 * 로컬에서 Docker 게이트웨이가 8080에 떠 있으면 mock 토큰이 401 을 받아 로그인
 * 리다이렉트로 테스트가 오염된다(CI 는 8080 부재 → network error 로 우아한 강등).
 * 전 요청 abort 로 CI 와 동일한 결정적 동작을 강제한다. BP-1 의 blocks POST 는
 * 이 라우트보다 나중에 등록되어 우선 매칭된다 (Playwright 후등록 우선).
 */
async function blockLiveGatewayLeaks(page: Page): Promise<void> {
  await page.route('http://localhost:8080/**', (route) => route.abort())
}

/** window.samhanAuth stub — AuthGuard 통과 (ac-3 패턴 미러). */
async function installAuthMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const auth = {
      token: 'playwright-token',
      userId: '00000000-0000-0000-0000-000000010001',
      role: 'MANAGER',
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

/** hash 라우트 진입 + 페이지 로드 앵커 대기. */
async function gotoPage(
  page: Page,
  pathFragment: string,
  readyTestId: string,
): Promise<void> {
  await page.goto(`${BASE_URL}/#${pathFragment}?mockRole=MANAGER`, {
    waitUntil: 'domcontentloaded',
  })
  await expect(page.getByTestId(readyTestId)).toBeVisible({ timeout: 15_000 })
}

/** 거래처 listbox (design-system AsyncAutocomplete 공통 라벨). */
function partnerListbox(page: Page) {
  return page.getByRole('listbox', { name: '거래처 목록' })
}

/**
 * 자동완성 입력에 검색어를 넣고 후보를 li[role="option"] 로 확인 후 클릭 선택한다.
 * 선택 후 listbox 닫힘 + 입력값 반영까지 단언한다.
 */
async function searchAndPick(
  page: Page,
  inputTestId: string,
  query: string,
  optionName: RegExp,
  expectedValue: string,
): Promise<void> {
  const input = page.getByTestId(inputTestId)
  await input.click()
  await input.fill(query)

  const listbox = partnerListbox(page)
  await expect(listbox).toBeVisible({ timeout: 5_000 })

  // 네이티브 <select><option> 이 아닌 커스텀 listbox 의 li[role="option"] 임을 구조로 단언.
  const option = listbox.locator('li[role="option"]').filter({ hasText: optionName })
  await expect(option.first()).toBeVisible()
  await option.first().click()

  await expect(listbox).not.toBeVisible()
  await expect(input).toHaveValue(expectedValue)
}

/**
 * activeOnly 차등 — SUSPENDED '미래시스템' 검색이 "검색 결과 없음" 이어야 한다
 * (mock /admin/partners/search 가 status=ACTIVE 파라미터로 실제 필터).
 */
async function expectActiveOnlyEmpty(page: Page, inputTestId: string): Promise<void> {
  const input = page.getByTestId(inputTestId)
  await input.click()
  await input.fill('미래')
  await expect(page.getByText('검색 결과 없음')).toBeVisible({ timeout: 5_000 })
}

// ============================================================
// 1) 수금계획 — 등록 + 필터
// ============================================================

test.describe('AC-4 수금계획 (collection-plans)', () => {
  test('CP-1 등록 자동완성 선택 → 등록 → 목록 반영 → 거래처 필터 왕복(partnerCode 증명)', async ({ page }) => {
    await installAuthMock(page)
    await blockLiveGatewayLeaks(page)
    await gotoPage(page, '/accounting/reports/collection-plans', 'collection-plan-partner')

    // 등록 자동완성 — 검색/후보/선택/닫힘/반영
    await searchAndPick(
      page, 'collection-plan-partner', '엘에이', /엘에이시스템에어/, '엘에이시스템에어',
    )

    // UUID 비공개 가드 — 선택 직후 본문 전체
    const bodyText = await page.locator('body').textContent()
    expect(bodyText).not.toMatch(UUID_PATTERN)

    // 금액 입력 후 등록 (예정일/근거는 기본값)
    await page.getByLabel('금액').fill('5000000')
    await page.getByRole('button', { name: '등록', exact: true }).click()

    // 등록 성공 → 폼 리셋(입력 클리어) + 목록 invalidate 로 신규 행 표시
    await expect(page.getByTestId('collection-plan-partner')).toHaveValue('', { timeout: 5_000 })
    await expect(page.getByRole('cell', { name: '엘에이시스템에어' })).toBeVisible()
    // POST payload partnerCode 가 mock echo 로 목록 행 거래처코드(빈 값 아님)로 왕복됨
    await expect(page.getByRole('cell', { name: '1234567890' })).toBeVisible()

    // 필터 자동완성으로 동일 거래처 조회 → 등록 행만 남고 시드 행 제외
    // (mock GET 이 partnerCode 파라미터로 서버측 필터 — payload/파라미터 왕복 증명)
    await searchAndPick(
      page, 'collection-plan-partner-filter', '엘에이', /엘에이시스템에어/, '엘에이시스템에어',
    )
    await page.getByRole('button', { name: '조회' }).click()

    await expect(page.getByRole('cell', { name: '엘에이시스템에어' })).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('삼한공조 A')).toHaveCount(0)
    await expect(page.getByText('아로물류 B')).toHaveCount(0)
  })

  test('CP-2 등록=거래중(activeOnly)만·필터=전체 — SUSPENDED 거래처 차등 노출', async ({ page }) => {
    await installAuthMock(page)
    await blockLiveGatewayLeaks(page)
    await gotoPage(page, '/accounting/reports/collection-plans', 'collection-plan-partner')

    // 등록측: activeOnly → status=ACTIVE 전송 → SUSPENDED '미래시스템' 미노출
    await expectActiveOnlyEmpty(page, 'collection-plan-partner')

    // 필터측: status 미전송 → '미래시스템' 후보 표시
    const filterInput = page.getByTestId('collection-plan-partner-filter')
    await filterInput.click()
    await filterInput.fill('미래')
    const listbox = partnerListbox(page)
    await expect(listbox).toBeVisible({ timeout: 5_000 })
    await expect(
      listbox.locator('li[role="option"]').filter({ hasText: '미래시스템' }),
    ).toBeVisible()
  })
})

// ============================================================
// 2) 받을어음 — 등록(키보드 선택) + 필터
// ============================================================

test.describe('AC-4 받을어음 (notes-receivable)', () => {
  test('NR-1 키보드 ↓/Enter 선택 → 등록 → 거래처 필터 왕복(partnerCode 증명)', async ({ page }) => {
    await installAuthMock(page)
    await blockLiveGatewayLeaks(page)
    await gotoPage(page, '/accounting/reports/notes-receivable', 'notes-receivable-partner')

    // 키보드 선택 경로 — ArrowDown + Enter
    const regInput = page.getByTestId('notes-receivable-partner')
    await regInput.click()
    await regInput.fill('엘에이')
    const listbox = partnerListbox(page)
    await expect(listbox).toBeVisible({ timeout: 5_000 })
    await expect(regInput).toHaveAttribute('aria-expanded', 'true')
    await regInput.press('ArrowDown')
    await regInput.press('Enter')
    await expect(regInput).toHaveValue('엘에이시스템에어')
    await expect(listbox).not.toBeVisible()

    // 어음번호/금액 입력 후 등록
    await page.getByLabel('어음번호').fill('NR-E2E-825')
    await page.getByLabel('금액').fill('1000000')
    await page.getByRole('button', { name: '등록', exact: true }).click()

    // 등록 성공 → 폼 리셋 + 신규 행 표시
    await expect(regInput).toHaveValue('', { timeout: 5_000 })
    await expect(page.getByRole('cell', { name: 'NR-E2E-825' })).toBeVisible()

    // 필터 왕복 — 등록 시 보낸 partnerCode 로 서버측 필터되어 시드 행이 제외된다
    await searchAndPick(
      page, 'notes-receivable-partner-filter', '엘에이', /엘에이시스템에어/, '엘에이시스템에어',
    )
    await page.getByRole('button', { name: '조회' }).click()

    await expect(page.getByRole('cell', { name: 'NR-E2E-825' })).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('NR-2026-0001')).toHaveCount(0)
    await expect(page.getByText('NR-2026-0002')).toHaveCount(0)
  })
})

// ============================================================
// 3) 전표현황 — 필터 자동완성 (activeOnly 아님 + 거래처별 조회 필터)
// ============================================================

test.describe('AC-4 전표현황 (journal-status)', () => {
  test('JS-1 필터=전체 노출(SUSPENDED 포함) + 거래처별 조회 시 partnerCode 필터 왕복', async ({ page }) => {
    await installAuthMock(page)
    await blockLiveGatewayLeaks(page)
    await gotoPage(page, '/accounting/reports/journal-status', 'journal-status-partner-filter')

    // mock 분개(2026-05-0x) 범위로 기간 설정
    await page.getByLabel('시작일').fill('2026-05-01')
    await page.getByLabel('종료일').fill('2026-05-31')

    // 필터는 activeOnly 미적용 — SUSPENDED '미래시스템' 도 후보 표시 (status 미전송 증명)
    const filterInput = page.getByTestId('journal-status-partner-filter')
    await filterInput.click()
    await filterInput.fill('미래')
    const listbox = partnerListbox(page)
    await expect(listbox).toBeVisible({ timeout: 5_000 })
    await expect(
      listbox.locator('li[role="option"]').filter({ hasText: '미래시스템' }),
    ).toBeVisible()

    // '주식회사 윌리' 선택 (검색어 교체 → 새 후보)
    await filterInput.fill('윌리')
    const willyOption = listbox.locator('li[role="option"]').filter({ hasText: '주식회사 윌리' })
    await expect(willyOption.first()).toBeVisible({ timeout: 5_000 })
    await willyOption.first().click()
    await expect(filterInput).toHaveValue('주식회사 윌리')

    // 거래처별 그룹 + 조회 — mock 이 partnerCode 파라미터로 라인 필터 (한일빌딩 제외)
    await page.getByRole('button', { name: '거래처별' }).click()
    await page.getByRole('button', { name: '조회' }).click()

    await expect(page.getByRole('cell', { name: '주식회사 윌리' }).first()).toBeVisible({ timeout: 5_000 })
    await expect(page.getByRole('cell', { name: '한일빌딩' })).toHaveCount(0)
  })
})

// ============================================================
// 4) 일마감 — 실행 거래처 (activeOnly + 실행 성공 왕복)
// ============================================================

test.describe('AC-4 일마감 (daily-closings)', () => {
  test('DC-1 실행 거래처 activeOnly + 선택 반영 + 마감 실행 성공(메모 초기화)', async ({ page }) => {
    await installAuthMock(page)
    await blockLiveGatewayLeaks(page)
    await gotoPage(page, '/accounting/daily-closings', 'daily-closing-exec-partner')

    // activeOnly — SUSPENDED '미래시스템' 미노출
    await expectActiveOnlyEmpty(page, 'daily-closing-exec-partner')

    // ACTIVE 거래처 검색/선택/반영
    await searchAndPick(
      page, 'daily-closing-exec-partner', '엘에이', /엘에이시스템에어/, '엘에이시스템에어',
    )

    // 마감 실행 — in-process POST 성공 → onSuccess 가 메모를 초기화한다.
    // (payload partnerCode 자체는 in-process mock 정적 목록이라 화면 미반영 —
    //  vitest DailyClosingPage.test.tsx 의 createDailyClosing payload 단언이 담당)
    const memo = page.getByTestId('daily-closing-exec-description')
    await memo.fill('AC-4 E2E 마감 검증')
    await page.getByTestId('daily-closing-exec-button').click()
    await expect(memo).toHaveValue('', { timeout: 5_000 })
  })
})

// ============================================================
// 5) 발송금지 거래처 — 단건 등록 다이얼로그 (POST payload 직접 단언)
// ============================================================

test.describe('AC-4 발송금지 거래처 (blocked-partners)', () => {
  test('BP-1 다이얼로그 자동 포커스 + 자동완성 선택 → POST payload partnerCode 단언 → 닫힘', async ({ page }) => {
    await installAuthMock(page)
    await blockLiveGatewayLeaks(page)

    // POST /api/v1/partners/admin/blocks 는 in-process 미핸들 → 실 HTTP fallthrough →
    // page.route 로 payload 를 직접 캡처한다 (GET 목록은 in-process 라 여기 도달하지 않음).
    let capturedBody: { partnerCode?: string; blockReason?: string } | null = null
    await page.route('**/api/v1/partners/admin/blocks', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue()
        return
      }
      capturedBody = route.request().postDataJSON() as {
        partnerCode?: string
        blockReason?: string
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(envelope({
          id: 'block-e2e-001',
          partnerCode: capturedBody?.partnerCode ?? '',
          businessNameSnapshot: '엘에이시스템에어',
          blockReason: capturedBody?.blockReason ?? null,
          blockedAt: '2026-07-17T10:00:00+09:00',
          source: 'MANUAL',
        })),
      })
    })

    await gotoPage(page, '/admin/blocked-partners', 'admin-blocked-add-button')

    await page.getByTestId('admin-blocked-add-button').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // [#825 R1 L3] 구 input autoFocus 복원 — 다이얼로그 열림 직후 거래처 입력 포커스
    const partnerInput = page.getByTestId('admin-blocked-add-partner-code-input')
    await expect(partnerInput).toBeFocused({ timeout: 3_000 })

    // 자동완성 검색/후보/선택
    await partnerInput.fill('엘에이')
    const listbox = partnerListbox(page)
    await expect(listbox).toBeVisible({ timeout: 5_000 })

    // UUID 비공개 가드 — listbox 텍스트
    const listboxText = await listbox.textContent()
    expect(listboxText).not.toMatch(UUID_PATTERN)

    await listbox.locator('li[role="option"]').filter({ hasText: '엘에이시스템에어' }).first().click()
    await expect(partnerInput).toHaveValue('엘에이시스템에어')
    await expect(listbox).not.toBeVisible()

    // 사유 입력 + 차단 등록 → POST payload 단언
    await page.getByTestId('admin-blocked-add-reason-input').fill('825 회귀 검증 차단')
    await page.getByRole('button', { name: '차단 등록' }).click()

    await expect.poll(() => capturedBody, { timeout: 5_000 }).not.toBeNull()
    expect(capturedBody!.partnerCode).toBe('1234567890')
    expect(capturedBody!.blockReason).toBe('825 회귀 검증 차단')

    // 등록 성공 → 다이얼로그 닫힘
    await expect(dialog).not.toBeVisible({ timeout: 5_000 })
  })
})
