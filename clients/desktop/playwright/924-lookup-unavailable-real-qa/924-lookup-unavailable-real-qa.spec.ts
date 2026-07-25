/**
 * PR #924 (#831) 라이브QA — partner lookup UNAVAILABLE 시 실 사용자 화면 거동.
 *
 * 실서버 전용(mock OFF). 렌더러는 vite.web.config.ts dev 서버(BrowserRouter)이므로
 * 해시 라우팅(`/#/...`)을 쓰지 않는다 — 해시는 무시돼 대시보드가 렌더된다.
 *
 * 사용:
 *   cd clients/desktop
 *   # 정상 구간
 *   QA_PHASE=up   node_modules\.bin\playwright test --config=playwright.real-qa.config.ts \
 *     playwright/924-lookup-unavailable-real-qa/924-lookup-unavailable-real-qa.spec.ts
 *   # partner-service 중단 후
 *   QA_PHASE=down node_modules\.bin\playwright test --config=playwright.real-qa.config.ts \
 *     playwright/924-lookup-unavailable-real-qa/924-lookup-unavailable-real-qa.spec.ts
 *
 * 중단/복구는 스펙이 하지 않는다(PM 이 Bash 로 단독 통제 창을 연다) — 공유 스택이라
 * 스펙이 컨테이너를 토글하면 다른 트랙 관찰을 오염시킨다.
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['QA_BASE_URL'] ?? 'http://127.0.0.1:5250'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const PHASE = process.env['QA_PHASE'] ?? 'up'
const SHOTS = path.resolve(_dirname, '../../../../docs/qa/924-lookup-unavailable')
fs.mkdirSync(SHOTS, { recursive: true })

/** 실 입금보고서 — partner_id 보유(= 표시명 enrichment 대상). */
const CASH_RECEIPT_ID = 'e1b7e2fb-052b-4a4b-8d47-cb74cb700e10'

interface LoginResult { token: string; role: string; userId: string; displayName: string }

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

async function capture(page: Page, name: string, fullPage = false): Promise<void> {
  const file = path.join(SHOTS, `${PHASE}-${name}.png`)
  await page.screenshot({ path: file, fullPage })
  // eslint-disable-next-line no-console
  console.log(`[캡처] ${file}`)
}

/** 입력 필드 값은 innerText 에 안 잡힌다 — 폼 오염 검증에는 value 를 직접 읽어야 한다. */
async function dumpInputs(page: Page, label: string): Promise<void> {
  const values = await page.locator('input:not([type=hidden])').evaluateAll((els) =>
    (els as HTMLInputElement[])
      .map((el) => `${el.getAttribute('aria-label') ?? el.getAttribute('placeholder') ?? el.name ?? '?'}="${el.value}"`)
      .filter((s) => !s.endsWith('=""')),
  )
  // eslint-disable-next-line no-console
  console.log(`[${PHASE}] ${label} ▶ ${values.join(' | ').slice(0, 600)}`)
}

/** 화면의 사람이 읽는 텍스트를 로그로 남긴다 — 스크린샷만으로는 회귀 대조가 어렵다. */
async function dumpVisible(page: Page, label: string, selector: string): Promise<void> {
  const text = await page.locator(selector).first().innerText().catch(() => '(요소 없음)')
  // eslint-disable-next-line no-console
  console.log(`[${PHASE}] ${label} ▶ ${text.replace(/\s+/g, ' ').slice(0, 400)}`)
}

test.describe(`#924 partner lookup UNAVAILABLE 라이브QA (phase=${PHASE})`, () => {
  test.beforeEach(async ({ page }) => {
    const login = await realLogin(page, 'dev_master')
    await installAuthStub(page, login)
  })

  test('통장거래 목록 — 316건이 남아 있는가', async ({ page }) => {
    await page.goto(`${BASE_URL}/accounting/bank-transactions`)
    await page.waitForLoadState('domcontentloaded')
    // 🚨 '조회 중' 조건은 쿼리 시작 전에 즉시 참이 돼 로딩 전 상태를 찍는다(실측 2회 오측정).
    // react-query 전역 retry:1 이라 502 도 2.24s x 2 + 렌더 시간이 필요하다 — 고정 대기로 넘긴다.
    await page.waitForTimeout(15000)
    await dumpVisible(page, '통장거래 본문', 'main')
    await capture(page, '01-bank-transactions', true)
  })

  test('거래처 에이징 — 502 시 사용자가 무엇을 읽는가', async ({ page }) => {
    await page.goto(`${BASE_URL}/accounting/reports/partner-aging?type=RECEIVABLE`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(15000)
    await dumpVisible(page, '에이징 본문', 'main')
    await capture(page, '02-partner-aging')
  })

  test('입금보고서 편집 — 거래처 칸에 무엇이 하이드레이트되는가', async ({ page }) => {
    await page.goto(`${BASE_URL}/accounting/admin/cash-receipts/${CASH_RECEIPT_ID}/edit`)
    await page.waitForLoadState('domcontentloaded')
    await page.getByPlaceholder('거래처명 또는 사업자번호').first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => undefined)
    await page.waitForTimeout(3000)
    await dumpVisible(page, '입금보고서 편집 본문', 'main')
    await dumpInputs(page, '입금보고서 편집 입력값')
    await capture(page, '03-cash-receipt-edit')
  })

  test('분개 작성 — 거래처 자동완성이 장애를 어떻게 말하는가', async ({ page }) => {
    await page.goto(`${BASE_URL}/accounting/journals/new`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(8000)
    const partnerInput = page.getByPlaceholder('거래처명 또는 코드').first()
    await expect(partnerInput).toBeVisible({ timeout: 15000 })
    await partnerInput.click()
    await partnerInput.type('한국', { delay: 120 })
    await page.waitForTimeout(4000)
    await dumpVisible(page, '분개 작성 본문', 'main')
    // 자동완성 드롭다운이 장애를 뭐라고 말하는지 — "결과 없음" 이면 존재하지 않는 거래처로 오진시킨다
    await dumpVisible(page, '자동완성 드롭다운', '[role="listbox"]')
    await capture(page, '04-journal-new-partner-search')
  })
})
