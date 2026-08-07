/**
 * PR #925 (#920) — 개발책임자 바운드 결정(2026-07-25) 되돌림 검증 라운드 B.
 *
 * rA-closing.spec.ts(닫는 적대검증 리뷰어 A)가 실측한 A1(무음 데이터 파괴)·A2/A3(거짓 안심 +
 * 무음 삭제)는 05b8c9e5a 의 새 신호 2개(selectionDirty 조기 반환 / scopeCoversLatest) 가
 * 원인이었다. 개발책임자가 "UX 기제 2개 되돌리고 머지"를 선택해 그 두 기제를 제거했다. 이
 * 스펙은 A1/A2/A3 과 동일한 시나리오를 동일한 방식(page.route 가로채기, 실 데스크톱 렌더러
 * :5253)으로 재현해:
 *   - Z1 — A1 이 재현되지 않는가(재확인 성공 후 저장이 서버 선택을 조용히 지우지 않는가)
 *   - Z2 — A2/B-1 이 재현되지 않는가(배너가 사실이 아닌 "삭제되지 않습니다"를 말하지 않는가)
 *   - Z3 — N-1/N-3(scopeConfirmedThisMount·scopeBaselineUnconfirmed, reconfirmConflictLatest)
 *          는 되돌리지 않았으므로 여전히 닫혀 있는가
 * 를 값으로 확인한다.
 *
 * 🚨 공유 connected-main CODEF 범위 미접촉 — GET/PUT/import 전부 page.route 로 가로채고
 * 실제로 나간 PUT/import 본문을 Node 쪽 배열에 기록해 값 자체를 관측한다(presence-only 금지).
 * 🚨 기존 docs/qa/920-codef-scope-lock/** 캡처(01~04, r3-*, r4-verify/*, rA-closing/*)를
 * 절대 덮어쓰지 않는다 — 이 스펙 전용 새 하위폴더(rB-bound-revert)에만 쓴다.
 */
import { expect, test, type Page, type Route } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['QA_BASE_URL'] ?? 'http://127.0.0.1:5253'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? (process.env.DEV_PASSWORD ?? '')
// 새 전용 하위폴더 — docs/qa/** 기존 파일(01~04, r3-*, r4-verify/*, rA-closing/*) 절대 미접촉.
// resolveQaShotsDir 로 감싸 재실행이 이 전용 폴더 자신의 기존 증거도 덮어쓰지 않게 한다
// (2026-07-26 하네스 재수렴 라운드 G2).
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/920-codef-scope-lock/rB-bound-revert'))

interface LoginResult { token: string; role: string; userId: string; displayName: string }

async function realLogin(page: Page): Promise<LoginResult> {
  const res = await page.request.post(`${API_BASE}/auth/login`, { data: { loginId: 'dev_master', password: PASSWORD } })
  expect(res.ok(), `로그인 실패: HTTP ${res.status()}`).toBeTruthy()
  const d = (await res.json()).data ?? {}
  return { token: d.token ?? '', role: d.role ?? '', userId: d.userId ?? '', displayName: d.displayName ?? 'dev_master' }
}

async function installAuthStub(page: Page, login: LoginResult): Promise<void> {
  await page.addInitScript(
    ({ tok, r, uid, name }: { tok: string; r: string; uid: string; name: string }) => {
      Object.defineProperty(window, 'samhanAuth', {
        configurable: true,
        value: {
          getToken: async () => ({ token: tok, userId: uid, role: r, fullName: name, partnerCode: null }),
          setToken: async () => undefined,
          clearToken: async () => undefined,
        },
      })
    },
    { tok: login.token, r: login.role, uid: login.userId, name: login.displayName },
  )
}

function envelope<T>(data: T) {
  return { success: true, code: 'OK', message: '', data, timestamp: new Date().toISOString() }
}

