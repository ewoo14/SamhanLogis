/**
 * 재수렴 R4(N-1~N-4) fix 구현자 자체 검증 — 실 데스크톱 렌더러(:5253) + page.route 가로채기.
 *
 * 🚨 공유 데이터 미접촉 — /accounting/codef/** 전 엔드포인트를 이 파일이 직접 가로채 응답한다.
 * 실 connected-main CODEF 범위·실 bank_transaction 적재 경로는 전혀 실행되지 않는다.
 * 로그인만 실 게이트웨이(:8080)를 사용한다(읽기 전용 표준 인증 — 다른 real-qa 스펙과 동일 패턴).
 *
 * 이 스펙은 PR 산출물이 아니라 fix 구현자 본인의 브라우저 레벨 자체 검증 기록이다(단위테스트
 * 39건 GREEN 은 이미 확보 — 이 파일은 jsdom 이 아닌 실제 Chromium 렌더링·타이밍으로 동일
 * 결론을 재확인한다).
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
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
// 기존 902-... 캡처(01-04.png, 트래킹됨)·다른 리뷰어의 r3-*.png 와 절대 겹치지 않도록 전용
// 하위 폴더에만 쓴다(docs/qa/** 기존 파일 덮어쓰기 금지). resolveQaShotsDir 로 감싸 재실행이
// 이 전용 폴더 자신의 기존 증거도 덮어쓰지 않게 한다(2026-07-26 하네스 재수렴 라운드 G2).
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/920-codef-scope-lock/r4-verify'))

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
  { ref: 'r4-kb-001', name: '국민운영', bankName: '국민은행', accountNumber: '111-111' },
  { ref: 'r4-woori-001', name: '우리운영', bankName: '우리은행', accountNumber: '222-222' },
  { ref: 'r4-hana-001', name: '하나운영', bankName: '하나은행', accountNumber: '333-333' },
]

/** N-1~N-4 검증에 필요한 CODEF 백엔드 호출 전부를 이 함수 하나로 가로챈다 — 공유 데이터
 * 미접촉을 구조적으로 보장한다(bank-accounts/cards/loans/scopes 어느 것도 실 서버로 안 감). */
async function installCodefMocks(
  page: Page,
  handlers: {
    onScopeGet: (callIndex: number, route: Route) => Promise<void>
    onScopePut?: (callIndex: number, route: Route, body: Record<string, unknown>) => Promise<void>
    onImport?: (route: Route) => Promise<void>
  },
): Promise<{ getScopeCalls: () => number; putScopeCalls: () => number }> {
  let getCalls = 0
  let putCalls = 0
  await page.route('**/accounting/codef/bank-accounts**', (route) =>
    route.fulfill({ json: envelope({ accounts: BANK_ACCOUNTS }) }))
  await page.route('**/accounting/codef/cards**', (route) =>
    route.fulfill({ json: envelope({ cards: [] }) }))
  await page.route('**/accounting/codef/loans**', (route) =>
    route.fulfill({ json: envelope({ loans: [] }) }))
  await page.route('**/accounting/codef/import-scoped**', async (route) => {
    if (handlers.onImport) {
      await handlers.onImport(route)
    } else {
      await route.fulfill({
        json: envelope({
          fetchedCount: 0, importedCount: 0, duplicateSkippedCount: 0, matchedCount: 0,
          staleSkippedCount: 0, staleNormalizedNames: [], unavailableSkippedCount: 0, unavailableNames: [],
        }),
      })
    }
  })
  await page.route('**/accounting/codef/scopes**', async (route) => {
    const req = route.request()
    if (req.method() === 'GET') {
      const idx = getCalls++
      await handlers.onScopeGet(idx, route)
    } else if (req.method() === 'PUT') {
      const idx = putCalls++
      const body = req.postDataJSON() as Record<string, unknown>
      if (handlers.onScopePut) await handlers.onScopePut(idx, route, body)
      else await route.fulfill({ json: envelope(body) })
    } else {
      await route.continue()
    }
  })
  return { getScopeCalls: () => getCalls, putScopeCalls: () => putCalls }
}

