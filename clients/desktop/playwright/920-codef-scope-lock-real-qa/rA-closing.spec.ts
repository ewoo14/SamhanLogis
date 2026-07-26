/**
 * 닫는 적대검증 리뷰어 A — 도달성 단일 질문("실 사용자가 화면 조작으로 재현할 수 있는가")으로
 * 05b8c9e5a 의 새 신호 2개를 공격한다.
 *
 * 🚨 공유 connected-main CODEF 범위 미접촉 — GET/PUT/import 전부 page.route 로 가로채고
 * 실제로 나간 PUT/import 본문을 Node 쪽 배열에 기록해 값 자체를 관측한다(presence-only 금지).
 */
import { expect, test, type Page, type Route } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['QA_BASE_URL'] ?? 'http://127.0.0.1:5253'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
// 새 전용 하위폴더 — docs/qa/** 기존 파일(01~04, r3-*, r4-verify/*) 절대 미접촉.
const SHOTS = path.resolve(_dirname, '../../../../docs/qa/920-codef-scope-lock/rA-closing')
fs.mkdirSync(SHOTS, { recursive: true })

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
  { ref: 'rA-kb-001', name: '국민운영', bankName: '국민은행', accountNumber: '111-111' },
  { ref: 'rA-woori-001', name: '우리운영', bankName: '우리은행', accountNumber: '222-222' },
  { ref: 'rA-hana-001', name: '하나운영', bankName: '하나운영', accountNumber: '333-333' },
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
  // 경로만(path) goto 하면 렌더러가 createHashRouter 라 해시가 비어 대시보드(기본 라우트)로
  // 떨어진다(routes/index.tsx — VITE_PLATFORM!=='web' 이면 항상 HashRouter) — 반드시 `#/...`.
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

/** 화면 전체 텍스트(공백 정규화) — "사유가 화면에 보이는가"(N6)를 값으로 관측한다. */
async function panelText(page: Page): Promise<string> {
  return (await page.locator('.codef-import-panel').innerText()).replace(/\s+/g, ' ')
}

/** aria-describedby 가 실제로 존재하는 요소를 가리키는지 + 그 텍스트를 반환한다. */
async function describedByText(page: Page, testId: string): Promise<{ id: string | null; found: boolean; text: string }> {
  return page.evaluate((tid: string) => {
    const el = document.querySelector(`[data-testid="${tid}"]`)
    const id = el?.getAttribute('aria-describedby') ?? null
    if (!id) return { id: null, found: false, text: '' }
    const target = document.getElementById(id)
    return { id, found: Boolean(target), text: target?.textContent?.replace(/\s+/g, ' ').trim() ?? '' }
  }, testId)
}