const BANK_ACCOUNTS = [
  { ref: 'rB-kb-001', name: '국민운영', bankName: '국민은행', accountNumber: '111-111' },
  { ref: 'rB-woori-001', name: '우리운영', bankName: '우리은행', accountNumber: '222-222' },
  { ref: 'rB-hana-001', name: '하나운영', bankName: '하나운영', accountNumber: '333-333' },
]
const KB = BANK_ACCOUNTS[0]!.ref
const WOORI = BANK_ACCOUNTS[1]!.ref

type Json = Record<string, unknown>

interface Recorder {
  getScopeBodies: Json[]
  putScopeBodies: Json[]
  importBodies: Json[]
  getCalls: () => number
}

async function installCodefMocks(
  page: Page,
  handlers: {
    onScopeGet: (callIndex: number, route: Route) => Promise<void>
    onScopePut?: (callIndex: number, route: Route, body: Json) => Promise<void>
  },
): Promise<Recorder> {
  let getCalls = 0
  let putCalls = 0
  const rec: Recorder = { getScopeBodies: [], putScopeBodies: [], importBodies: [], getCalls: () => getCalls }
  await page.route('**/accounting/codef/bank-accounts**', (route) =>
    route.fulfill({ json: envelope({ accounts: BANK_ACCOUNTS }) }))
  await page.route('**/accounting/codef/cards**', (route) => route.fulfill({ json: envelope({ cards: [] }) }))
  await page.route('**/accounting/codef/loans**', (route) => route.fulfill({ json: envelope({ loans: [] }) }))
  await page.route('**/accounting/codef/import-scoped**', async (route) => {
    rec.importBodies.push(route.request().postDataJSON() as Json)
    await route.fulfill({
      json: envelope({
        fetchedCount: 0, importedCount: 0, duplicateSkippedCount: 0, matchedCount: 0,
        staleSkippedCount: 0, staleNormalizedNames: [], unavailableSkippedCount: 0, unavailableNames: [],
      }),
    })
  })
  await page.route('**/accounting/codef/scopes**', async (route) => {
    const req = route.request()
    if (req.method() === 'GET') {
      await handlers.onScopeGet(getCalls++, route)
    } else if (req.method() === 'PUT') {
      const body = req.postDataJSON() as Json
      rec.putScopeBodies.push(body)
      const idx = putCalls++
      if (handlers.onScopePut) await handlers.onScopePut(idx, route, body)
      else await route.fulfill({ json: envelope({ ...body, version: ((body['version'] as number | null) ?? -1) + 1 }) })
    } else {
      await route.continue()
    }
  })
  return rec
}

async function gotoScopeScreen(page: Page): Promise<void> {
  // 이 렌더러는 HashRouter 를 쓴다(Electron/mock/dev — routes/index.tsx:1727).
  // 경로만(path) goto 하면 해시가 비어 대시보드(기본 라우트)로 떨어진다 — 반드시 `#/...`.
  await page.goto(`${BASE_URL}/#/accounting/bank-transactions`)
  await page.waitForLoadState('domcontentloaded')
  await page.locator('[data-testid="codef-bank-account-0"]').waitFor({ state: 'visible', timeout: 25000 })
}

async function leaveAndReenter(page: Page): Promise<void> {
  await page.locator('[data-testid="sidebar-accounting-deposit-mapping"]').click()
  await page.waitForLoadState('domcontentloaded')
  await page.locator('[data-testid="sidebar-accounting-bank-transactions"]').click()
  await page.locator('[data-testid="codef-bank-account-0"]').waitFor({ state: 'visible', timeout: 25000 })
}

async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: path.join(SHOTS, name) })
}

async function panelText(page: Page): Promise<string> {
  return (await page.locator('.codef-import-panel').innerText()).replace(/\s+/g, ' ')
}

