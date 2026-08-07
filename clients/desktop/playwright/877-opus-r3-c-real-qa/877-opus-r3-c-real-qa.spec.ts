import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * 877-opus-r3-c-real-qa.spec.ts
 *
 * OPUS 4.8 재수렴 라운드 · 표면 C — "선행 세 fix 가 4단계(design-system DataTable +
 * BankTransactionPage 조건부 컬럼) 이후에도 살아 있는가"를 실서버(:5420 · mock OFF)로
 * 직접 실행해 확인한다.
 *
 *   단계1 (#877 본체)   buildScopePayload SELECTED = selection(원본)
 *                       → 저장 시 type 필터 밖 카테고리가 보존된다
 *   단계2 (SOL-877-2)   saveMutation.onSuccess 의 queryClient.setQueryData
 *                       → 저장 성공 뒤 "저장된 선택이 없습니다" 가 안 뜬다
 *   단계3 (R-1)         buildImportPayload 의 복원 clean SELECTED 분기 삭제
 *                       → 화면에 없는 카테고리가 가져오기 실행에 참여하지 않는다
 *
 * 🚨 안전조치 — 가져오기 POST(`/accounting/codef/import-scoped`)는 page.route 로
 * 가로채 payload 만 검증하고 합성 200 으로 fulfill 한다. 실 CODEF 조회/BE import 가
 * 전혀 일어나지 않으므로 회계 원장(bank_transaction)에 아무것도 적재되지 않는다.
 * 저장(PUT)만 실제로 실행되며 afterAll 이 connected-main 의 원본 scope 를 복원한다.
 *
 * 🚨 단계2 는 "한 번도 저장한 적 없는 사용자"(GET scopeMode=null)에서만 도달 가능하다.
 * dev_master 는 이미 저장된 행이 있어 그 상태를 만들 수 없으므로, 활성 scope 행이 없는
 * 실 계정 dev_accountant(회계원 · accounting.bank-matching create/update 보유)로 실행한다.
 *
 * ⚠️ 실행 후 정리 의무 — C-3 은 dev_accountant 의 scope 행을 새로 만든다(삭제 API 없음).
 * 실행 뒤 아래로 반드시 원상복구(활성 행 0 = 원래 상태)해야 다음 실행의 전제가 성립한다:
 *   docker exec samhan-postgres psql -U samhan -d accounting_db -c \
 *     "UPDATE user_codef_import_scope SET is_deleted=true, deleted_at=CURRENT_TIMESTAMP, \
 *      deleted_by='QA-877-OPUS-R3-C' WHERE user_id='a0000000-0000-0000-0000-000000000005' \
 *      AND connected_id='connected-main' AND is_deleted=false;"
 *
 * ⚠️ 대상 서버 — 이 워크트리의 clients/desktop/node_modules 는 메인 트리 심볼릭 링크라
 * :5420(vite.renderer.dev.config.ts)은 `@samhan/design-system` 을 **메인 트리**로 해석한다
 * (= 4단계의 DataTable/CSS 변경이 반영되지 않음). 4단계 전체가 반영된 렌더러는
 * :5470(vite.opus-r3a.tmp.config.ts). 두 곳 모두에서 4 passed 확인함.
 *
 * 실행:
 *   cd clients/desktop
 *   set AUDIT_BASE_URL=http://127.0.0.1:5470
 *   node_modules\.bin\playwright test --config=playwright.real-qa.config.ts \
 *     playwright/877-opus-r3-c-real-qa/877-opus-r3-c-real-qa.spec.ts --reporter=line --timeout=180000
 */
import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5420'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = (process.env.DEV_PASSWORD ?? '')
const CONNECTED = 'connected-main'
const FROM = '2019-05-01'
const TO = '2019-05-03'
const SHOTS = resolveQaShotsDir(path.resolve('../../docs/qa/877-opus-r3-c'))
fs.mkdirSync(SHOTS, { recursive: true })

interface Scope {
  connectedId: string
  accountRefs: string[]
  cardRefs: string[]
  loanRefs: string[]
  defaultImportType: string
  scopeMode: string | null
}

interface Auth { token: string; role: string; userId: string; displayName: string }

let MASTER: Auth
let ACCOUNTANT: Auth
let ORIGINAL: Scope | null = null

async function login(req: APIRequestContext, loginId: string): Promise<Auth> {
  const res = await req.post(`${API_BASE}/auth/login`, { data: { loginId, password: PASSWORD } })
  expect(res.ok(), `${loginId} 로그인 실패 HTTP ${res.status()}`).toBeTruthy()
  const d = (await res.json()).data ?? {}
  return { token: d.token ?? '', role: d.role ?? '', userId: d.userId ?? '', displayName: d.displayName ?? loginId }
}

async function getScope(req: APIRequestContext, auth: Auth): Promise<Scope> {
  const res = await req.get(`${API_BASE}/accounting/codef/scopes?connectedId=${CONNECTED}`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  })
  expect(res.ok(), `GET scope HTTP ${res.status()}`).toBeTruthy()
  return (await res.json()).data as Scope
}