// ─────────────────────────────────────────────────────────────────────────────
// A1 — 확인 실패 창에서 체크 → 다시 확인 성공 → 저장. 서버 선택이 무음 삭제되는가?
// ─────────────────────────────────────────────────────────────────────────────
test('A1 — 확인 실패 후 재확인 성공 시 서버 선택(국민)이 화면에 드러나는가, 저장이 그것을 무음 삭제하는가', async ({ page }) => {
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
  await shot(page, 'a1-01-initial-kb-restored.png')

  await leaveAndReenter(page)
  await page.locator('[data-testid="codef-scope-unconfirmed"]').waitFor({ state: 'visible', timeout: 10000 })
  await shot(page, 'a1-02-reentry-unconfirmed.png')

  // 확인 실패 창에서 사용자가 우리은행을 체크한다(체크박스는 의도적으로 비활성화되지 않았다).
  await page.locator('[data-testid="codef-bank-account-1"]').check()
  console.log('[A1] 확인실패창 체크 후 저장버튼 disabled =', await page.locator('[data-testid="codef-save-scope-button"]').isDisabled())

  // "다시 확인" → 성공. 서버는 국민만 저장돼 있다.
  await page.locator('[data-testid="codef-scope-reconfirm-button"]').click()
  await expect(page.locator('[data-testid="codef-scope-unconfirmed"]')).toHaveCount(0, { timeout: 10000 })
  await expect(page.locator('[data-testid="codef-save-scope-button"]')).toBeEnabled()

  const text = await panelText(page)
  console.log('[A1] 재확인 성공 직후 패널 전문 =', text)
  console.log('[A1] 국민 체크 =', await page.locator('[data-testid="codef-bank-account-0"]').isChecked(),
    '| 우리 체크 =', await page.locator('[data-testid="codef-bank-account-1"]').isChecked())
  console.log('[A1] 국민 언급 여부 =', text.includes('국민'), '| 충돌배너 =', await page.locator('[data-testid="codef-scope-conflict"]').count())
  await shot(page, 'a1-03-reconfirmed-server-selection-hidden.png')

  // 저장 — 실제로 나가는 PUT 본문을 관측한다.
  await page.locator('[data-testid="codef-save-scope-button"]').click()
  await expect.poll(() => rec.putScopeBodies.length, { timeout: 10000 }).toBe(1)
  console.log('[A1] PUT 본문 =', JSON.stringify(rec.putScopeBodies[0]))
  await page.waitForTimeout(800)
  console.log('[A1] 저장 후 패널 =', await panelText(page))
  await shot(page, 'a1-04-saved-kb-destroyed.png')

  // 체크박스 라벨에는 '국민은행 …' 행이 늘 있으므로, 판정은 "서버가 국민을 저장했다는 공개"가
  // 있는지로 한다 — 칩/배너/복원안내 어디에도 없어야 결함이다.
  expect(text, 'A1 — 서버 선택 공개 문구가 없다').not.toContain('서버에 저장된')
  expect(text, 'A1 — 복원 안내도 없다').not.toContain('저장된 선택을 복원했습니다')
  expect(await page.locator('[data-testid="codef-selected-chip"]').allInnerTexts(),
    'A1 — 칩에는 사용자가 고른 우리만 있고 서버의 국민은 없다').toHaveLength(1)
  expect(await page.locator('[data-testid="codef-bank-account-0"]').isChecked(), 'A1 — 국민 미체크').toBe(false)
  expect(rec.putScopeBodies[0]!['accountRefs'], 'A1 — PUT 이 국민을 제거한다').toEqual([WOORI])
  expect(rec.putScopeBodies[0]!['version'], 'A1 — 서버 최신 version 을 baseline 으로 삼아 409 도 나지 않는다').toBe(9)
  expect(rec.putScopeBodies[0]!['defaultImportType'], 'A1 — 저장돼 있던 BANK 가 화면 기본값 ALL 로 덮인다').toBe('ALL')
})

// ─────────────────────────────────────────────────────────────────────────────
// A2 — 충돌 후 '전체' 칩을 누르면 scopeCoversLatest 가 무조건 true → "삭제되지 않습니다"
// ─────────────────────────────────────────────────────────────────────────────
test('A2 — 충돌 배너에서 전체 칩을 누르면 refs 를 비우는 PUT 이 나가는데 배너는 삭제되지 않는다고 말한다', async ({ page }) => {
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
  console.log('[A2] 충돌 배너(전체 칩 누르기 전) =', before)
  await shot(page, 'a2-01-conflict-not-covering.png')

  // 사용자가 '전체' 칩을 누른다 — 개별 항목을 고르기 귀찮을 때 실제로 자주 하는 조작.
  await page.locator('[data-testid="codef-all-scope-chip"] [role="button"]').first().click()
  await page.waitForTimeout(400)
  const after = (await page.locator('[data-testid="codef-scope-conflict"]').innerText()).replace(/\s+/g, ' ')
  console.log('[A2] 충돌 배너(전체 칩 누른 후) =', after)
  console.log('[A2] 일반 저장 활성 =', await page.locator('[data-testid="codef-save-scope-button"]').isEnabled(),
    '| 명시 우회 버튼 =', await page.locator('[data-testid="codef-scope-overwrite-button"]').count())
  await shot(page, 'a2-02-all-chip-declares-safe.png')

  await page.locator('[data-testid="codef-save-scope-button"]').click()
  await expect.poll(() => rec.putScopeBodies.length, { timeout: 10000 }).toBe(2)
  console.log('[A2] PUT#1(충돌) =', JSON.stringify(rec.putScopeBodies[0]))
  console.log('[A2] PUT#2(전체 저장) =', JSON.stringify(rec.putScopeBodies[1]))
  await shot(page, 'a2-03-after-all-save.png')

  expect(after, 'A2 — 배너가 삭제되지 않는다고 단언한다').toContain('삭제되지 않습니다')
  expect(rec.putScopeBodies[1]!['accountRefs'], 'A2 — 그러나 PUT 은 서버의 국민·우리 refs 를 비운다').toEqual([])
  expect(rec.putScopeBodies[1]!['scopeMode']).toBe('ALL')
})

