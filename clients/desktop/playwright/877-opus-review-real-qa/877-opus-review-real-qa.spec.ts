import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #877 — CODEF 저장 시 type 필터 밖 카테고리 무음 유실 fix — OPUS 4.8 적대검증 라이브 QA.
 *
 * 실 게이트웨이 :8080 · mock OFF · 실 로그인(dev_master) · 전부 실 DOM/실 GET payload.
 * 라우트: /accounting/bank-transactions (CODEF 가져오기 범위 폼).
 *
 * 검증(각 단계 실캡처 → docs/qa/877-opus-review-2026-07-24/):
 *  A) 계좌3+카드2 선택 → 범위=카드로 좁힘 → 저장 → 실 GET 에 계좌3·카드2 보존 → 재진입 생존
 *  B) 교차: 범위=계좌로 좁혀 저장 → 카드 생존 / 범위=대출로 → 계좌·카드 생존
 *  C) 의도적 해제: 계좌 1개 실제 해제 후 저장 → 실 GET 계좌 2개(원본이 3개 부활 안 함)
 *  D) ALL 경계: '전체' 칩 → 저장 → 실 GET scopeMode=ALL·refs 전부 []
 *
 * 데이터 안전([[feedback_qa_live_shared_data_readonly]]): scope 는 (user,connectedId) 싱글턴이라
 *  전용 throwaway 행 분리 불가 — beforeAll 에서 원본 scope 를 캡처하고 afterAll 에서 정확 복원(PUT).
 */
import { expect, test, type Page, type APIRequestContext } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5360'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const LOGIN_ID = process.env['DEV_LOGIN'] ?? 'dev_master'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const CONNECTED = 'connected-main'
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/877-opus-review-2026-07-24'))
fs.mkdirSync(SHOTS, { recursive: true })

// 실 서버 시드 ref (probe 확인)
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

interface LoginResult { token: string; role: string; userId: string; displayName: string }
let TOKEN = ''
let ORIGINAL_SCOPE: Record<string, unknown> | null = null
const putBodies: string[] = []

async function realLogin(page: Page, loginId: string): Promise<LoginResult> {
  const res = await page.request.post(`${API_BASE}/auth/login`, { data: { loginId, password: PASSWORD } })
  expect(res.ok(), `로그인 실패(${loginId}): HTTP ${res.status()}`).toBeTruthy()
  const d = (await res.json()).data ?? {}
  return { token: d.token ?? '', role: d.role ?? '', userId: d.userId ?? '', displayName: d.displayName ?? loginId }
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

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true })
}

/** 웹 배포 번들은 BrowserRouter(실 경로). #909 자동업데이트 실패 모달은 QA 무관이라 닫는다. */
async function dismissUpdateModal(page: Page): Promise<void> {
  for (const label of ['닫기', '확인']) {
    const btn = page.getByRole('button', { name: label })
    if (await btn.count().catch(() => 0)) {
      await btn.first().click().catch(() => undefined)
      await page.waitForTimeout(200)
    }
  }
}

async function goto(page: Page, route: string): Promise<void> {
  await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('MASTER').first()).toBeVisible({ timeout: 25000 })
  await dismissUpdateModal(page)
  await expect(page.getByTestId('codef-import-type')).toBeVisible({ timeout: 20000 })
  await page.getByTestId('codef-import-type').scrollIntoViewIfNeeded()
  await page.waitForTimeout(800)
}