// ─────────────────────────────────────────────────────────────────────────────
// B1(Z1) — A1 재현 시나리오를 되돌림 이후 다시 실행한다. 서버 선택(국민)이 화면에
// 드러나는가, 저장이 그것을 무음 삭제하지 않는가?
// ─────────────────────────────────────────────────────────────────────────────
test('B1(Z1) — 확인 실패 후 재확인 성공 시 서버 선택(국민)이 화면에 드러나고, 저장이 그것을 무음 삭제하지 않는다', async ({ page }) => {
  const login = await realLogin(page)
  await installAuthStub(page, login)
  const saved = {
    connectedId: 'connected-main', accountRefs: [KB], cardRefs: [], loanRefs: [],
    defaultImportType: 'BANK', scopeMode: 'SELECTED', version: 9,
  }
  const rec = await installCodefMocks(page, {
    onScopeGet: async (idx, route) => {
      if (idx === 0) await route.fulfill({ json: envelope(saved) })
      else if (idx === 1) await route.fulfill({ status: 503, json: { success: false, code: 'SERVICE_UNAVAILABLE', message: '일시 장애', data: null } })
      else await route.fulfill({ json: envelope(saved) })   // 재확인 성공 — 서버엔 여전히 국민만
    },
  })

  await gotoScopeScreen(page)
  await expect(page.locator('[data-testid="codef-bank-account-0"]')).toBeChecked()
  await shot(page, 'b1-01-initial-kb-restored.png')

  await leaveAndReenter(page)
  await page.locator('[data-testid="codef-scope-unconfirmed"]').waitFor({ state: 'visible', timeout: 10000 })
  await shot(page, 'b1-02-reentry-unconfirmed.png')

  // 확인 실패 창에서 사용자가 우리은행을 체크한다(A1 과 동일한 재현 경로).
  await page.locator('[data-testid="codef-bank-account-1"]').check()
  console.log('[B1] 확인실패창 체크 후 저장버튼 disabled =', await page.locator('[data-testid="codef-save-scope-button"]').isDisabled())

  // "다시 확인" → 성공. 서버는 국민만 저장돼 있다.
  await page.locator('[data-testid="codef-scope-reconfirm-button"]').click()
  await expect(page.locator('[data-testid="codef-scope-unconfirmed"]')).toHaveCount(0, { timeout: 10000 })
  await expect(page.locator('[data-testid="codef-save-scope-button"]')).toBeEnabled()

  const text = await panelText(page)
  console.log('[B1] 재확인 성공 직후 패널 전문 =', text)
  console.log('[B1] 국민 체크 =', await page.locator('[data-testid="codef-bank-account-0"]').isChecked(),
    '| 우리 체크 =', await page.locator('[data-testid="codef-bank-account-1"]').isChecked())
  await shot(page, 'b1-03-reconfirmed-server-selection-revealed.png')

  // Z1 핵심 — A1 에서는 재확인 성공 후에도 국민이 화면에 드러나지 않고 우리만 체크된 채였다.
  // 되돌림 이후에는 서버 선택(국민)이 화면에 그대로 반영되어야 한다.
  expect(await page.locator('[data-testid="codef-bank-account-0"]').isChecked(), 'Z1 — 국민이 체크로 드러난다(A1 재현 아님)').toBe(true)
  expect(await page.locator('[data-testid="codef-bank-account-1"]').isChecked(), 'Z1 — 확인 전 미저장 클릭(우리)은 서버 값으로 대체된다').toBe(false)

  // 저장 — 실제로 나가는 PUT 본문을 관측한다.
  await page.locator('[data-testid="codef-save-scope-button"]').click()
  await expect.poll(() => rec.putScopeBodies.length, { timeout: 10000 }).toBe(1)
  console.log('[B1] PUT 본문 =', JSON.stringify(rec.putScopeBodies[0]))
  await page.waitForTimeout(500)
  await shot(page, 'b1-04-saved-kb-preserved.png')

  // Z1 — 서버가 실제로 가진 국민 선택이 저장에서 사라지지 않는다.
  // (A1 은 정반대였다: rec.putScopeBodies[0].accountRefs === [WOORI] — 국민이 PUT 에서 소거.)
  expect(rec.putScopeBodies[0]!['accountRefs'], 'Z1 — PUT 이 국민을 유지한다(A1 재현 아님)').toEqual([KB])
  // version=9 자체는 문제가 아니다 — A1 의 결함은 "그 버전에 어떤 selection 이 실렸는가"였다.
  expect(rec.putScopeBodies[0]!['version']).toBe(9)
  expect(rec.putScopeBodies[0]!['defaultImportType'], 'Z1 — 저장돼 있던 BANK 가 무음으로 ALL 로 덮이지 않는다').toBe('BANK')
})