// ─────────────────────────────────────────────────────────────────────────────
// A3 — 저장된 ALL 의 defaultImportType(=실제 실행 범위)이 무음 확대되는가 + 잠금 사유 비가시
// ─────────────────────────────────────────────────────────────────────────────
test('A3 — 저장된 ALL 충돌: 잠금 사유가 화면에 없고, 포괄 판정이 defaultImportType 확대를 안전하다고 말한다', async ({ page }) => {
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
  console.log('[A3] 복원 후 범위 select =', await page.locator('[data-testid="codef-import-type"]').inputValue())

  // 사용자가 범위 드롭다운을 '전체'로 바꾼다 → savedAllScopeDirty
  await page.locator('[data-testid="codef-import-type"]').selectOption('ALL')
  await page.waitForTimeout(300)
  const importDisabled = await page.locator('[data-testid="codef-import-button"]').isDisabled()
  const panel = await panelText(page)
  const desc = await describedByText(page, 'codef-import-button')
  console.log('[A3] 가져오기 disabled =', importDisabled)
  console.log('[A3] 패널 전문 =', panel)
  console.log('[A3] 가져오기 aria-describedby =', JSON.stringify(desc))
  await shot(page, 'a3-01-import-locked-no-visible-reason.png')

  await page.locator('[data-testid="codef-save-scope-button"]').click()
  await page.locator('[data-testid="codef-scope-conflict"]').waitFor({ state: 'visible', timeout: 10000 })
  const banner = (await page.locator('[data-testid="codef-scope-conflict"]').innerText()).replace(/\s+/g, ' ')
  console.log('[A3] 충돌 배너 =', banner)
  console.log('[A3] 일반 저장 활성 =', await page.locator('[data-testid="codef-save-scope-button"]').isEnabled(),
    '| 우회 버튼 =', await page.locator('[data-testid="codef-scope-overwrite-button"]').count())
  await shot(page, 'a3-02-all-conflict-declared-safe.png')

  await page.locator('[data-testid="codef-save-scope-button"]').click()
  await expect.poll(() => rec.putScopeBodies.length, { timeout: 10000 }).toBe(2)
  console.log('[A3] PUT#1 =', JSON.stringify(rec.putScopeBodies[0]))
  console.log('[A3] PUT#2 =', JSON.stringify(rec.putScopeBodies[1]))
  await shot(page, 'a3-03-after-save.png')

  expect(importDisabled, 'A3 — 가져오기가 잠긴다').toBe(true)
  expect(panel, 'A3 — 잠금 사유가 화면 어디에도 없다').not.toContain('먼저 저장하세요')
  expect(banner, 'A3 — 배너는 삭제되지 않는다고 말한다').toContain('삭제되지 않습니다')
  expect(rec.putScopeBodies[1]!['defaultImportType'], 'A3 — 서버의 CARD 한정이 ALL 로 확대된다').toBe('ALL')
})

