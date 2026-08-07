import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #877 / PR #918 — CODEX SOL 5.6 2차 적대검증 라이브 QA.
 *
 * 판정 질문은 "실 사용자 경로로 재현 가능한 결함이 있는가?" 하나뿐이다.
 * mock OFF 렌더러 + 실 게이트웨이/DB를 기본으로 사용한다.
 *
 * 각도:
 *  1. 여러 필터를 오가며 저장→재진입→재저장 반복
 *  2. 실서버 scope에 stale ref 상태를 만든 뒤 재진입·재저장
 *  3. 재진입 후 화면 체크 상태와 재저장 payload 대조
 *  4. 두 독립 브라우저 세션의 동일 scope 동시 편집
 *  5. 미저장 scopeMode=null / ALL+[] / ALL+null·미전송 경계
 *  6. 별도 mock renderer와 실 BE의 핵심 화면 결과 비교
 *
 * 공유 scope는 (user, connectedId) 싱글턴이다. beforeAll에서 원본을 캡처하고
 * afterAll에서 실 PUT 후 실 GET으로 정확 복원한다.
 */
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5420'
const MOCK_BASE_URL = process.env['MOCK_AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5421'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const LOGIN_ID = process.env['DEV_LOGIN'] ?? 'dev_master'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const CONNECTED = 'connected-main'
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/877-luna-fix'))
fs.mkdirSync(SHOTS, { recursive: true })

const ACC = {
  kb: '국민 123456-78-901234',
  shinhan: '신한 987654-32-109876',
  woori: '우리 222222-33-444444',
  hana: '하나 555555-66-777777',
}
const CARD = {
  c1111: '삼한 법인카드 1111',
  c2222: '삼한 법인카드 2222',
  c3333: '삼한 법인카드 3333',
}
const LOAN = {
  first: '기업운전자금대출-001',
  second: '시설자금대출-002',
}

interface LoginResult {
  token: string
  role: string
  userId: string
  displayName: string
}

interface Scope {
  connectedId: string
  accountRefs: string[]
  cardRefs: string[]
  loanRefs: string[]
  defaultImportType: 'ALL' | 'BANK' | 'CARD' | 'LOAN'
  scopeMode: 'ALL' | 'SELECTED' | null
}

let LOGIN: LoginResult
let TOKEN = ''
let ORIGINAL_SCOPE: Scope | null = null

async function login(req: APIRequestContext, loginId = LOGIN_ID): Promise<LoginResult> {
  const res = await req.post(`${API_BASE}/auth/login`, {
    data: { loginId, password: PASSWORD },
  })
  expect(res.ok(), `로그인 실패: HTTP ${res.status()}`).toBeTruthy()
  const data = (await res.json()).data ?? {}
  return {
    token: data.token ?? '',
    role: data.role ?? '',
    userId: data.userId ?? '',
    displayName: data.displayName ?? loginId,
  }
}

async function installAuth(page: Page, auth: LoginResult = LOGIN): Promise<void> {
  await page.addInitScript(
    ({ token, role, userId, displayName }: LoginResult) => {
      Object.defineProperty(window, 'samhanAuth', {
        configurable: true,
        value: {
          getToken: async () => ({
            token,
            userId,
            role,
            fullName: displayName,
            partnerCode: null,
          }),
          setToken: async () => undefined,
          clearToken: async () => undefined,
        },
      })
    },
    auth,
  )
}

function authHeaders(token = TOKEN): Record<string, string> {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

async function getScope(
  req: APIRequestContext,
  connectedId = CONNECTED,
  token = TOKEN,
): Promise<Scope> {
  const res = await req.get(
    `${API_BASE}/accounting/codef/scopes?connectedId=${encodeURIComponent(connectedId)}`,
    { headers: authHeaders(token) },
  )
  expect(res.ok(), `GET scope(${connectedId}) HTTP ${res.status()}`).toBeTruthy()
  return (await res.json()).data as Scope
}

async function putScope(req: APIRequestContext, body: Record<string, unknown>): Promise<Scope> {
  const res = await req.put(`${API_BASE}/accounting/codef/scopes`, {
    headers: authHeaders(),
    data: body,
  })
  const raw = await res.text()
  expect(res.ok(), `PUT scope HTTP ${res.status()} ${raw}`).toBeTruthy()
  return (JSON.parse(raw).data ?? {}) as Scope
}

async function dismissUpdateModal(page: Page): Promise<void> {
  for (const label of ['닫기', '확인']) {
    const button = page.getByRole('button', { name: label })
    if (await button.count().catch(() => 0)) {
      await button.first().click().catch(() => undefined)
      await page.waitForTimeout(150)
    }
  }
}

async function gotoReal(page: Page, expectedRole = 'MASTER'): Promise<void> {
  // vite.renderer.dev.config.ts는 VITE_PLATFORM=web을 정의하지 않으므로 HashRouter다.
  await page.goto(`${BASE_URL}/#/accounting/bank-transactions`, {
    waitUntil: 'domcontentloaded',
  })
  await expect(page.getByText(expectedRole).first()).toBeVisible({ timeout: 25_000 })
  await dismissUpdateModal(page)
  if ((await page.getByTestId('codef-import-type').count()) === 0) {
    console.log(`[ROUTE-PROBE] url=${page.url()}`)
    console.log(`[ROUTE-PROBE] body=${(await page.locator('body').innerText()).slice(0, 4000)}`)
    await shot(page, '00-route-probe-codef-form-missing')
  }
  await expect(page.getByTestId('codef-import-type')).toBeVisible({ timeout: 20_000 })
  await page.getByTestId('codef-import-type').scrollIntoViewIfNeeded()
  await page.waitForTimeout(900)
}

async function gotoMock(page: Page): Promise<void> {
  await page.goto(
    `${MOCK_BASE_URL}/#/accounting/bank-transactions?mockRole=MASTER`,
    { waitUntil: 'domcontentloaded' },
  )
  if ((await page.getByTestId('codef-import-type').count()) === 0) {
    console.log(`[MOCK-ROUTE-PROBE] url=${page.url()}`)
    console.log(`[MOCK-ROUTE-PROBE] body=${(await page.locator('body').innerText()).slice(0, 4000)}`)
  }
  await expect(page.getByTestId('codef-import-type')).toBeVisible({ timeout: 20_000 })
  await page.getByTestId('codef-import-type').scrollIntoViewIfNeeded()
  await page.waitForTimeout(600)
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true })
}