// ─────────────────────────────────────────────────────────────────────────────
// B2(Z2) — A2 재현 시나리오를 되돌림 이후 다시 실행한다. '전체' 칩을 눌러도 배너가 계속
// 삭제 경고를 유지하고 일반 저장이 잠긴 채인가?
// ─────────────────────────────────────────────────────────────────────────────
test('B2(Z2) — 충돌 배너에서 전체 칩을 눌러도 배너는 계속 삭제 경고를 유지하고 일반 저장은 잠긴 채다', async ({ page }) => {
  const login = await realLogin(page)
  await installAuthStub(page, login)
  const initial = {
    connectedId: 'connected-main', accountRefs: [KB], cardRefs: [], loanRefs: [],
    defaultImportType: 'BANK', scopeMode: 'SELECTED', version: 0,
  }
  const latest = { ...initial, accountRefs: [KB, WOORI], version: 1 }
  const rec = await installCodefMocks(page, {
    onScopeGet: async (idx, route) => {
      if (idx === 0) await route.fulfill({ json: envelope(initial) })
      else await route.fulfill({ json: envelope(latest) })
    },
    onScopePut: async (idx, route, body) => {
      if (idx === 0) await route.fulfill({ status: 409, json: { success: false, code: 'CODEF_SCOPE_OPTIMISTIC_LOCK_CONFLICT', message: '충돌', data: null } })
      else await route.fulfill({ json: envelope({ ...body, version: ((body['version'] as number) ?? 0) + 1 }) })
    },
  })

  await gotoScopeScreen(page)
  await expect(page.locator('[data-testid="codef-save-scope-button"]')).toBeEnabled()
  await page.locator('[data-testid="codef-save-scope-button"]').click()
  await page.locator('[data-testid="codef-scope-conflict"]').waitFor({ state: 'visible', timeout: 10000 })
  const before = (await page.locator('[data-testid="codef-scope-conflict"]').innerText()).replace(/\s+/g, ' ')
  console.log('[B2] 충돌 배너(전체 칩 누르기 전) =', before)
  await shot(page, 'b2-01-conflict-not-covering.png')

  // 사용자가 '전체' 칩을 누른다 — A2 와 동일한 조작.
  await page.locator('[data-testid="codef-all-scope-chip"] [role="button"]').first().click()
  await page.waitForTimeout(400)
  const after = (await page.locator('[data-testid="codef-scope-conflict"]').innerText()).replace(/\s+/g, ' ')
  console.log('[B2] 충돌 배너(전체 칩 누른 후) =', after)
  const saveEnabledAfterAllChip = await page.locator('[data-testid="codef-save-scope-button"]').isEnabled()
  console.log('[B2] 일반 저장 활성 =', saveEnabledAfterAllChip,
    '| 명시 우회 버튼 =', await page.locator('[data-testid="codef-scope-overwrite-button"]').count())
  await shot(page, 'b2-02-all-chip-still-warns.png')

  // Z2 핵심 — A2 는 여기서 "삭제되지 않습니다"로 뒤집혔다(scopeMode='ALL' 무조건 포괄 판정).
  // 되돌림 이후에는 배너·잠금 모두 변하지 않아야 한다.
  expect(after, 'Z2 — 배너는 여전히 삭제 경고를 유지한다(안전 오선언 없음)').toContain('지워질 수 있습니다')
  expect(after, 'Z2 — "삭제되지 않습니다" 오선언이 없다').not.toContain('삭제되지 않습니다')
  expect(saveEnabledAfterAllChip, 'Z2 — 일반 저장은 계속 잠긴다(포괄 예외 없음)').toBe(false)

  // 명시 버튼(K5)으로만 진행한다.
  const overwriteButton = page.locator('[data-testid="codef-scope-overwrite-button"]')
  await expect(overwriteButton).toBeVisible({ timeout: 5000 })
  await expect(overwriteButton).toBeEnabled()
  await overwriteButton.click()
  await expect.poll(() => rec.putScopeBodies.length, { timeout: 10000 }).toBe(2)
  console.log('[B2] PUT#1(충돌) =', JSON.stringify(rec.putScopeBodies[0]))
  console.log('[B2] PUT#2(전체 저장, 명시 버튼 경유) =', JSON.stringify(rec.putScopeBodies[1]))
  await shot(page, 'b2-03-after-explicit-overwrite.png')

  expect(rec.putScopeBodies[1]!['accountRefs'], 'PUT 은 여전히 국민·우리 refs 를 비운다(ALL 의미상 정상 — 문제는 배너 오선언뿐이었다)').toEqual([])
  expect(rec.putScopeBodies[1]!['scopeMode']).toBe('ALL')
})

