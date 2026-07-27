import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * 877-pm-cgate-real-qa.spec.ts
 *
 * PM 재수렴 라운드가 발견한 "카드 범위로 저장한 직후 가져오기가 화면에 없는 계좌
 * 거래까지 적재한다" 결함을 **SONNET5 R1 라운드에서 POST payload 단언 스펙으로
 * 전환**했다(종전에는 로그만 찍고 단언이 없었다 — RED-first 원칙상 단언 없는
 * "재현"은 회귀 가드가 아니다).
 *
 * 불변식(브리프 I-1/I-2):
 *   I-1 — 화면이 사용자에게 보여주지 않은 카테고리는 가져오기 실행에 참여하지 않는다.
 *   I-2 — 화면 상태가 같으면 실행 범위도 같다("저장을 눌렀는지"가 실행 범위를 바꾸지 않는다).
 *
 * 🚨 안전조치(SONNET5 R1) — 이 스펙은 원래 실 회계 원장에 행을 적재할 수 있었으나,
 * 이번 개정에서 `page.route()` 로 POST `/accounting/codef/import-scoped` 요청을
 * **가로채 payload 만 검증하고 합성 200 응답으로 fulfill** 한다 — 실제 CODEF 계약/
 * BE import 실행이 전혀 일어나지 않으므로 회계 원장에 아무 것도 적재되지 않는다
 * (구간 2019-05-01~03 은 더 이상 실제로 조회되지 않지만 표기는 유지한다). 저장(PUT)
 * 만 실제로 실행되며, beforeAll/afterAll 이 connected-main 의 원본 scope 를 그대로
 * 복원한다.
 *
 * 실행:
 *   cd clients/desktop
 *   set AUDIT_BASE_URL=http://127.0.0.1:5420
 *   node_modules\.bin\playwright test --config=playwright.real-qa.config.ts \
 *     playwright/877-pm-cgate-real-qa/877-pm-cgate-real-qa.spec.ts --reporter=line --timeout=180000
 */
import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5420'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = 'dev_p05_pass!'
const CONNECTED = 'connected-main'
const FROM = '2019-05-01'
const TO = '2019-05-03'
const SHOTS = resolveQaShotsDir(path.resolve('../../docs/qa/877-sonnet-r1-fix'))
fs.mkdirSync(SHOTS, { recursive: true })

interface Scope {
  connectedId: string
  accountRefs: string[]
  cardRefs: string[]
  loanRefs: string[]
  defaultImportType: string
  scopeMode: string | null
}

let TOKEN = ''
let AUTH: { token: string; role: string; userId: string; displayName: string }
let ORIGINAL: Scope | null = null

async function login(req: APIRequestContext) {
  const res = await req.post(`${API_BASE}/auth/login`, {
    data: { loginId: 'dev_master', password: PASSWORD },
  })
  expect(res.ok(), `로그인 실패 HTTP ${res.status()}`).toBeTruthy()
  const d = (await res.json()).data ?? {}
  return { token: d.token ?? '', role: d.role ?? '', userId: d.userId ?? '', displayName: d.displayName ?? 'dev_master' }
}

function headers() {
  return { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }
}

async function getScope(req: APIRequestContext): Promise<Scope> {
  const res = await req.get(`${API_BASE}/accounting/codef/scopes?connectedId=${CONNECTED}`, { headers: headers() })
  expect(res.ok(), `GET scope HTTP ${res.status()}`).toBeTruthy()
  return (await res.json()).data as Scope
}

async function installAuth(page: Page) {
  await page.addInitScript((a) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ token: a.token, userId: a.userId, role: a.role, fullName: a.displayName, partnerCode: null }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, AUTH)
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
  await expect(page.getByText('MASTER').first()).toBeVisible({ timeout: 25_000 })
  await dismissUpdateModal(page)
  await expect(page.getByTestId('codef-import-type')).toBeVisible({ timeout: 20_000 })
  await page.getByTestId('codef-import-type').scrollIntoViewIfNeeded()
  await page.waitForTimeout(800)
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true })
}

async function setType(page: Page, type: string) {
  await page.getByTestId('codef-import-type').selectOption(type)
  await page.waitForTimeout(250)
}

async function leaveAllScope(page: Page) {
  const pressable = page.getByTestId('codef-all-scope-chip').locator('[role="button"]').first()
  if ((await pressable.getAttribute('aria-pressed')) === 'true') {
    await page.getByRole('button', { name: '전체 범위 제거' }).click()
    await expect(pressable).toHaveAttribute('aria-pressed', 'false')
  }
}