async function gotoScopeScreen(page: Page): Promise<void> {
  // 경로만(path) goto 하면 렌더러가 createHashRouter 라 해시가 비어 대시보드(기본 라우트)로
  // 떨어진다(routes/index.tsx — VITE_PLATFORM!=='web' 이면 항상 HashRouter) — 반드시 `#/...`.
  await page.goto(`${BASE_URL}/#/accounting/bank-transactions`)
  await page.waitForLoadState('domcontentloaded')
  await page.locator('[data-testid="codef-bank-account-0"]').waitFor({ state: 'visible', timeout: 20000 })
}

/** SPA 내부 네비게이션은 스크롤 위치를 유지한다(React Router 기본 동작) — CODEF 패널이
 * 항상 화면 위쪽이므로 캡처 전 맨 위로 스크롤해 가독성을 보장한다(기능 검증과 무관). */
async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: path.join(SHOTS, name) })
}

test('N-1/N-2 — 재진입 확인 창: 확인 중엔 잠기고 사용자 입력 보존, 확인 실패는 정직하게 안내+재확인으로 회복', async ({ page }) => {
  test.setTimeout(60_000)
  const login = await realLogin(page)
  await installAuthStub(page, login)

  const savedScope = {
    connectedId: 'connected-main', accountRefs: [BANK_ACCOUNTS[0]!.ref], cardRefs: [], loanRefs: [],
    defaultImportType: 'BANK', scopeMode: 'SELECTED', version: 9,
  }

  const mocks = await installCodefMocks(page, {
    onScopeGet: async (idx, route) => {
      if (idx === 0) {
        // 최초 로드 — 즉시 성공(국민만 저장돼 있다).
        await route.fulfill({ json: envelope(savedScope) })
      } else if (idx === 1) {
        // 재진입(1차) — 확인이 2.5초 걸린다. 그 사이가 N-1 의 위험 창이다.
        await new Promise((r) => setTimeout(r, 2500))
        await route.fulfill({ json: envelope(savedScope) })
      } else {
        // 재진입(2차) — 이번엔 확인 자체가 실패한다(N-2). 캐시엔 savedScope 가 남아있다.
        await route.fulfill({
          status: 503,
          json: { success: false, code: 'SERVICE_UNAVAILABLE', message: '일시적 장애', data: null },
        })
      }
    },
  })

  await gotoScopeScreen(page)
  await page.locator('[data-testid="codef-import-button"]').waitFor({ state: 'visible' })
  await expect(page.locator('[data-testid="codef-bank-account-0"]')).toBeChecked()
  await expect(page.locator('[data-testid="codef-import-button"]')).toBeEnabled()
  await shot(page, 'r4-01-initial-restored.png')

  // 평범한 메뉴 이동 — 입금자명 매핑으로 갔다가 입출금 내역으로 되돌아온다.
  await page.locator('[data-testid="sidebar-accounting-deposit-mapping"]').click()
  await page.waitForLoadState('domcontentloaded')
  await page.locator('[data-testid="sidebar-accounting-bank-transactions"]').click()

  // 재진입 직후 — 계좌 목록은 그려지지만 범위 확인은 아직 2.5초 응답 대기 중이다.
  await page.locator('[data-testid="codef-bank-account-0"]').waitFor({ state: 'visible' })
  await page.waitForTimeout(700)
  const confirming = page.locator('[data-testid="codef-scope-confirming"]')
  const staleHint = page.locator('[data-testid="codef-scope-hint"]')
  await expect(confirming, 'N1 — 확인 중임이 화면에 보여야 한다').toBeVisible()
  await expect(staleHint, 'N1 — "미선택" 힌트가 확인 중에 거짓으로 뜨면 안 된다').toHaveCount(0)
  await expect(page.locator('[data-testid="codef-import-button"]'), 'N3 — 확인 전 가져오기는 잠겨야 한다').toBeDisabled()
  await expect(page.locator('[data-testid="codef-save-scope-button"]'), 'N3 — 확인 전 저장도 잠겨야 한다').toBeDisabled()
  await shot(page, 'r4-02-reentry-confirming-locked.png')

  // 확인이 끝나기 전에 사용자가 우리은행을 체크한다(N-1 리포트 재현).
  await page.locator('[data-testid="codef-bank-account-1"]').check()
  await expect(page.locator('[data-testid="codef-import-button"]'), 'N3 — 체크해도 확인 전이면 여전히 잠긴다').toBeDisabled()

  // 2.5초 확인이 도착한다.
  await expect(confirming).toHaveCount(0, { timeout: 5000 })
  await expect(page.locator('[data-testid="codef-bank-account-1"]'), 'N2 — 확인 전 사용자 체크가 조용히 사라지면 안 된다').toBeChecked()
  await expect(page.locator('[data-testid="codef-import-button"]')).toBeEnabled()
  await shot(page, 'r4-03-reentry-resolved-input-preserved.png')

  // 다시 메뉴 이동 — 이번엔 재진입 확인이 실패한다(N-2).
  await page.locator('[data-testid="sidebar-accounting-deposit-mapping"]').click()
  await page.waitForLoadState('domcontentloaded')
  await page.locator('[data-testid="sidebar-accounting-bank-transactions"]').click()
  await page.locator('[data-testid="codef-bank-account-0"]').waitFor({ state: 'visible' })

  const unconfirmed = await page.locator('[data-testid="codef-scope-unconfirmed"]').waitFor({ state: 'visible', timeout: 5000 }).then(() => page.locator('[data-testid="codef-scope-unconfirmed"]'))
  const unconfirmedText = (await unconfirmed.innerText()).replace(/\s+/g, ' ')
  expect(unconfirmedText, 'N1 — 확인 실패 사실이 정직하게 보여야 한다').toContain('확인하지 못했습니다')
  expect(unconfirmedText, 'K3/N4 — 실패를 "다른 화면에서 변경"으로 잘못 귀인하면 안 된다').not.toContain('다른 화면에서')
  await expect(page.locator('[data-testid="codef-save-scope-button"]')).toBeDisabled()
  await expect(page.locator('[data-testid="codef-import-button"]')).toBeDisabled()
  await expect(page.locator('[data-testid="codef-scope-hint"]'), '확인 실패 중엔 "미선택" 힌트가 없어야 한다').toHaveCount(0)
  await shot(page, 'r4-04-reentry-failed-unconfirmed.png')

  // N5 — 재확인 버튼으로 회복한다(이번엔 성공하도록 GET 핸들러 자체를 되돌린다는 뜻은
  // 아니고, 다음 GET 호출이 성공 응답을 받도록 idx 기반 onScopeGet 로직이 이미 그 다음
  // 호출도 idx>=2 브랜치라 503 을 반환한다 — 재확인 버튼이 실제로 새 GET 을 보내는지만
  // 확인하면 충분하므로, 여기서는 라우트를 교체해 다음 GET 은 성공하도록 만든다).
  await page.unroute('**/accounting/codef/scopes**')
  await page.route('**/accounting/codef/scopes**', async (route) => {
    const req = route.request()
    if (req.method() === 'GET') await route.fulfill({ json: envelope({ ...savedScope, accountRefs: [BANK_ACCOUNTS[0]!.ref] }) })
    else await route.continue()
  })
  await page.locator('[data-testid="codef-scope-reconfirm-button"]').click()
  await expect(page.locator('[data-testid="codef-scope-unconfirmed"]'), 'N5 — 재확인 성공 후 확인 실패 배너가 사라져야 한다').toHaveCount(0, { timeout: 5000 })
  await expect(page.locator('[data-testid="codef-import-button"]')).toBeEnabled()
  await shot(page, 'r4-05-reconfirm-recovered.png')

  // page.unroute+재등록 이후의 재확인 GET 은 새 핸들러라 이 카운터에 잡히지 않는다(테스트
  // 계측상의 사실일 뿐 — 위에서 이미 재확인 버튼 클릭 후 배너가 사라짐을 직접 확인했다).
  // 재등록 전까지(최초+재진입 성공+재진입 실패) 3회가 실제로 오갔음만 여기서 재확인한다.
  expect(mocks.getScopeCalls(), '재등록 전 최초+재진입(성공)+재진입(실패) 3회의 GET 이 오갔다').toBe(3)
})