async function setType(page: Page, type: 'ALL' | 'BANK' | 'CARD' | 'LOAN'): Promise<void> {
  await page.getByTestId('codef-import-type').selectOption(type)
  await page.waitForTimeout(250)
}

async function leaveAllScopeIfNeeded(page: Page): Promise<void> {
  const allChip = page.getByTestId('codef-all-scope-chip')
  const pressable = allChip.locator('[role="button"]').first()
  if ((await pressable.getAttribute('aria-pressed')) === 'true') {
    await page.getByRole('button', { name: '전체 범위 제거' }).click()
    await expect(pressable).toHaveAttribute('aria-pressed', 'false')
  }
}

async function setExactChecks(
  page: Page,
  bank: boolean[],
  cards: boolean[],
  loans: boolean[],
): Promise<void> {
  await setType(page, 'ALL')
  await leaveAllScopeIfNeeded(page)
  for (const [prefix, values] of [
    ['codef-bank-account', bank],
    ['codef-card', cards],
    ['codef-loan', loans],
  ] as const) {
    for (let i = 0; i < values.length; i += 1) {
      const checkbox = page.getByTestId(`${prefix}-${i}`)
      if (values[i]) await checkbox.check()
      else await checkbox.uncheck()
    }
  }
}

async function saveAndWait(page: Page): Promise<void> {
  const response = page.waitForResponse(
    (res) => res.request().method() === 'PUT'
      && res.url().includes('/accounting/codef/scopes'),
    { timeout: 20_000 },
  )
  await page.getByTestId('codef-save-scope-button').click()
  const saved = await response
  expect(saved.ok(), `화면 저장 PUT HTTP ${saved.status()}`).toBeTruthy()
  await page.waitForTimeout(450)
}

async function assertExactVisibleChecks(
  page: Page,
  bank: boolean[],
  cards: boolean[],
  loans: boolean[],
): Promise<void> {
  await setType(page, 'ALL')
  for (const [prefix, values] of [
    ['codef-bank-account', bank],
    ['codef-card', cards],
    ['codef-loan', loans],
  ] as const) {
    for (let i = 0; i < values.length; i += 1) {
      const checkbox = page.getByTestId(`${prefix}-${i}`)
      if (values[i]) await expect(checkbox).toBeChecked()
      else await expect(checkbox).not.toBeChecked()
    }
  }
}