async function installAuth(page: Page, auth: Auth) {
  await page.addInitScript((a) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ token: a.token, userId: a.userId, role: a.role, fullName: a.displayName, partnerCode: null }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, auth)
}

/** 가져오기 POST 를 항상 가로채 실 원장 적재를 원천 차단한다. 캡처된 payload 를 돌려준다. */
async function armImportInterceptor(page: Page): Promise<{ body: () => string | null }> {
  let captured: string | null = null
  await page.route('**/accounting/codef/import-scoped', async (route) => {
    captured = route.request().postData()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        code: 'OK',
        message: '',
        timestamp: new Date().toISOString(),
        data: {
          fetchedCount: 0, importedCount: 0, duplicateSkippedCount: 0, matchedCount: 0,
          staleSkippedCount: 0, staleNormalizedNames: [], unavailableSkippedCount: 0, unavailableNames: [],
        },
      }),
    })
  })
  return { body: () => captured }
}

async function dismissUpdateModal(page: Page) {
  for (const label of ['닫기', '확인']) {
    const b = page.getByRole('button', { name: label })
    if (await b.count().catch(() => 0)) {
      await b.first().click().catch(() => undefined)
      await page.waitForTimeout(150)
    }
  }
}

async function gotoReal(page: Page) {
  await page.goto(`${BASE_URL}/#/accounting/bank-transactions`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('codef-import-type')).toBeVisible({ timeout: 30_000 })
  await dismissUpdateModal(page)
  await page.getByTestId('codef-import-type').scrollIntoViewIfNeeded()
  await page.waitForTimeout(900)
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true })
}

async function setType(page: Page, type: string) {
  await page.getByTestId('codef-import-type').selectOption(type)
  await page.waitForTimeout(300)
}

async function leaveAllScope(page: Page) {
  const pressable = page.getByTestId('codef-all-scope-chip').locator('[role="button"]').first()
  if ((await pressable.getAttribute('aria-pressed')) === 'true') {
    await page.getByRole('button', { name: '전체 범위 제거' }).click()
    await expect(pressable).toHaveAttribute('aria-pressed', 'false')
  }
}

async function headerTexts(page: Page): Promise<string[]> {
  return page.locator('table thead th').allTextContents()
}

