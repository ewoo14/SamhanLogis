/**
 * 877-pm-cgate-real-qa.spec.ts
 *
 * PM 재수렴 라운드 — 표면 B·C 가 독립 발견한 "카드 범위로 저장한 직후 가져오기가
 * 화면에 없는 계좌 거래까지 적재한다" 후보를 **실서버에서 실행**해 확정/반증한다.
 *
 * 실행:
 *   cd clients/desktop
 *   set AUDIT_BASE_URL=http://127.0.0.1:5420
 *   node_modules\.bin\playwright test --config=playwright.real-qa.config.ts \
 *     playwright/877-pm-cgate-real-qa/877-pm-cgate-real-qa.spec.ts --reporter=line --timeout=180000
 *
 * 🚨 이 스펙은 실 회계 원장에 행을 적재할 수 있다. 대상 구간은 미사용 구간
 *    (2019-05-01 ~ 2019-05-03, 실측 0건)이며 PM 이 실행 후 DB 에서 정리한다.
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
const SHOTS = path.resolve('../../docs/qa/877-pm-cgate')
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

test.describe.serial('#877 PM 재수렴 — 저장 범위 밖 카테고리가 가져오기에서 실행되는가', () => {
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

  test('카드 범위로 저장한 직후 가져오기 — 실제 POST body 와 적재 결과', async ({ page }) => {
    await installAuth(page)
    await gotoReal(page)

    // 1) 전체 범위에서 계좌 3 + 카드 2 체크
    await setType(page, 'ALL')
    await leaveAllScope(page)
    for (const i of [0, 1, 2]) await page.getByTestId(`codef-bank-account-${i}`).check()
    for (const i of [0, 1]) await page.getByTestId(`codef-card-${i}`).check()
    await page.waitForTimeout(300)
    await shot(page, '01-all-view-3accounts-2cards-checked')

    // 2) 조회 구간을 미사용 구간으로
    await page.getByTestId('codef-import-from').fill(FROM)
    await page.getByTestId('codef-import-to').fill(TO)

    // 3) 범위를 카드로 좁힘 — 계좌는 화면에서 사라진다
    await setType(page, 'CARD')
    await page.waitForTimeout(400)
    const bankVisibleAfterFilter = await page.getByTestId('codef-bank-account-0').count()
    console.log(`[STEP3] 범위=CARD 전환 후 화면의 계좌 체크박스 수: ${bankVisibleAfterFilter}`)
    await shot(page, '02-card-filter-accounts-hidden')

    // 4) 저장 (#877 fix 로 계좌 3개가 서버에 보존된다)
    let savePut: string | null = null
    page.on('request', (r) => {
      if (r.method() === 'PUT' && r.url().includes('/accounting/codef/scopes')) savePut = r.postData()
    })
    await page.getByTestId('codef-save-scope-button').click()
    await expect(page.getByText('가져오기 선택을 저장했습니다.')).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(500)
    console.log(`[STEP4] 저장 PUT body: ${savePut}`)
    await shot(page, '03-after-save-card-filter')

    // 5) 아무것도 건드리지 않고 즉시 가져오기 — POST body 를 그대로 포착
    let importPost: string | null = null
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('/accounting/codef/import-scoped')) importPost = r.postData()
    })
    const respPromise = page.waitForResponse(
      (r) => r.url().includes('/accounting/codef/import-scoped') && r.request().method() === 'POST',
      { timeout: 90_000 },
    )
    await page.getByTestId('codef-import-button').click()
    const resp = await respPromise
    const respBody = await resp.text()
    console.log(`[STEP5] 가져오기 POST body: ${importPost}`)
    console.log(`[STEP5] 가져오기 응답 HTTP ${resp.status()}: ${respBody.slice(0, 600)}`)

    await expect(page.getByTestId('codef-import-result')).toBeVisible({ timeout: 30_000 })
    const resultText = (await page.getByTestId('codef-import-result').innerText()).replace(/\s+/g, ' ')
    console.log(`[STEP5] 화면 결과 패널: ${resultText}`)
    await shot(page, '04-after-import-result')

    // 6) 판정 근거 출력 — 화면에 없던 계좌가 payload 에 들어갔는가
    const parsed = importPost ? JSON.parse(importPost) : {}
    console.log(
      `[VERDICT] type=${parsed.type} scopeMode=${parsed.scopeMode} ` +
        `accountRefs=${JSON.stringify(parsed.accountRefs)} cardRefs=${JSON.stringify(parsed.cardRefs)}`,
    )
  })
})