// ─────────────────────────────────────────────────────────────────────────────
// B3(Z2) — A3 재현 시나리오를 되돌림 이후 다시 실행한다. 저장된 ALL 충돌에서
// defaultImportType 이 좁혀진 경우에도 배너가 안전을 오선언하지 않는가?
// ─────────────────────────────────────────────────────────────────────────────
test('B3(Z2) — 저장된 ALL 충돌: defaultImportType 이 좁혀져도 배너가 안전을 오선언하지 않는다', async ({ page }) => {
  const login = await realLogin(page)
  await installAuthStub(page, login)
  const initial = {
    connectedId: 'connected-main', accountRefs: [], cardRefs: [], loanRefs: [],
    defaultImportType: 'BANK', scopeMode: 'ALL', version: 0,
  }
  // 다른 창이 그 사이 "카드만" 으로 좁혀 저장했다.
  const latest = { ...initial, defaultImportType: 'CARD', version: 1 }
  const rec = await installCodefMocks(page, {
    onScopeGet: async (idx, route) => {
      if (idx === 0) await route.fulfill({ json: envelope(initial) })
      else await route.fulfill({ json: envelope(latest) })
    },
    onScopePut: async (idx, route, body) => {
      if (idx === 0) await route.fulfill({ status: 409, json: { success: false, code: 'CODEF_SCOPE_OPTIMISTIC_LOCK_CONFLICT', message: '충돌', data: null } })
      else await route.fulfill({ json: envelope({ ...body, version: ((body['version'] as number) ?? 0) + 1 }) })
    },
  })

  await gotoScopeScreen(page)
  await page.waitForTimeout(600)

  await page.locator('[data-testid="codef-save-scope-button"]').click()
  await page.locator('[data-testid="codef-scope-conflict"]').waitFor({ state: 'visible', timeout: 10000 })
  const banner = (await page.locator('[data-testid="codef-scope-conflict"]').innerText()).replace(/\s+/g, ' ')
  console.log('[B3] 충돌 배너 =', banner)
  const saveEnabled = await page.locator('[data-testid="codef-save-scope-button"]').isEnabled()
  console.log('[B3] 일반 저장 활성 =', saveEnabled,
    '| 우회 버튼 =', await page.locator('[data-testid="codef-scope-overwrite-button"]').count())
  await shot(page, 'b3-01-all-conflict-still-warns.png')

  // Z2 핵심 — A3 는 여기서 "삭제되지 않습니다"로 뒤집혔다(scopeMode='ALL' 판정이
  // defaultImportType 을 비교하지 않아서). 되돌림 이후에는 배너·잠금 모두 변하지 않는다.
  expect(banner, 'Z2 — 배너는 여전히 삭제 경고를 유지한다').toContain('지워질 수 있습니다')
  expect(banner, 'Z2 — "삭제되지 않습니다" 오선언이 없다').not.toContain('삭제되지 않습니다')
  expect(saveEnabled, 'Z2 — 일반 저장은 계속 잠긴다').toBe(false)

  const overwriteButton = page.locator('[data-testid="codef-scope-overwrite-button"]')
  await expect(overwriteButton).toBeVisible({ timeout: 5000 })
  await overwriteButton.click()
  await expect.poll(() => rec.putScopeBodies.length, { timeout: 10000 }).toBe(2)
  console.log('[B3] PUT#2 =', JSON.stringify(rec.putScopeBodies[1]))
  await shot(page, 'b3-02-after-explicit-overwrite.png')
  // F1 불변식 — 충돌(거부)은 화면의 미저장 선택(여기서는 최초 로드값 그대로인 type='BANK')을
  // 지우거나 바꾸는 사유가 아니다. 사용자가 range 드롭다운을 건드리지 않았으므로 명시
  // 덮어쓰기도 화면에 있던 그 값(BANK) 그대로 재전송한다 — "ALL 로 확대"는 애초에 이
  // 시나리오에서 일어나지 않는다(scopeMode='ALL'은 범위 전체 선택을, defaultImportType 은
  // 별개인 계좌/카드/대출 필터 드롭다운을 가리킨다 — 서로 다른 필드).
  expect(rec.putScopeBodies[1]!['defaultImportType'], 'F1 — 충돌이 화면의 미변경 type(BANK)을 바꾸지 않는다').toBe('BANK')
})