test.describe.serial('#877 SONNET5 R1 — 저장 범위 밖 카테고리가 가져오기에서 실행되지 않는다 (I-1/I-2)', () => {
  test.beforeAll(async ({ playwright }) => {
    const req = await playwright.request.newContext()
    AUTH = await login(req)
    TOKEN = AUTH.token
    ORIGINAL = await getScope(req)
    console.log(`[beforeAll] 원본 scope: ${JSON.stringify(ORIGINAL)}`)
    await req.dispose()
  })

  test.afterAll(async ({ playwright }) => {
    const req = await playwright.request.newContext()
    if (ORIGINAL) {
      await req.put(`${API_BASE}/accounting/codef/scopes`, {
        headers: headers(),
        data: {
          connectedId: CONNECTED,
          accountRefs: ORIGINAL.accountRefs ?? [],
          cardRefs: ORIGINAL.cardRefs ?? [],
          loanRefs: ORIGINAL.loanRefs ?? [],
          defaultImportType: ORIGINAL.defaultImportType ?? 'ALL',
          scopeMode: ORIGINAL.scopeMode ?? 'ALL',
        },
      })
      console.log(`[afterAll] 복원 GET: ${JSON.stringify(await getScope(req))}`)
    }
    await req.dispose()
  })

  test('카드 범위로 저장한 직후 가져오기 — POST payload 에 화면에 없는 계좌가 새지 않는다', async ({ page }) => {
    await installAuth(page)
    await gotoReal(page)

    // 1) 전체 범위에서 계좌 3 + 카드 2 체크
    await setType(page, 'ALL')
    await leaveAllScope(page)
    for (const i of [0, 1, 2]) await page.getByTestId(`codef-bank-account-${i}`).check()
    for (const i of [0, 1]) await page.getByTestId(`codef-card-${i}`).check()
    await page.waitForTimeout(300)
    await shot(page, '01-all-view-3accounts-2cards-checked')

    // 2) 조회 구간을 미사용 구간으로(실제로는 route 가로채기로 CODEF 조회 자체가 일어나지 않는다)
    await page.getByTestId('codef-import-from').fill(FROM)
    await page.getByTestId('codef-import-to').fill(TO)

    // 3) 범위를 카드로 좁힘 — 계좌는 화면에서 사라진다
    await setType(page, 'CARD')
    await page.waitForTimeout(400)
    const bankVisibleAfterFilter = await page.getByTestId('codef-bank-account-0').count()
    console.log(`[STEP3] 범위=CARD 전환 후 화면의 계좌 체크박스 수: ${bankVisibleAfterFilter}`)
    expect(bankVisibleAfterFilter, '범위=CARD 전환 후 계좌 체크박스는 화면에서 사라져야 한다').toBe(0)
    await shot(page, '02-card-filter-accounts-hidden')

    // 4) 저장 (#877 fix 로 계좌 3개가 서버에 보존된다 — 이 동작은 그대로 유지되어야 한다)
    let savePut: string | null = null
    page.on('request', (r) => {
      if (r.method() === 'PUT' && r.url().includes('/accounting/codef/scopes')) savePut = r.postData()
    })
    await page.getByTestId('codef-save-scope-button').click()
    await expect(page.getByText('가져오기 선택을 저장했습니다.')).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(500)
    console.log(`[STEP4] 저장 PUT body: ${savePut}`)
    const savedParsed = savePut ? JSON.parse(savePut) : {}
    expect(savedParsed.accountRefs?.length, '저장(PUT)은 화면 필터 밖 계좌 3개를 계속 보존해야 한다(#877 본체 무회귀)').toBe(3)
    expect(savedParsed.defaultImportType).toBe('CARD')
    await shot(page, '03-after-save-card-filter')

    // 5) 아무것도 건드리지 않고 즉시 가져오기 — POST 를 가로채 payload 만 검증하고,
    //    실제 CODEF 조회/BE import 실행 없이 합성 200 으로 fulfill 한다(회계 원장 미적재).
    let importPost: string | null = null
    await page.route('**/accounting/codef/import-scoped', async (route) => {
      importPost = route.request().postData()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          code: 'OK',
          message: '',
          timestamp: new Date().toISOString(),
          data: {
            fetchedCount: 0,
            importedCount: 0,
            duplicateSkippedCount: 0,
            matchedCount: 0,
            staleSkippedCount: 0,
            staleNormalizedNames: [],
            unavailableSkippedCount: 0,
            unavailableNames: [],
          },
        }),
      })
    })

    await page.getByTestId('codef-import-button').click()
    await expect(page.getByTestId('codef-import-result')).toBeVisible({ timeout: 30_000 })
    await shot(page, '04-after-import-result-card-only')

    // 6) 판정 — 화면에 없던 계좌가 payload 에 들어갔는가(I-1) · 저장 여부가 실행 범위를
    //    바꾸지 않는가(I-2, 이 케이스는 "저장 직후 즉시"라 restoredScope 경로를 정확히 탄다).
    const parsed = importPost ? JSON.parse(importPost) : {}
    console.log(
      `[VERDICT] type=${parsed.type} scopeMode=${parsed.scopeMode} ` +
        `accountRefs=${JSON.stringify(parsed.accountRefs)} cardRefs=${JSON.stringify(parsed.cardRefs)} ` +
        `loanRefs=${JSON.stringify(parsed.loanRefs)}`,
    )

    expect(parsed.accountRefs ?? [], 'I-1 위반 — 화면에 없는 계좌 refs 가 가져오기 POST 에 포함되면 안 된다').toEqual([])
    expect(parsed.type, "I-1 위반 — 화면 범위(카드)와 다르게 type 이 'ALL' 로 확대되면 안 된다").toBe('CARD')
    expect(parsed.cardRefs?.length, '화면에 보이는 카드 2건은 그대로 실행되어야 한다').toBe(2)
    expect(parsed.loanRefs ?? []).toEqual([])
    expect(parsed.scopeMode).toBe('SELECTED')
  })
})