async function getScope(req: APIRequestContext): Promise<Record<string, unknown>> {
  const res = await req.get(`${API_BASE}/accounting/codef/scopes?connectedId=${CONNECTED}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  })
  expect(res.ok(), `GET scope HTTP ${res.status()}`).toBeTruthy()
  return (await res.json()).data
}

async function setType(page: Page, value: 'ALL' | 'BANK' | 'CARD' | 'LOAN'): Promise<void> {
  await page.getByTestId('codef-import-type').selectOption(value)
  await page.waitForTimeout(300)
}

/** 범위=전체로 두고 refs 집합을 정확히 그 상태로 맞춘다(check/uncheck 로 수렴). */
async function checkRef(page: Page, testId: string): Promise<void> {
  const cb = page.getByTestId(testId)
  await cb.scrollIntoViewIfNeeded()
  await cb.check()
}

test.describe.serial('#877 CODEF 저장 필터 무음 유실 fix — 실서버 라이브 QA', () => {
  test.beforeAll(async ({ playwright }) => {
    const req = await playwright.request.newContext()
    const res = await req.post(`${API_BASE}/auth/login`, { data: { loginId: LOGIN_ID, password: PASSWORD } })
    TOKEN = (await res.json()).data.token
    ORIGINAL_SCOPE = await getScope(req)
    console.log(`[beforeAll] 원본 scope 캡처: ${JSON.stringify(ORIGINAL_SCOPE)}`)
    await req.dispose()
  })

  test.afterAll(async ({ playwright }) => {
    // 원본 scope 정확 복원(공유 실데이터 보존). PUT 은 API 경유라 UTF-8 안전.
    const req = await playwright.request.newContext()
    if (ORIGINAL_SCOPE) {
      const body = {
        connectedId: CONNECTED,
        accountRefs: ORIGINAL_SCOPE['accountRefs'] ?? [],
        cardRefs: ORIGINAL_SCOPE['cardRefs'] ?? [],
        loanRefs: ORIGINAL_SCOPE['loanRefs'] ?? [],
        defaultImportType: ORIGINAL_SCOPE['defaultImportType'] ?? 'ALL',
        scopeMode: ORIGINAL_SCOPE['scopeMode'] ?? 'ALL',
      }
      const res = await req.put(`${API_BASE}/accounting/codef/scopes`, {
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        data: body,
      })
      const after = await getScope(req)
      console.log(`[afterAll] 복원 PUT HTTP ${res.status()} → GET 확인: ${JSON.stringify(after)}`)
    }
    await req.dispose()
  })

  test.beforeEach(async ({ page }) => {
    const login = await realLogin(page, LOGIN_ID)
    await installAuthStub(page, login)
    page.on('request', (r) => {
      if (r.method() === 'PUT' && r.url().includes('/accounting/codef/scopes')) {
        putBodies.push(r.postData() ?? '')
      }
    })
  })

  test('A · 계좌3+카드2 → 범위=카드 저장 → 실 GET 보존 → 재진입 생존', async ({ page }) => {
    await goto(page, '/accounting/bank-transactions')

    // 범위=전체에서 계좌 3(국민·신한·우리) + 카드 2(1111·2222) 를 선택 상태로 수렴
    await setType(page, 'ALL')
    await checkRef(page, 'codef-bank-account-0')
    await checkRef(page, 'codef-bank-account-1')
    await checkRef(page, 'codef-bank-account-2')
    // 하나(idx3) 는 해제 상태 보장
    const hana = page.getByTestId('codef-bank-account-3')
    if (await hana.isChecked()) await hana.uncheck()
    await checkRef(page, 'codef-card-0')
    await checkRef(page, 'codef-card-1')
    const c3 = page.getByTestId('codef-card-2')
    if (await c3.isChecked()) await c3.uncheck()
    await shot(page, 'A1-all-view-3accounts-2cards-checked')

    // 범위=카드로 좁힘 — 계좌는 화면에서 사라짐(필터)
    await setType(page, 'CARD')
    await shot(page, 'A2-card-filter-only-cards-visible')

    putBodies.length = 0
    await page.getByTestId('codef-save-scope-button').click()
    await page.waitForTimeout(1500)
    await shot(page, 'A3-after-save-card-filter')

    // 실 PUT body 확인
    console.log(`[A] PUT body: ${putBodies[0]}`)
    const put = JSON.parse(putBodies[0] || '{}')
    expect(put.accountRefs, 'PUT accountRefs 에 계좌 3개').toEqual(
      expect.arrayContaining([ACC.kb, ACC.shinhan, ACC.woori]),
    )
    expect(put.cardRefs).toEqual(expect.arrayContaining([CARD.c1111, CARD.c2222]))
    expect(put.defaultImportType).toBe('CARD')
    expect(put.scopeMode).toBe('SELECTED')

    // 실 GET(BE 저장분) 확인 — 계좌 3·카드 2 보존
    const scope = await getScope(page.request)
    console.log(`[A] GET scope: ${JSON.stringify(scope)}`)
    expect(scope['accountRefs']).toEqual(expect.arrayContaining([ACC.kb, ACC.shinhan, ACC.woori]))
    expect((scope['accountRefs'] as string[]).length).toBe(3)
    expect(scope['cardRefs']).toEqual(expect.arrayContaining([CARD.c1111, CARD.c2222]))
    expect((scope['cardRefs'] as string[]).length).toBe(2)

    // 재진입(리로드) → 범위=전체 → 계좌 3 + 카드 2 checkbox 생존
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByText('MASTER').first()).toBeVisible({ timeout: 25000 })
    await dismissUpdateModal(page)
    await expect(page.getByTestId('codef-import-type')).toBeVisible({ timeout: 20000 })
    await page.getByTestId('codef-import-type').scrollIntoViewIfNeeded()
    await page.waitForTimeout(1200)
    await setType(page, 'ALL')
    await expect(page.getByTestId('codef-bank-account-0')).toBeChecked()
    await expect(page.getByTestId('codef-bank-account-1')).toBeChecked()
    await expect(page.getByTestId('codef-bank-account-2')).toBeChecked()
    await expect(page.getByTestId('codef-card-0')).toBeChecked()
    await expect(page.getByTestId('codef-card-1')).toBeChecked()
    await shot(page, 'A4-reentry-all-view-3accounts-2cards-survive')
  })

  test('B · 교차: 범위=계좌로 저장 → 카드 생존 / 범위=대출로 → 계좌·카드 생존', async ({ page }) => {
    await goto(page, '/accounting/bank-transactions')
    // A 의 저장 상태(계좌3·카드2, type=CARD) 로 시작. 범위=계좌로 좁혀 저장.
    await setType(page, 'BANK')
    putBodies.length = 0
    await page.getByTestId('codef-save-scope-button').click()
    await page.waitForTimeout(1500)
    await shot(page, 'B1-save-under-bank-filter')
    const scopeB = await getScope(page.request)
    console.log(`[B-계좌] GET: ${JSON.stringify(scopeB)}`)
    // 카드 2 생존 확인
    expect(scopeB['cardRefs']).toEqual(expect.arrayContaining([CARD.c1111, CARD.c2222]))
    expect((scopeB['cardRefs'] as string[]).length).toBe(2)
    expect((scopeB['accountRefs'] as string[]).length).toBe(3)
    expect(scopeB['defaultImportType']).toBe('BANK')

    // 대출 1개 추가 후 범위=대출로 좁혀 저장 → 계좌·카드 생존
    await setType(page, 'ALL')
    await checkRef(page, 'codef-loan-0')
    await setType(page, 'LOAN')
    putBodies.length = 0
    await page.getByTestId('codef-save-scope-button').click()
    await page.waitForTimeout(1500)
    await shot(page, 'B2-save-under-loan-filter')
    const scopeB2 = await getScope(page.request)
    console.log(`[B-대출] GET: ${JSON.stringify(scopeB2)}`)
    expect((scopeB2['accountRefs'] as string[]).length).toBe(3)
    expect((scopeB2['cardRefs'] as string[]).length).toBe(2)
    expect((scopeB2['loanRefs'] as string[]).length).toBe(1)
    expect(scopeB2['defaultImportType']).toBe('LOAN')
  })

  test('C · 의도적 해제: 계좌 1개 실제 해제 후 저장 → 실 GET 계좌 2개(원본이 3개 부활 안 함)', async ({ page }) => {
    await goto(page, '/accounting/bank-transactions')
    await setType(page, 'ALL')
    // 현재 계좌 3(국민·신한·우리) 체크됨. 우리(idx2) 를 실제 해제.
    await expect(page.getByTestId('codef-bank-account-2')).toBeChecked()
    await page.getByTestId('codef-bank-account-2').uncheck()
    await expect(page.getByTestId('codef-bank-account-2')).not.toBeChecked()
    await shot(page, 'C1-uncheck-woori-account')
    putBodies.length = 0
    await page.getByTestId('codef-save-scope-button').click()
    await page.waitForTimeout(1500)
    const put = JSON.parse(putBodies[0] || '{}')
    console.log(`[C] PUT body: ${putBodies[0]}`)
    // 해제한 우리 계좌는 빠지고 2개만 — selection 이 "실제 체크된 것"임을 증명
    expect(put.accountRefs).not.toContain(ACC.woori)
    const scopeC = await getScope(page.request)
    console.log(`[C] GET: ${JSON.stringify(scopeC)}`)
    expect((scopeC['accountRefs'] as string[]).length).toBe(2)
    expect(scopeC['accountRefs']).toEqual(expect.arrayContaining([ACC.kb, ACC.shinhan]))
    expect(scopeC['accountRefs']).not.toContain(ACC.woori)
    await shot(page, 'C2-after-save-2accounts-only')
  })

  test('D · ALL 경계: 전체 칩 → 저장 → 실 GET scopeMode=ALL·refs 전부 []', async ({ page }) => {
    await goto(page, '/accounting/bank-transactions')
    await setType(page, 'ALL')
    // '전체' 칩 클릭 → selectAllScope (scopeMode=ALL, selection=EMPTY)
    const allChip = page.getByTestId('codef-all-scope-chip')
    await allChip.locator('[role="button"]').click()
    await expect(allChip.locator('[role="button"]')).toHaveAttribute('aria-pressed', 'true', { timeout: 8000 })
    await shot(page, 'D1-all-scope-selected')
    putBodies.length = 0
    await page.getByTestId('codef-save-scope-button').click()
    await page.waitForTimeout(1500)
    const put = JSON.parse(putBodies[0] || '{}')
    console.log(`[D] PUT body: ${putBodies[0]}`)
    expect(put.scopeMode).toBe('ALL')
    expect(put.accountRefs).toEqual([])
    expect(put.cardRefs).toEqual([])
    expect(put.loanRefs).toEqual([])
    const scopeD = await getScope(page.request)
    console.log(`[D] GET: ${JSON.stringify(scopeD)}`)
    expect(scopeD['scopeMode']).toBe('ALL')
    expect((scopeD['accountRefs'] as string[]).length).toBe(0)
    await shot(page, 'D2-after-save-all-empty-refs')
  })
})