// ─────────────────────────────────────────────────────────────────────────────
// B4(Z3) — N-1 재진입 확인 창 잠금은 되돌림 이후에도 유지되는가?
// ─────────────────────────────────────────────────────────────────────────────
test('B4(Z3) — N-1 재진입 확인 창의 가져오기·저장 잠금은 되돌림 이후에도 유지된다', async ({ page }) => {
  const login = await realLogin(page)
  await installAuthStub(page, login)
  const saved = {
    connectedId: 'connected-main', accountRefs: [KB], cardRefs: [], loanRefs: [],
    defaultImportType: 'ALL', scopeMode: 'SELECTED', version: 3,
  }
  const rec = await installCodefMocks(page, {
    onScopeGet: async (idx, route) => {
      if (idx === 0) await route.fulfill({ json: envelope(saved) })
      else { await new Promise((r) => setTimeout(r, 3000)); await route.fulfill({ json: envelope(saved) }) }
    },
  })

  await gotoScopeScreen(page)
  await expect(page.locator('[data-testid="codef-bank-account-0"]')).toBeChecked()

  await leaveAndReenter(page)
  await page.waitForTimeout(600)
  const confirming = await page.locator('[data-testid="codef-scope-confirming"]').count()
  const importDisabled = await page.locator('[data-testid="codef-import-button"]').isDisabled()
  console.log('[B4] 확인중 배너 =', confirming, '| 가져오기 disabled =', importDisabled)
  await shot(page, 'b4-01-reentry-confirming-locked.png')
  expect(confirming, 'Z3 — 확인 중 배너가 뜬다(N-1 유지)').toBe(1)
  expect(importDisabled, 'Z3 — 확인 중에는 가져오기가 잠긴다(N-1 유지)').toBe(true)

  await page.locator('[data-testid="codef-bank-account-1"]').check()
  expect(await page.locator('[data-testid="codef-import-button"]').isDisabled(), 'Z3 — 체크해도 확인 전에는 여전히 잠긴다').toBe(true)

  await expect(page.locator('[data-testid="codef-scope-confirming"]')).toHaveCount(0, { timeout: 10000 })
  await expect(page.locator('[data-testid="codef-import-button"]')).toBeEnabled({ timeout: 10000 })
  await shot(page, 'b4-02-confirmed-unlocked.png')

  await page.locator('[data-testid="codef-import-button"]').click()
  await expect.poll(() => rec.importBodies.length, { timeout: 15000 }).toBeGreaterThan(0)
  console.log('[B4] import 본문 =', JSON.stringify(rec.importBodies[rec.importBodies.length - 1]))
  await shot(page, 'b4-03-import-after-confirm.png')
})