function selectedBody(
  accountRefs: string[],
  cardRefs: string[],
  loanRefs: string[],
  defaultImportType: Scope['defaultImportType'] = 'ALL',
): Record<string, unknown> {
  return {
    connectedId: CONNECTED,
    accountRefs,
    cardRefs,
    loanRefs,
    defaultImportType,
    scopeMode: 'SELECTED',
  }
}

async function newRealPage(browser: Browser): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext()
  const page = await context.newPage()
  await installAuth(page)
  return { page, close: () => context.close() }
}

test.describe.serial('#877 SOL 2차 — 실사용자 도달성 라이브 QA', () => {
  test.beforeAll(async ({ playwright }) => {
    const req = await playwright.request.newContext()
    LOGIN = await login(req)
    TOKEN = LOGIN.token
    ORIGINAL_SCOPE = await getScope(req)
    console.log(`[beforeAll] 원본 scope: ${JSON.stringify(ORIGINAL_SCOPE)}`)
    await req.dispose()
  })

  test.afterAll(async ({ playwright }) => {
    const req = await playwright.request.newContext()
    if (ORIGINAL_SCOPE) {
      await putScope(req, {
        connectedId: CONNECTED,
        accountRefs: ORIGINAL_SCOPE.accountRefs ?? [],
        cardRefs: ORIGINAL_SCOPE.cardRefs ?? [],
        loanRefs: ORIGINAL_SCOPE.loanRefs ?? [],
        defaultImportType: ORIGINAL_SCOPE.defaultImportType ?? 'ALL',
        scopeMode: ORIGINAL_SCOPE.scopeMode ?? 'ALL',
      })
      const restored = await getScope(req)
      console.log(`[afterAll] 원본 복원 GET: ${JSON.stringify(restored)}`)
      expect(restored).toEqual(ORIGINAL_SCOPE)
    }
    await req.dispose()
  })

  test.beforeEach(async ({ page }) => {
    await installAuth(page)
  })

  test('각도 1·3 + OPUS #1·#2 — 필터 3종 저장을 반복해도 정확한 선택만 생존한다', async ({ page }) => {
    await putScope(
      page.request,
      selectedBody([ACC.kb], [CARD.c1111], [LOAN.first], 'ALL'),
    )
    await gotoReal(page)
    await assertExactVisibleChecks(
      page,
      [true, false, false, false],
      [true, false, false],
      [true, false],
    )

    // round 1: 계좌 하나 추가 후 CARD 필터에서 저장
    await page.getByTestId('codef-bank-account-1').check()
    await setType(page, 'CARD')
    await saveAndWait(page)
    const round1 = await getScope(page.request)
    console.log(`[ROUND-1 CARD 저장] ${JSON.stringify(round1)}`)
    expect(round1.accountRefs).toEqual([ACC.kb, ACC.shinhan])
    expect(round1.cardRefs).toEqual([CARD.c1111])
    expect(round1.loanRefs).toEqual([LOAN.first])
    await shot(page, '01-round1-card-filter-save-all-categories-preserved')

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByText('MASTER').first()).toBeVisible({ timeout: 25_000 })
    await dismissUpdateModal(page)
    await expect(page.getByTestId('codef-import-type')).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(900)
    await assertExactVisibleChecks(
      page,
      [true, true, false, false],
      [true, false, false],
      [true, false],
    )
    await shot(page, '02-round1-reentry-exact-check-state')

    // round 2: 카드 1111 해제 + 2222 선택, BANK 필터에서 저장
    await page.getByTestId('codef-card-0').uncheck()
    await page.getByTestId('codef-card-1').check()
    await setType(page, 'BANK')
    await saveAndWait(page)
    const round2 = await getScope(page.request)
    console.log(`[ROUND-2 BANK 저장] ${JSON.stringify(round2)}`)
    expect(round2.accountRefs).toEqual([ACC.kb, ACC.shinhan])
    expect(round2.cardRefs).toEqual([CARD.c2222])
    expect(round2.loanRefs).toEqual([LOAN.first])
    await shot(page, '03-round2-bank-filter-intentional-card-change')

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByText('MASTER').first()).toBeVisible({ timeout: 25_000 })
    await dismissUpdateModal(page)
    await expect(page.getByTestId('codef-import-type')).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(900)
    await assertExactVisibleChecks(
      page,
      [true, true, false, false],
      [false, true, false],
      [true, false],
    )

    // round 3: 추가했던 신한을 실제 해제하고 대출2 추가, LOAN 필터에서 저장.
    await page.getByTestId('codef-bank-account-1').uncheck()
    await page.getByTestId('codef-loan-1').check()
    await setType(page, 'LOAN')
    await saveAndWait(page)
    const round3 = await getScope(page.request)
    console.log(`[ROUND-3 LOAN 저장] ${JSON.stringify(round3)}`)
    expect(round3.accountRefs).toEqual([ACC.kb])
    expect(round3.cardRefs).toEqual([CARD.c2222])
    expect(round3.loanRefs).toEqual([LOAN.first, LOAN.second])

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByText('MASTER').first()).toBeVisible({ timeout: 25_000 })
    await dismissUpdateModal(page)
    await expect(page.getByTestId('codef-import-type')).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(900)
    await assertExactVisibleChecks(
      page,
      [true, false, false, false],
      [false, true, false],
      [true, true],
    )
    await shot(page, '04-round3-reentry-no-loss-no-resurrection')
  })

  test('SOL-877 본체 — 계좌 3개·카드 2개를 CARD 필터로 저장해도 재진입 시 계좌 3개가 생존한다', async ({ page }) => {
    await putScope(
      page.request,
      selectedBody(
        [ACC.kb, ACC.shinhan, ACC.woori],
        [CARD.c1111, CARD.c2222],
        [LOAN.first],
        'ALL',
      ),
    )
    await gotoReal(page)
    await assertExactVisibleChecks(
      page,
      [true, true, true, false],
      [true, true, false],
      [true, false],
    )

    await setType(page, 'CARD')
    await saveAndWait(page)
    const saved = await getScope(page.request)
    console.log(`[SOL-877 본체 CARD 저장] ${JSON.stringify(saved)}`)
    expect(saved.accountRefs).toEqual([ACC.kb, ACC.shinhan, ACC.woori])
    expect(saved.cardRefs).toEqual([CARD.c1111, CARD.c2222])
    expect(saved.loanRefs).toEqual([LOAN.first])
    expect(saved.scopeMode).toBe('SELECTED')

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByText('MASTER').first()).toBeVisible({ timeout: 25_000 })
    await dismissUpdateModal(page)
    await expect(page.getByTestId('codef-import-type')).toBeVisible({ timeout: 20_000 })
    await assertExactVisibleChecks(
      page,
      [true, true, true, false],
      [true, true, false],
      [true, false],
    )
    await shot(page, '18-877-three-accounts-two-cards-card-filter-reentry')
  })

  test('각도 2 — stale ref 상태의 재진입·재저장 실측(삭제 동작 자체는 DRY_RUN 고정목록이라 대체 fixture)', async ({ page }) => {
    const staleRef = `SOL-STALE-ACCOUNT-${Date.now()}`
    await putScope(
      page.request,
      selectedBody([ACC.kb, staleRef], [CARD.c1111], [], 'ALL'),
    )
    await gotoReal(page)
    await setType(page, 'ALL')

    // 서버 scope에는 3개 ref가 있지만 실 목록에 없는 stale ref는 화면 chip/checkbox가 없다.
    const before = await getScope(page.request)
    const chipsBefore = await page.getByTestId('codef-selected-chip').count()
    console.log(
      `[STALE fixture] serverRefs=${JSON.stringify(before)} visibleChipCount=${chipsBefore} staleRef=${staleRef}`,
    )
    expect(before.accountRefs).toContain(staleRef)
    expect(chipsBefore).toBe(2)
    await shot(page, '05-stale-ref-server-present-but-ui-hidden')

    // 사용자가 보이는 카드만 하나 더 선택하고 저장하면 raw selection이 hidden stale ref도 재저장한다.
    await page.getByTestId('codef-card-1').check()
    await setType(page, 'CARD')
    await saveAndWait(page)
    const after = await getScope(page.request)
    console.log(`[STALE 재저장] ${JSON.stringify(after)}`)
    expect(after.accountRefs).toContain(staleRef)
    expect(after.cardRefs).toEqual([CARD.c1111, CARD.c2222])
    await shot(page, '06-stale-ref-hidden-and-resaved-after-visible-card-change')
  })

  test('각도 4 — 두 세션 last-write가 상대 카테고리의 직전 추가를 실제로 지운다', async ({ browser, page }) => {
    await putScope(page.request, selectedBody([ACC.kb], [CARD.c1111], [], 'ALL'))

    const sessionA = await newRealPage(browser)
    const sessionB = await newRealPage(browser)
    try {
      await Promise.all([gotoReal(sessionA.page), gotoReal(sessionB.page)])
      await Promise.all([
        assertExactVisibleChecks(
          sessionA.page,
          [true, false, false, false],
          [true, false, false],
          [false, false],
        ),
        assertExactVisibleChecks(
          sessionB.page,
          [true, false, false, false],
          [true, false, false],
          [false, false],
        ),
      ])

      // A: 신한 계좌 추가 저장
      await sessionA.page.getByTestId('codef-bank-account-1').check()
      await setType(sessionA.page, 'BANK')
      await saveAndWait(sessionA.page)
      const afterA = await getScope(sessionA.page.request)
      console.log(`[CONCURRENCY after A] ${JSON.stringify(afterA)}`)
      expect(afterA.accountRefs).toEqual([ACC.kb, ACC.shinhan])
      await shot(sessionA.page, '07-concurrency-session-a-added-shinhan-and-saved')

      // B는 A 저장 전 snapshot을 유지한 채 카드 2222만 추가하고 저장한다.
      await sessionB.page.getByTestId('codef-card-1').check()
      await setType(sessionB.page, 'CARD')
      await shot(sessionB.page, '08-concurrency-session-b-stale-snapshot-before-save')
      await saveAndWait(sessionB.page)
      const afterB = await getScope(sessionB.page.request)
      console.log(`[CONCURRENCY after B last-write] ${JSON.stringify(afterB)}`)

      // 실제 관측 결함: B의 stale 전체 payload가 A의 신한 추가를 지웠다.
      expect(afterB.cardRefs).toEqual([CARD.c1111, CARD.c2222])
      expect(afterB.accountRefs).toEqual([ACC.kb])
      console.log(
        '[DEFECT-REPRODUCED] 두 세션 last-write: A가 저장한 신한 계좌가 B의 카드 저장 뒤 실 GET에서 소멸',
      )

      await gotoReal(page)
      await assertExactVisibleChecks(
        page,
        [true, false, false, false],
        [true, true, false],
        [false, false],
      )
      await shot(page, '09-concurrency-final-reentry-shinhan-lost')
    } finally {
      await Promise.all([sessionA.close(), sessionB.close()])
    }
  })

  test('각도 5 + OPUS #3 — scopeMode가 미저장 null과 ALL 빈 배열을 실제로 구분한다', async ({ page }) => {
    const neverSavedId = `sol-877-never-saved-${Date.now()}`
    const neverSaved = await getScope(page.request, neverSavedId)
    console.log(`[NULL 미저장 GET] ${JSON.stringify(neverSaved)}`)
    expect(neverSaved.scopeMode).toBeNull()
    expect(neverSaved.accountRefs).toEqual([])
    expect(neverSaved.cardRefs).toEqual([])
    expect(neverSaved.loanRefs).toEqual([])

    await gotoReal(page)
    await setType(page, 'ALL')
    const allChip = page.getByTestId('codef-all-scope-chip')
    await allChip.locator('[role="button"]').first().click()
    await expect(allChip.locator('[role="button"]').first()).toHaveAttribute('aria-pressed', 'true')
    await saveAndWait(page)
    const allEmpty = await getScope(page.request)
    console.log(`[ALL + [] 화면 저장 GET] ${JSON.stringify(allEmpty)}`)
    expect(allEmpty.scopeMode).toBe('ALL')
    expect(allEmpty.accountRefs).toEqual([])
    expect(allEmpty.cardRefs).toEqual([])
    expect(allEmpty.loanRefs).toEqual([])
    await shot(page, '10-all-scope-empty-arrays-distinct-from-unsaved-null')

    const nullArrays = await putScope(page.request, {
      connectedId: CONNECTED,
      accountRefs: null,
      cardRefs: null,
      loanRefs: null,
      defaultImportType: 'ALL',
      scopeMode: 'ALL',
    })
    console.log(`[ALL + null arrays PUT 응답] ${JSON.stringify(nullArrays)}`)
    expect(nullArrays.scopeMode).toBe('ALL')
    expect(nullArrays.accountRefs).toEqual([])

    const omittedArrays = await putScope(page.request, {
      connectedId: CONNECTED,
      defaultImportType: 'ALL',
      scopeMode: 'ALL',
    })
    console.log(`[ALL + arrays 미전송 PUT 응답] ${JSON.stringify(omittedArrays)}`)
    expect(omittedArrays.scopeMode).toBe('ALL')
    expect(omittedArrays.accountRefs).toEqual([])
  })

  test('OPUS #4 — dirty CARD 가져오기는 실 POST에서도 카드 ref만 보내고 기존 행에 중복 처리된다', async ({ page }) => {
    await putScope(
      page.request,
      selectedBody([ACC.kb], [CARD.c1111], [LOAN.first], 'ALL'),
    )
    await gotoReal(page)
    await setType(page, 'CARD') // dirty SELECTED 경로
    await page.getByTestId('codef-import-from').fill('2020-03-01')
    await page.getByTestId('codef-import-to').fill('2020-03-03')

    let postBody = ''
    page.on('request', (request) => {
      if (
        request.method() === 'POST'
        && request.url().includes('/accounting/codef/import-scoped')
      ) {
        postBody = request.postData() ?? ''
      }
    })
    const responsePromise = page.waitForResponse(
      (res) => res.request().method() === 'POST'
        && res.url().includes('/accounting/codef/import-scoped'),
      { timeout: 30_000 },
    )
    await page.getByTestId('codef-import-button').click()
    const response = await responsePromise
    const responseBody = await response.text()
    console.log(`[IMPORT CARD POST body] ${postBody}`)
    console.log(`[IMPORT CARD POST HTTP ${response.status()}] ${responseBody}`)
    expect(response.ok()).toBeTruthy()
    const parsed = JSON.parse(postBody)
    expect(parsed.type).toBe('CARD')
    expect(parsed.scopeMode).toBe('SELECTED')
    expect(parsed.accountRefs).toEqual([])
    expect(parsed.cardRefs).toEqual([CARD.c1111])
    expect(parsed.loanRefs).toEqual([])
    const result = JSON.parse(responseBody).data
    expect(result.importedCount).toBe(0)
    expect(result.duplicateSkippedCount).toBeGreaterThan(0)
    await expect(page.getByTestId('codef-import-result')).toBeVisible()
    await shot(page, '11-real-import-card-only-existing-data-no-new-rows')
  })

  test('OPUS #5 — 저장/복원 게이트를 실 DOM에서 재확인한다', async ({ page }) => {
    await putScope(page.request, selectedBody([ACC.kb], [], [], 'BANK'))
    await gotoReal(page)
    await expect(page.getByTestId('codef-save-scope-button')).toBeEnabled()
    await expect(page.getByTestId('codef-import-button')).toBeEnabled()

    // 현재 선택이 없는 CARD로 필터를 바꾸면 두 버튼 모두 비활성 + 사용자 안내.
    await setType(page, 'CARD')
    await expect(page.getByTestId('codef-save-scope-button')).toBeDisabled()
    await expect(page.getByTestId('codef-import-button')).toBeDisabled()
    await expect(page.getByTestId('codef-restored-scope-invalid')).toBeVisible()
    console.log('[GATE] BANK 선택 복원 후 CARD(선택 0) 전환: 저장/가져오기 disabled + 안내 visible')
    await shot(page, '12-gate-empty-current-filter-disables-save-and-import')
  })

  test('각도 6 — mock과 실 BE가 같은 핵심 저장 동작에서 동일한 화면 결과를 낸다', async ({ browser, page }) => {
    await putScope(page.request, selectedBody([ACC.kb], [CARD.c1111], [], 'ALL'))
    await gotoReal(page)
    await setExactChecks(
      page,
      [true, true, false, false],
      [true, true, false],
      [false, false],
    )
    await setType(page, 'CARD')
    await saveAndWait(page)
    await setType(page, 'ALL')
    const realChecks = {
      bank0: await page.getByTestId('codef-bank-account-0').isChecked(),
      bank1: await page.getByTestId('codef-bank-account-1').isChecked(),
      card0: await page.getByTestId('codef-card-0').isChecked(),
      card1: await page.getByTestId('codef-card-1').isChecked(),
    }
    await shot(page, '13-parity-real-be-after-card-filter-save')

    const mockContext = await browser.newContext()
    const mockPage = await mockContext.newPage()
    try {
      await gotoMock(mockPage)
      await setExactChecks(
        mockPage,
        [true, true, false],
        [true, true, false],
        [false, false],
      )
      await setType(mockPage, 'CARD')
      await mockPage.getByTestId('codef-save-scope-button').click()
      await expect(mockPage.getByText('가져오기 선택을 저장했습니다.')).toBeVisible()
      await setType(mockPage, 'ALL')
      const mockChecks = {
        bank0: await mockPage.getByTestId('codef-bank-account-0').isChecked(),
        bank1: await mockPage.getByTestId('codef-bank-account-1').isChecked(),
        card0: await mockPage.getByTestId('codef-card-0').isChecked(),
        card1: await mockPage.getByTestId('codef-card-1').isChecked(),
      }
      console.log(`[PARITY real] ${JSON.stringify(realChecks)}`)
      console.log(`[PARITY mock] ${JSON.stringify(mockChecks)}`)
      expect(mockChecks).toEqual(realChecks)
      await shot(mockPage, '14-parity-mock-after-card-filter-save')
    } finally {
      await mockContext.close()
    }
  })

  test('OPUS #6 — #915 권한 조합 복원 anchor 대상 실화면이 안정적으로 렌더된다', async ({ page }) => {
    await putScope(page.request, selectedBody([ACC.kb], [], [], 'BANK'))
    for (let i = 1; i <= 5; i += 1) {
      await gotoReal(page)
      await expect(page.getByTestId('codef-selected-chip')).toBeVisible({ timeout: 10_000 })
      await expect(page.getByTestId('codef-bank-account-0')).toBeChecked()
      console.log(`[ANCHOR ${i}/5] selected-chip visible + bank-account-0 checked`)
    }
    await shot(page, '15-restored-selection-anchor-fifth-navigation')
  })

  test('각도 6 후속 — 실 BE 최초 저장 성공 뒤 미저장 안내가 사라지고 복원 안내만 남는다', async ({ page }) => {
    const accountant = await login(page.request, 'dev_accountant')
    const before = await getScope(page.request, CONNECTED, accountant.token)
    console.log(`[FIRST-SAVE before] ${JSON.stringify(before)}`)
    expect(before.scopeMode).toBeNull()

    await installAuth(page, accountant)
    await gotoReal(page, 'ACCOUNTANT')
    await expect(
      page.getByText('저장된 선택이 없습니다. 필요한 항목을 선택한 뒤 저장하세요.'),
    ).toBeVisible()
    await expect(
      page.getByText('저장된 선택을 복원했습니다. 그대로 가져오거나 항목을 바꿔 다시 저장할 수 있습니다.'),
    ).toBeHidden()
    await shot(page, '16-first-save-before-save-unsaved-hint')
    await setExactChecks(
      page,
      [true, false, false, false],
      [false, false, false],
      [false, false],
    )
    await setType(page, 'BANK')
    await saveAndWait(page)

    const after = await getScope(page.request, CONNECTED, accountant.token)
    console.log(`[FIRST-SAVE after real PUT] ${JSON.stringify(after)}`)
    expect(after.scopeMode).toBe('SELECTED')
    expect(after.accountRefs).toEqual([ACC.kb])

    await expect(page.getByText('가져오기 선택을 저장했습니다.')).toBeVisible()
    await expect(
      page.getByText('저장된 선택이 없습니다. 필요한 항목을 선택한 뒤 저장하세요.'),
    ).toBeHidden()
    await expect(
      page.getByText('저장된 선택을 복원했습니다. 그대로 가져오거나 항목을 바꿔 다시 저장할 수 있습니다.'),
    ).toBeVisible()
    console.log(
      '[SOL-877-2 FIXED] 최초 저장 HTTP 200 뒤 성공 토스트·복원 안내만 노출되고 미저장 안내는 사라짐',
    )
    await shot(page, '16-first-save-success-no-unsaved-hint')

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByText('ACCOUNTANT').first()).toBeVisible({ timeout: 25_000 })
    await dismissUpdateModal(page)
    await expect(page.getByTestId('codef-import-type')).toBeVisible({ timeout: 20_000 })
    await expect(
      page.getByText('저장된 선택이 없습니다. 필요한 항목을 선택한 뒤 저장하세요.'),
    ).toBeHidden()
    await expect(
      page.getByText('저장된 선택을 복원했습니다. 그대로 가져오거나 항목을 바꿔 다시 저장할 수 있습니다.'),
    ).toBeVisible()
    await shot(page, '17-first-save-reentry-restored-hint-only')
  })
})