// ─────────────────────────────────────────────────────────────────────────────
// A4 — 첫 방문 GET 실패(낡은 data 없음): 잠금·안내가 있는가
// ─────────────────────────────────────────────────────────────────────────────
test('A4 — 첫 방문 GET 실패(캐시 없음): 확인 실패 안내도 잠금도 없는가, 그 상태에서 저장·가져오기가 나가는가', async ({ page }) => {
  const login = await realLogin(page)
  await installAuthStub(page, login)
  const rec = await installCodefMocks(page, {
    onScopeGet: async (_idx, route) => {
      await route.fulfill({ status: 503, json: { success: false, code: 'SERVICE_UNAVAILABLE', message: '일시 장애', data: null } })
    },
    onScopePut: async (_idx, route) => {
      // 서버엔 실제로 저장된 범위가 있다 → version=null PUT 은 409.
      await route.fulfill({ status: 409, json: { success: false, code: 'CODEF_SCOPE_OPTIMISTIC_LOCK_CONFLICT', message: '충돌', data: null } })
    },
  })

  await gotoScopeScreen(page)
  await page.waitForTimeout(1200)
  console.log('[A4] 확인중 배너 =', await page.locator('[data-testid="codef-scope-confirming"]').count(),
    '| 확인실패 배너 =', await page.locator('[data-testid="codef-scope-unconfirmed"]').count(),
    '| 재확인 버튼 =', await page.locator('[data-testid="codef-scope-reconfirm-button"]').count())
  console.log('[A4] 패널 전문 =', await panelText(page))
  await shot(page, 'a4-01-first-visit-get-failed.png')

  await page.locator('[data-testid="codef-bank-account-0"]').check()
  await page.waitForTimeout(300)
  console.log('[A4] 체크 후 저장 활성 =', await page.locator('[data-testid="codef-save-scope-button"]').isEnabled(),
    '| 가져오기 활성 =', await page.locator('[data-testid="codef-import-button"]').isEnabled())

  await page.locator('[data-testid="codef-import-button"]').click()
  await expect.poll(() => rec.importBodies.length, { timeout: 15000 }).toBe(1)
  console.log('[A4] import 본문 =', JSON.stringify(rec.importBodies[0]))
  await shot(page, 'a4-02-import-ran-unconfirmed.png')

  await page.locator('[data-testid="codef-save-scope-button"]').click()
  await expect.poll(() => rec.putScopeBodies.length, { timeout: 10000 }).toBe(1)
  console.log('[A4] PUT 본문 =', JSON.stringify(rec.putScopeBodies[0]))
  await page.locator('[data-testid="codef-scope-conflict"]').waitFor({ state: 'visible', timeout: 10000 })
  console.log('[A4] 충돌 배너 =', (await page.locator('[data-testid="codef-scope-conflict"]').innerText()).replace(/\s+/g, ' '))
  await shot(page, 'a4-03-conflict-after-blind-save.png')
})