// ─────────────────────────────────────────────────────────────────────────────
// B5(Z3) — N-3 latest=null 반복 재확인의 PUT version 전진은 되돌림 이후에도 유지되는가?
// ─────────────────────────────────────────────────────────────────────────────
test('B5(Z3) — latest=null 충돌에서 배너 버튼 반복 클릭 시 PUT version 이 여전히 전진한다(맹목적 재PUT 없음)', async ({ page }) => {
  const login = await realLogin(page)
  await installAuthStub(page, login)
  const initial = {
    connectedId: 'connected-main', accountRefs: [KB], cardRefs: [], loanRefs: [],
    defaultImportType: 'BANK', scopeMode: 'SELECTED', version: 3,
  }
  const latest = { ...initial, accountRefs: [KB, WOORI], version: 8 }
  let getIdx = 0
  const rec = await installCodefMocks(page, {
    onScopeGet: async (_i, route) => {
      const idx = getIdx++
      if (idx === 0) await route.fulfill({ json: envelope(initial) })
      else if (idx <= 4) await route.fulfill({ status: 503, json: { success: false, code: 'SERVICE_UNAVAILABLE', message: '장애', data: null } })
      else await route.fulfill({ json: envelope(latest) })
    },
    onScopePut: async (_idx, route, body) => {
      if ((body['version'] as number) !== 8) {
        await route.fulfill({ status: 409, json: { success: false, code: 'CODEF_SCOPE_OPTIMISTIC_LOCK_CONFLICT', message: '충돌', data: null } })
      } else await route.fulfill({ json: envelope({ ...body, version: 9 }) })
    },
  })

  await gotoScopeScreen(page)
  await page.locator('[data-testid="codef-save-scope-button"]').click()
  await page.locator('[data-testid="codef-scope-conflict"]').waitFor({ state: 'visible', timeout: 10000 })
  expect(await page.locator('[data-testid="codef-scope-overwrite-button"]').count(),
    'Z3 — latest=null 에서는 구 "다시 저장" 버튼이 없다(N-3 유지)').toBe(0)

  for (let i = 0; i < 3; i += 1) {
    await page.locator('[data-testid="codef-scope-conflict-reconfirm-button"]').click()
    await page.waitForTimeout(500)
  }
  await shot(page, 'b5-01-reconfirm-loop-no-blind-put.png')
  expect(rec.putScopeBodies.length, 'Z3 — 재확인 반복 중에는 PUT 이 나가지 않는다').toBe(1)

  await page.locator('[data-testid="codef-scope-conflict-reconfirm-button"]').click()
  await page.locator('[data-testid="codef-scope-overwrite-button"]').waitFor({ state: 'visible', timeout: 10000 })
  await page.locator('[data-testid="codef-scope-overwrite-button"]').click()
  await expect.poll(() => rec.putScopeBodies.length, { timeout: 10000 }).toBe(2)
  console.log('[B5] PUT version 열 =', JSON.stringify(rec.putScopeBodies.map((b) => b['version'])))
  await shot(page, 'b5-02-recovered-and-saved.png')

  expect(rec.putScopeBodies.map((b) => b['version']), 'Z3 — 맹목적 재PUT 없이 version 이 전진한다(N-3 유지)').toEqual([3, 8])
})