test.describe.serial('#877 OPUS R3 표면C — 4단계 이후 선행 세 fix 생존 확인', () => {
  test.beforeAll(async ({ playwright }) => {
    const req = await playwright.request.newContext()
    MASTER = await login(req, 'dev_master')
    ACCOUNTANT = await login(req, 'dev_accountant')
    ORIGINAL = await getScope(req, MASTER)
    const accScope = await getScope(req, ACCOUNTANT)
    console.log(`[beforeAll] dev_master 원본 scope: ${JSON.stringify(ORIGINAL)}`)
    console.log(`[beforeAll] dev_accountant scope(전제 scopeMode=null): ${JSON.stringify(accScope)}`)
    expect(accScope.scopeMode, '단계2 전제 — dev_accountant 는 미저장(scopeMode=null) 이어야 한다').toBeNull()
    await req.dispose()
  })

  test.afterAll(async ({ playwright }) => {
    const req = await playwright.request.newContext()
    if (ORIGINAL) {
      await req.put(`${API_BASE}/accounting/codef/scopes`, {
        headers: { Authorization: `Bearer ${MASTER.token}`, 'Content-Type': 'application/json' },
        data: {
          connectedId: CONNECTED,
          accountRefs: ORIGINAL.accountRefs ?? [],
          cardRefs: ORIGINAL.cardRefs ?? [],
          loanRefs: ORIGINAL.loanRefs ?? [],
          defaultImportType: ORIGINAL.defaultImportType ?? 'ALL',
          scopeMode: ORIGINAL.scopeMode ?? 'ALL',
        },
      })
      console.log(`[afterAll] dev_master 복원 GET: ${JSON.stringify(await getScope(req, MASTER))}`)
    }
    console.log(`[afterAll] dev_accountant 잔존 GET: ${JSON.stringify(await getScope(req, ACCOUNTANT))}`)
    await req.dispose()
  })

  // ────────────────────────────────────────────────────────────────────────
  // C-1 — 단계1(저장 보존) + 단계3(실행 배제) 를 4단계 코드 위에서 실행 확인
  // ────────────────────────────────────────────────────────────────────────
  test('C-1 단계1+3 — 계좌3+카드2 → 범위=카드 저장 → PUT 계좌3 보존 / POST 계좌 배제', async ({ page }) => {
    await installAuth(page, MASTER)
    const imported = await armImportInterceptor(page)
    await gotoReal(page)

    await setType(page, 'ALL')
    await leaveAllScope(page)
    for (const i of [0, 1, 2]) await page.getByTestId(`codef-bank-account-${i}`).check()
    for (const i of [0, 1]) await page.getByTestId(`codef-card-${i}`).check()
    await page.getByTestId('codef-import-from').fill(FROM)
    await page.getByTestId('codef-import-to').fill(TO)
    await page.waitForTimeout(300)
    await shot(page, 'c1-01-all-3accounts-2cards-checked')

    await setType(page, 'CARD')
    await page.waitForTimeout(400)
    expect(await page.getByTestId('codef-bank-account-0').count(), '범위=CARD 에서 계좌 체크박스는 화면에 없어야 한다').toBe(0)
    await shot(page, 'c1-02-card-filter-accounts-hidden')

    let savePut: string | null = null
    page.on('request', (r) => {
      if (r.method() === 'PUT' && r.url().includes('/accounting/codef/scopes')) savePut = r.postData()
    })
    await page.getByTestId('codef-save-scope-button').click()
    await expect(page.getByText('가져오기 선택을 저장했습니다.')).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(600)
    console.log(`[C-1 단계1] 저장 PUT body: ${savePut}`)
    const put = savePut ? JSON.parse(savePut) : {}
    expect(put.accountRefs?.length, '단계1 회귀 — 필터 밖 계좌 3개가 저장에서 유실되면 안 된다').toBe(3)
    expect(put.cardRefs?.length).toBe(2)
    expect(put.defaultImportType).toBe('CARD')
    expect(put.scopeMode).toBe('SELECTED')
    await shot(page, 'c1-03-after-save-card-filter')

    // 서버 실 저장분(GET)도 확인 — FE payload 만이 아니라 BE 영속까지
    const server = await page.request.get(`${API_BASE}/accounting/codef/scopes?connectedId=${CONNECTED}`, {
      headers: { Authorization: `Bearer ${MASTER.token}` },
    })
    const serverScope = (await server.json()).data as Scope
    console.log(`[C-1 단계1] 서버 GET scope: ${JSON.stringify(serverScope)}`)
    expect(serverScope.accountRefs.length, '단계1 회귀 — 서버에 계좌 3개가 실제로 남아야 한다').toBe(3)

    // 단계3 — 저장 직후(restoredScope 존재 · clean) 즉시 가져오기
    await page.getByTestId('codef-import-button').click()
    await expect(page.getByTestId('codef-import-result')).toBeVisible({ timeout: 30_000 })
    const post = imported.body() ? JSON.parse(imported.body() as string) : {}
    console.log(`[C-1 단계3] 가져오기 POST body: ${JSON.stringify(post)}`)
    expect(post.type, '단계3 회귀 — 실행 type 이 화면 범위(CARD)와 달라지면 안 된다').toBe('CARD')
    expect(post.accountRefs ?? [], '단계3 회귀 — 화면에 없는 계좌가 실행에 참여하면 안 된다').toEqual([])
    expect(post.cardRefs?.length, '화면에 보이는 카드 2건은 실행돼야 한다').toBe(2)
    expect(post.loanRefs ?? []).toEqual([])
    expect(post.scopeMode).toBe('SELECTED')
    await shot(page, 'c1-04-after-import-card-only')
  })

  // ────────────────────────────────────────────────────────────────────────
  // C-2 — 4단계(조건부 컬럼) 재렌더가 단계1/3 상태머신을 흔드는가
  //       저장 후 상태탭·소스탭 전환(columns useMemo 재계산 실증) → 그래도 실행 범위 불변
  // ────────────────────────────────────────────────────────────────────────
  test('C-2 4단계 간섭 — 탭 전환으로 컬럼이 실제로 바뀐 뒤에도 저장/실행 범위가 그대로', async ({ page }) => {
    await installAuth(page, MASTER)
    const imported = await armImportInterceptor(page)
    await gotoReal(page)

    // 앞 테스트가 남긴 저장(SELECTED · CARD · 계좌3+카드2)을 복원 상태로 진입
    const restoredType = await page.getByTestId('codef-import-type').inputValue()
    console.log(`[C-2] 복원된 범위: ${restoredType}`)
    expect(restoredType, 'C-1 저장분이 복원돼야 이 테스트가 단계3 경로를 탄다').toBe('CARD')
    await expect(page.getByText('저장된 선택을 복원했습니다.', { exact: false })).toBeVisible()
    const chipsBefore = await page.getByTestId('codef-selected-chip').count()
    const cardChecks = await page.locator('[data-testid^="codef-card-"]:checked').count()
    console.log(`[C-2] 탭 전환 전 — 칩 ${chipsBefore}개 · 카드 체크 ${cardChecks}개`)
    await shot(page, 'c2-01-restored-before-tab-switch')

    // 4단계 코드 경로가 실제로 동작함을 먼저 실증 (전체/전체 → 두 열 존재)
    const headersAllAll = await headerTexts(page)
    console.log(`[C-2] 전체/전체 헤더: ${JSON.stringify(headersAllAll)}`)
    expect(headersAllAll, '전체/전체 에서는 소스 열이 있어야 한다(4단계 I-B1)').toContain('소스')
    expect(headersAllAll).toContain('매칭상태')

    // 상태탭 = 미반영, 소스탭 = 카드 로 전환 → 두 열이 사라져야 한다(useMemo 재실행 실증)
    await page.getByRole('button', { name: '미반영', exact: true }).click()
    await page.waitForTimeout(500)
    await page.getByTestId('codef-tab-CODEF_CARD').click()
    await page.waitForTimeout(800)
    const headersNarrow = await headerTexts(page)
    console.log(`[C-2] 미반영/카드 헤더: ${JSON.stringify(headersNarrow)}`)
    expect(headersNarrow, '탭을 좁히면 소스 열이 사라져야 한다').not.toContain('소스')
    expect(headersNarrow, '탭을 좁히면 매칭상태 열이 사라져야 한다').not.toContain('매칭상태')
    await shot(page, 'c2-02-after-tab-switch-columns-narrowed')

    // ⇒ 여기서 CodefImportScopeForm 의 상태가 살아 있는가
    expect(await page.getByTestId('codef-import-type').inputValue(), '탭 전환이 범위 드롭다운을 초기화하면 안 된다').toBe('CARD')
    expect(await page.getByTestId('codef-selected-chip').count(), '탭 전환이 선택 칩을 잃으면 안 된다').toBe(chipsBefore)
    expect(await page.locator('[data-testid^="codef-card-"]:checked').count(), '탭 전환이 체크 상태를 잃으면 안 된다').toBe(cardChecks)
    await expect(page.getByText('저장된 선택을 복원했습니다.', { exact: false }), '탭 전환이 clean(미더티) 상태를 흔들면 안 된다').toBeVisible()
    expect(await page.getByTestId('codef-restored-scope-invalid').count(), '탭 전환 후 잘못된 오류 안내가 뜨면 안 된다').toBe(0)

    // 탭 전환 뒤 가져오기 — 단계3 불변식이 그대로인가
    await page.getByTestId('codef-import-from').fill(FROM)
    await page.getByTestId('codef-import-to').fill(TO)
    await page.waitForTimeout(300)
    await page.getByTestId('codef-import-button').click()
    await expect(page.getByTestId('codef-import-result')).toBeVisible({ timeout: 30_000 })
    const post = imported.body() ? JSON.parse(imported.body() as string) : {}
    console.log(`[C-2 단계3 재확인] 가져오기 POST body: ${JSON.stringify(post)}`)
    expect(post.type, '탭 전환 후에도 실행 type 은 CARD 여야 한다').toBe('CARD')
    expect(post.accountRefs ?? [], '탭 전환 후에도 화면에 없는 계좌는 실행에 없어야 한다').toEqual([])
    expect(post.cardRefs?.length).toBe(2)
    await shot(page, 'c2-03-after-import-post-tab-switch')
  })

  // ────────────────────────────────────────────────────────────────────────
  // C-2b — 단계3 의 I-2("저장을 눌렀는지가 실행 범위를 바꾸지 않는다") dirty 짝
  //        C-1 은 clean(저장 직후) 경로만 봤다. 같은 화면 상태를 dirty 로 만들어
  //        실행 payload 가 동일한지 확인한다.
  // ────────────────────────────────────────────────────────────────────────
  test('C-2b 단계3 I-2 — 같은 화면 상태면 dirty/clean 무관하게 실행 범위가 같다', async ({ page }) => {
    await installAuth(page, MASTER)
    const imported = await armImportInterceptor(page)
    await gotoReal(page)
    expect(await page.getByTestId('codef-import-type').inputValue()).toBe('CARD')

    // 범위를 ALL 로 바꿔 dirty 로 만든 뒤 다시 CARD 로 되돌린다 → 화면 상태는 진입 직후와
    // 동일하지만 selectionDirty=true (복원 clean 분기가 아니라 dirty 분기를 탄다)
    await setType(page, 'ALL')
    const chipsAll = await page.getByTestId('codef-selected-chip').count()
    console.log(`[C-2b] 범위=ALL(dirty) 칩 수: ${chipsAll} (저장 보존된 계좌3+카드2 가 화면에 드러난다)`)
    expect(chipsAll, '단계1 이 보존한 계좌 3 + 카드 2 가 ALL 화면에 모두 보여야 한다').toBe(5)
    await shot(page, 'c2b-01-dirty-all-shows-preserved-5')

    await setType(page, 'CARD')
    await page.waitForTimeout(300)
    expect(await page.getByTestId('codef-selected-chip').count(), 'CARD 로 되돌리면 화면 칩은 다시 2개').toBe(2)
    await expect(page.getByText('저장된 선택을 복원했습니다.', { exact: false })).toHaveCount(0)

    await page.getByTestId('codef-import-from').fill(FROM)
    await page.getByTestId('codef-import-to').fill(TO)
    await page.waitForTimeout(300)
    await page.getByTestId('codef-import-button').click()
    await expect(page.getByTestId('codef-import-result')).toBeVisible({ timeout: 30_000 })
    const post = imported.body() ? JSON.parse(imported.body() as string) : {}
    console.log(`[C-2b 단계3 I-2 dirty] 가져오기 POST body: ${JSON.stringify(post)}`)
    expect(post.type, 'I-2 — dirty 경로도 clean 경로와 같은 type 이어야 한다').toBe('CARD')
    expect(post.accountRefs ?? [], 'I-2 — dirty 경로에서도 화면에 없는 계좌는 실행에 없어야 한다').toEqual([])
    expect(post.cardRefs?.length).toBe(2)
    await shot(page, 'c2b-02-dirty-import-payload-equals-clean')
  })

  // ────────────────────────────────────────────────────────────────────────
  // C-3 — 단계2(저장 성공 뒤 모순 안내) 실행 확인 · 미저장 실계정으로
  // ────────────────────────────────────────────────────────────────────────
  test('C-3 단계2 — 미저장 계정 저장 성공 뒤 "저장된 선택이 없습니다" 가 사라진다', async ({ page }) => {
    await installAuth(page, ACCOUNTANT)
    await armImportInterceptor(page)
    await gotoReal(page)

    const missingHint = page.getByText('저장된 선택이 없습니다.', { exact: false })
    await expect(missingHint, '전제 — 미저장 계정은 저장 전에 미저장 안내가 보여야 한다').toBeVisible({ timeout: 15_000 })
    await shot(page, 'c3-01-before-save-missing-hint-visible')

    await setType(page, 'ALL')
    await leaveAllScope(page)
    await page.getByTestId('codef-card-0').check()
    await page.waitForTimeout(300)

    await page.getByTestId('codef-save-scope-button').click()
    await expect(page.getByText('가져오기 선택을 저장했습니다.')).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(800)
    await shot(page, 'c3-02-after-save-hint-combination')

    const hintTexts = await page.locator('.codef-import-hint').allTextContents()
    console.log(`[C-3 단계2] 저장 직후 안내 문구 전량: ${JSON.stringify(hintTexts)}`)
    await expect(missingHint, '단계2 회귀 — 저장 성공 뒤 "저장된 선택이 없습니다" 가 남으면 안 된다').toHaveCount(0)
    await expect(page.getByText('저장된 선택을 복원했습니다.', { exact: false })).toBeVisible()
    expect(await page.getByTestId('codef-restored-scope-invalid').count()).toBe(0)
  })
})