// ─────────────────────────────────────────────────────────────────────────────
// A5 — 직전 4건(N-1~N-4) 재발 여부 + 브리프가 요구한 값 관측
// ─────────────────────────────────────────────────────────────────────────────
test('A5 — N-1 재현: 재진입 확인 창의 가져오기 버튼 상태와 실제 import payload', async ({ page }) => {
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
  console.log('[A5] 확인중 배너 =', confirming, '| [가져오기 disabled] =', importDisabled)
  console.log('[A5] 패널 전문 =', await panelText(page))
  console.log('[A5] 가져오기 aria-describedby =', JSON.stringify(await describedByText(page, 'codef-import-button')))
  await shot(page, 'a5-01-reentry-confirming.png')

  // N-1 원본 경로: 확인 창 안에서 우리 체크 후 가져오기 시도.
  await page.locator('[data-testid="codef-bank-account-1"]').check()
  console.log('[A5] 체크 후 [가져오기 disabled] =', await page.locator('[data-testid="codef-import-button"]').isDisabled())
  await page.locator('[data-testid="codef-import-button"]').click({ force: true, timeout: 3000 }).catch(() => undefined)
  await page.waitForTimeout(500)
  console.log('[A5] 확인 창 중 나간 import 요청 수 =', rec.importBodies.length)

  // 확인 도착 후
  await expect(page.locator('[data-testid="codef-scope-confirming"]')).toHaveCount(0, { timeout: 10000 })
  console.log('[A5] 확인 도착 후 우리 체크 =', await page.locator('[data-testid="codef-bank-account-1"]').isChecked(),
    '| 국민 체크 =', await page.locator('[data-testid="codef-bank-account-0"]').isChecked())
  console.log('[A5] 확인 도착 후 패널 =', await panelText(page))
  await shot(page, 'a5-02-confirm-arrived.png')

  await page.locator('[data-testid="codef-import-button"]').click()
  await expect.poll(() => rec.importBodies.length, { timeout: 15000 }).toBeGreaterThan(0)
  console.log('[A5] import 본문 =', JSON.stringify(rec.importBodies[rec.importBodies.length - 1]))
  await shot(page, 'a5-03-import-after-confirm.png')
})

// ─────────────────────────────────────────────────────────────────────────────
// A6 — identical 응답에서 확인이 성립하는가(영구 "확인 중" 교착 여부) + NOT_FOUND 취급
// ─────────────────────────────────────────────────────────────────────────────
test('A6 — 재진입 GET 이 완전히 동일한 응답을 즉시 반환해도 확인이 성립하는가 / 미저장 응답 처리', async ({ page }) => {
  const login = await realLogin(page)
  await installAuthStub(page, login)
  const saved = {
    connectedId: 'connected-main', accountRefs: [KB], cardRefs: [], loanRefs: [],
    defaultImportType: 'BANK', scopeMode: 'SELECTED', version: 7,
  }
  await installCodefMocks(page, { onScopeGet: async (_idx, route) => { await route.fulfill({ json: envelope(saved) }) } })

  await gotoScopeScreen(page)
  await expect(page.locator('[data-testid="codef-bank-account-0"]')).toBeChecked()
  for (let i = 0; i < 3; i += 1) {
    await leaveAndReenter(page)
    await page.waitForTimeout(500)
    const confirming = await page.locator('[data-testid="codef-scope-confirming"]').count()
    const enabled = await page.locator('[data-testid="codef-save-scope-button"]').isEnabled()
    const kb = await page.locator('[data-testid="codef-bank-account-0"]').isChecked()
    console.log(`[A6] 재진입 ${i + 1}회 — 확인중 잔존=${confirming} 저장활성=${enabled} 국민복원=${kb}`)
    expect(confirming, `A6 — 동일 응답 ${i + 1}회차에서 영구 확인중 교착이 없어야 한다`).toBe(0)
    expect(kb, `A6 — 동일 응답 ${i + 1}회차 복원`).toBe(true)
  }
  await shot(page, 'a6-01-identical-response-no-deadlock.png')

  // 미저장(BE 는 200 + scopeMode null 로 응답한다) — "확인 실패" 로 오인하지 않아야 한다.
  await page.unroute('**/accounting/codef/scopes**')
  await page.route('**/accounting/codef/scopes**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: envelope({ connectedId: 'connected-main', accountRefs: [], cardRefs: [], loanRefs: [], defaultImportType: 'ALL', scopeMode: null, version: null }) })
    } else await route.continue()
  })
  await leaveAndReenter(page)
  await page.waitForTimeout(700)
  console.log('[A6] 미저장 재진입 — 확인실패배너 =', await page.locator('[data-testid="codef-scope-unconfirmed"]').count(),
    '| 미저장 힌트 =', await page.locator('.codef-import-panel').innerText().then((t) => t.includes('저장된 선택이 없습니다')))
  await shot(page, 'a6-02-unsaved-response.png')
})