test('N-3/N-4 — 충돌 latest=null 재시도는 다시 확인만 제시하고, 화해로 포괄되면 삭제 경고 없이 저장이 열린다', async ({ page }) => {
  test.setTimeout(60_000)
  const login = await realLogin(page)
  await installAuthStub(page, login)

  const initialScope = {
    connectedId: 'connected-main', accountRefs: [BANK_ACCOUNTS[0]!.ref], cardRefs: [], loanRefs: [],
    defaultImportType: 'BANK', scopeMode: 'SELECTED', version: 0,
  }
  const latestScope = {
    ...initialScope, accountRefs: [BANK_ACCOUNTS[0]!.ref, BANK_ACCOUNTS[1]!.ref], version: 1,
  }
  let scopeGetIdx = 0
  await installCodefMocks(page, {
    onScopeGet: async (_idx, route) => {
      const idx = scopeGetIdx++
      if (idx === 0) {
        await route.fulfill({ json: envelope(initialScope) })
      } else if (idx === 1 || idx === 2) {
        // 충돌 onError 의 자동 재조회(1) + 사용자의 수동 재확인 1회차(2) — 둘 다 실패.
        await route.fulfill({ status: 503, json: { success: false, code: 'SERVICE_UNAVAILABLE', message: '장애', data: null } })
      } else {
        // 수동 재확인 2회차 — 성공. latest 를 드러낸다(우리은행도 저장돼 있음).
        await route.fulfill({ json: envelope(latestScope) })
      }
    },
    onScopePut: async (idx, route, body) => {
      if (idx === 0) {
        await route.fulfill({
          status: 409,
          json: { success: false, code: 'CODEF_SCOPE_OPTIMISTIC_LOCK_CONFLICT', message: '충돌', data: null },
        })
      } else {
        await route.fulfill({ json: envelope({ ...body, version: (body['version'] as number) + 1 }) })
      }
    },
  })

  await gotoScopeScreen(page)
  await page.locator('[data-testid="codef-import-button"]').waitFor({ state: 'visible' })
  await expect(page.locator('[data-testid="codef-save-scope-button"]')).toBeEnabled()

  await page.locator('[data-testid="codef-save-scope-button"]').click()
  await page.locator('[data-testid="codef-scope-conflict"]').waitFor({ state: 'visible', timeout: 5000 })
  await shot(page, 'r4-06-conflict-latest-null.png')

  // N-3/N5 — latest=null 이므로 "다시 저장"(구조적 409 반복) 이 아니라 "다시 확인" 이어야 한다.
  await expect(page.locator('[data-testid="codef-scope-overwrite-button"]'), 'N-3 — 성공 불가능한 재저장 버튼이 있으면 안 된다').toHaveCount(0)
  const recheck = page.locator('[data-testid="codef-scope-conflict-reconfirm-button"]')
  await expect(recheck).toBeVisible()

  // 1차 재확인 — 또 실패한다. PUT 은 여전히 1회만 나갔어야 한다(맹목적 재PUT 없음).
  await recheck.click()
  await page.waitForTimeout(600)
  await expect(page.locator('[data-testid="codef-scope-overwrite-button"]')).toHaveCount(0)
  await shot(page, 'r4-07-reconfirm-fails-again.png')

  // 2차 재확인 — 이번엔 성공한다. latest 가 드러나 명시 저장 버튼으로 전환된다.
  await page.locator('[data-testid="codef-scope-conflict-reconfirm-button"]').click()
  const overwriteButton = page.locator('[data-testid="codef-scope-overwrite-button"]')
  await overwriteButton.waitFor({ state: 'visible', timeout: 5000 })
  await expect(page.locator('[data-testid="codef-scope-conflict"]')).toContainText('지워질 수 있습니다')
  await shot(page, 'r4-08-latest-revealed-not-covering.png')

  // N-4/N7 — 서버의 우리은행을 화면에 화해해 넣는다. 이제 화면(국민+우리) ⊇ 서버(국민+우리).
  await page.locator('[data-testid="codef-bank-account-1"]').check()
  await expect(page.locator('[data-testid="codef-save-scope-button"]'), 'N6/N7 — 포괄되면 사유 없는 잠금이 풀려야 한다').toBeEnabled({ timeout: 5000 })
  await expect(page.locator('[data-testid="codef-scope-conflict"]')).not.toContainText('지워질 수 있습니다')
  await expect(overwriteButton, '포괄 시 별도 우회 버튼은 감춘다(일반 저장이 이미 안전)').toHaveCount(0)
  await shot(page, 'r4-09-reconciled-covering-unlocked.png')

  await page.locator('[data-testid="codef-save-scope-button"]').click()
  await expect(page.locator('[data-testid="codef-scope-conflict"]'), '일반 저장 성공 후 충돌 배너가 사라져야 한다').toHaveCount(0, { timeout: 5000 })
  await shot(page, 'r4-10-saved-after-reconciliation.png')
})