// ─────────────────────────────────────────────────────────────────────────────
// A7 — N-3 재현: 충돌 + 재조회 실패에서 배너 버튼을 반복 클릭. PUT version 이 전진하는가?
//      (직전 실측 [3,3,3,3] — 몇 번을 눌러도 영원히 3)
// ─────────────────────────────────────────────────────────────────────────────
test('A7 — N-3 재현: latest=null 충돌에서 배너 버튼 4회 클릭 시 나가는 PUT version 열', async ({ page }) => {
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
  console.log('[A7] latest=null 배너 =', (await page.locator('[data-testid="codef-scope-conflict"]').innerText()).replace(/\s+/g, ' '))
  console.log('[A7] 구 재저장 버튼(codef-scope-overwrite-button) =', await page.locator('[data-testid="codef-scope-overwrite-button"]').count())

  // 배너의 유일한 버튼을 3회 반복 클릭 — 매번 GET 실패.
  for (let i = 0; i < 3; i += 1) {
    await page.locator('[data-testid="codef-scope-conflict-reconfirm-button"]').click()
    await page.waitForTimeout(500)
    console.log(`[A7] 재확인 ${i + 1}회 후 — PUT 누적=${rec.putScopeBodies.length} GET 누적=${getIdx} 우회버튼=${await page.locator('[data-testid="codef-scope-overwrite-button"]').count()}`)
  }
  await shot(page, 'a7-01-reconfirm-loop-no-blind-put.png')

  // 4회차 — 이번엔 GET 성공. latest 가 드러나고 명시 저장으로 전환된다.
  await page.locator('[data-testid="codef-scope-conflict-reconfirm-button"]').click()
  await page.locator('[data-testid="codef-scope-overwrite-button"]').waitFor({ state: 'visible', timeout: 10000 })
  await page.locator('[data-testid="codef-scope-overwrite-button"]').click()
  await expect.poll(() => rec.putScopeBodies.length, { timeout: 10000 }).toBe(2)
  console.log('[A7] PUT version 열 =', JSON.stringify(rec.putScopeBodies.map((b) => b['version'])))
  console.log('[A7] 최종 배너 =', await page.locator('[data-testid="codef-scope-conflict"]').count())
  await shot(page, 'a7-02-recovered-and-saved.png')

  expect(rec.putScopeBodies.map((b) => b['version']), 'N-3 — 맹목적 재PUT 없이 version 이 전진한다').toEqual([3, 8])
})

// ─────────────────────────────────────────────────────────────────────────────
// A8 — 확인 실패 배너의 "다시 확인" 이 계속 실패할 때 영구 교착 경로가 있는가
// ─────────────────────────────────────────────────────────────────────────────
test('A8 — 확인 실패 배너 다시 확인 5회 연속 실패 후에도 회복 수단이 남아 있는가', async ({ page }) => {
  const login = await realLogin(page)
  await installAuthStub(page, login)
  const saved = {
    connectedId: 'connected-main', accountRefs: [KB], cardRefs: [], loanRefs: [],
    defaultImportType: 'BANK', scopeMode: 'SELECTED', version: 4,
  }
  let getIdx = 0
  await installCodefMocks(page, {
    onScopeGet: async (_i, route) => {
      const idx = getIdx++
      if (idx === 0) await route.fulfill({ json: envelope(saved) })
      else if (idx <= 6) await route.fulfill({ status: 503, json: { success: false, code: 'SERVICE_UNAVAILABLE', message: '장애', data: null } })
      else await route.fulfill({ json: envelope(saved) })
    },
  })

  await gotoScopeScreen(page)
  await leaveAndReenter(page)
  await page.locator('[data-testid="codef-scope-unconfirmed"]').waitFor({ state: 'visible', timeout: 10000 })
  for (let i = 0; i < 5; i += 1) {
    await page.locator('[data-testid="codef-scope-reconfirm-button"]').click()
    await page.locator('[data-testid="codef-scope-unconfirmed"]').waitFor({ state: 'visible', timeout: 10000 })
    console.log(`[A8] 다시 확인 ${i + 1}회 실패 — GET 누적=${getIdx} 버튼 잔존=${await page.locator('[data-testid="codef-scope-reconfirm-button"]').count()} 저장활성=${await page.locator('[data-testid="codef-save-scope-button"]').isEnabled()}`)
  }
  await shot(page, 'a8-01-reconfirm-failed-5x.png')
  // 7회차 GET 은 성공한다 → 회복.
  await page.locator('[data-testid="codef-scope-reconfirm-button"]').click()
  await expect(page.locator('[data-testid="codef-scope-unconfirmed"]')).toHaveCount(0, { timeout: 10000 })
  console.log('[A8] 회복 후 국민 복원 =', await page.locator('[data-testid="codef-bank-account-0"]').isChecked(),
    '| 저장활성 =', await page.locator('[data-testid="codef-save-scope-button"]').isEnabled())
  await shot(page, 'a8-02-recovered.png')
})

// ─────────────────────────────────────────────────────────────────────────────
// A9 — 브리프 ①: setQueryData(저장 성공)가 restoredApplied=false 상태에서 dataUpdatedAt 을
//      올려 복원 effect 를 발동시키는 경로. 실 사용자 조작으로 도달하며 해롭는가?
// ─────────────────────────────────────────────────────────────────────────────
test('A9 — 첫 방문 GET 실패(캐시 없음) 후 저장 성공: setQueryData 가 복원 effect 를 발동시켜 화면이 흔들리는가', async ({ page }) => {
  const login = await realLogin(page)
  await installAuthStub(page, login)
  const rec = await installCodefMocks(page, {
    onScopeGet: async (_i, route) => {
      await route.fulfill({ status: 503, json: { success: false, code: 'SERVICE_UNAVAILABLE', message: '장애', data: null } })
    },
    onScopePut: async (_idx, route, body) => {
      // 서버엔 아무것도 없었다 → version=null 저장이 성공하고 서버는 CARD 를 기본유형으로 정규화한다.
      await route.fulfill({ json: envelope({ ...body, defaultImportType: 'BANK', version: 0 }) })
    },
  })

  await gotoScopeScreen(page)
  await page.waitForTimeout(900)
  await page.locator('[data-testid="codef-bank-account-1"]').check()
  await page.locator('[data-testid="codef-import-type"]').selectOption('ALL')
  await page.waitForTimeout(200)
  console.log('[A9] 저장 전 — 우리체크=', await page.locator('[data-testid="codef-bank-account-1"]').isChecked(),
    '범위=', await page.locator('[data-testid="codef-import-type"]').inputValue())

  await page.locator('[data-testid="codef-save-scope-button"]').click()
  await expect.poll(() => rec.putScopeBodies.length, { timeout: 10000 }).toBe(1)
  await page.waitForTimeout(1200)
  console.log('[A9] PUT =', JSON.stringify(rec.putScopeBodies[0]))
  console.log('[A9] 저장 후 — 우리체크=', await page.locator('[data-testid="codef-bank-account-1"]').isChecked(),
    '국민체크=', await page.locator('[data-testid="codef-bank-account-0"]').isChecked(),
    '범위=', await page.locator('[data-testid="codef-import-type"]').inputValue())
  console.log('[A9] 저장 후 패널 =', await panelText(page))
  await shot(page, 'a9-01-after-first-save.png')

  // 이어서 가져오기 — 저장 결과대로 나가는가?
  await page.locator('[data-testid="codef-import-button"]').click()
  await expect.poll(() => rec.importBodies.length, { timeout: 15000 }).toBe(1)
  console.log('[A9] import =', JSON.stringify(rec.importBodies[0]))
})
