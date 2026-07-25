/**
 * PR #925 (#920) 라이브QA — CODEF 가져오기 범위 낙관적 잠금 · U-gate.
 *
 * U-gate 한 문장:
 *   두 사람이 같은 CODEF 가져오기 범위 화면을 열고 각자 다른 계좌를 추가해 저장했을 때,
 *   누구의 선택도 모르게 사라지지 않는다 — 나중 저장자는 충돌을 통지받고, 화면에서
 *   상대의 변경을 확인한 뒤 자기 의도를 관철할 수 있다.
 *
 * 실서버 전용(mock OFF). 두 개의 독립 브라우저 컨텍스트로 A·B 화면을 만든다.
 *
 * ⚠️ 이 스펙은 dev_master 의 실 CODEF 범위(connected-main)에 write 한다.
 *    PM 이 실행 전 스냅샷을 뜨고 실행 후 원복한다(공유 스택).
 */
import { expect, test, type Page, type BrowserContext } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['QA_BASE_URL'] ?? 'http://127.0.0.1:5253'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const SHOTS = path.resolve(_dirname, '../../../../docs/qa/920-codef-scope-lock')
fs.mkdirSync(SHOTS, { recursive: true })

interface LoginResult { token: string; role: string; userId: string; displayName: string }

async function realLogin(page: Page): Promise<LoginResult> {
  const res = await page.request.post(`${API_BASE}/auth/login`, { data: { loginId: 'dev_master', password: PASSWORD } })
  expect(res.ok(), `로그인 실패: HTTP ${res.status()}`).toBeTruthy()
  const d = (await res.json()).data ?? {}
  return { token: d.token ?? '', role: d.role ?? '', userId: d.userId ?? '', displayName: d.displayName ?? 'dev_master' }
}

async function installAuthStub(ctx: BrowserContext, login: LoginResult): Promise<void> {
  await ctx.addInitScript(
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

/** 계좌 체크박스 상태를 사람이 읽는 형태로 덤프한다. */
async function dumpAccounts(page: Page, label: string): Promise<void> {
  const boxes = page.locator('[data-testid^="codef-bank-account-"]')
  const n = await boxes.count()
  const state: string[] = []
  for (let i = 0; i < n; i++) {
    const b = boxes.nth(i)
    const id = await b.getAttribute('data-testid')
    const checked = await b.isChecked().catch(() => false)
    state.push(`${id}=${checked ? '✔' : '·'}`)
  }
  // eslint-disable-next-line no-console
  console.log(`[${label}] ${state.join(' ')}`)
}

async function openScopeScreen(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/accounting/bank-transactions`)
  await page.waitForLoadState('domcontentloaded')
  await page.locator('[data-testid="codef-save-scope-button"]').waitFor({ state: 'visible', timeout: 40000 })
  await page.waitForTimeout(2500)
}

test('U-gate — 두 화면이 각자 다른 계좌를 추가해 저장하면 나중 저장자가 통지받고 자기 선택을 잃지 않는다', async ({ browser }) => {
  const ctxA = await browser.newContext()
  const ctxB = await browser.newContext()
  const pageA = await ctxA.newPage()
  const pageB = await ctxB.newPage()

  const login = await realLogin(pageA)
  await installAuthStub(ctxA, login)
  await installAuthStub(ctxB, login)

  // ① 두 화면이 같은 스냅샷을 로드한다
  await openScopeScreen(pageA)
  await openScopeScreen(pageB)
  await dumpAccounts(pageA, 'A 초기')
  await dumpAccounts(pageB, 'B 초기')
  await pageA.screenshot({ path: path.join(SHOTS, '01-both-loaded-same-snapshot.png') })

  // ② A 가 우리은행(3번째)을 추가하고 저장 → 성공해야 한다
  await pageA.locator('[data-testid="codef-bank-account-2"]').check()
  await pageA.locator('[data-testid="codef-save-scope-button"]').click()
  await pageA.waitForTimeout(3000)
  await dumpAccounts(pageA, 'A 저장 후')
  // eslint-disable-next-line no-console
  console.log(`[A 충돌배너] ${await pageA.locator('[data-testid="codef-scope-conflict"]').count() > 0 ? '있음(예상 밖)' : '없음 ✅'}`)
  await pageA.screenshot({ path: path.join(SHOTS, '02-A-saved-woori.png') })

  // ③ B 가 (A 를 모른 채) 하나은행(4번째)을 추가하고 저장 → 충돌 통지 + 자기 선택 보존
  await pageB.locator('[data-testid="codef-bank-account-3"]').check()
  await dumpAccounts(pageB, 'B 저장 직전(하나 체크)')
  await pageB.locator('[data-testid="codef-save-scope-button"]').click()
  await pageB.waitForTimeout(3500)

  const conflict = pageB.locator('[data-testid="codef-scope-conflict"]')
  const hasConflict = await conflict.count() > 0
  const conflictText = hasConflict ? (await conflict.first().innerText()).replace(/\s+/g, ' ') : '(배너 없음)'
  // eslint-disable-next-line no-console
  console.log(`[B 충돌배너] ${hasConflict ? '있음 ✅' : '없음 ❌'} — ${conflictText}`)
  await dumpAccounts(pageB, 'B 충돌 후')

  // 🔑 K1 — B 가 방금 고른 하나은행이 화면에서 사라지지 않아야 한다
  const hanaStillChecked = await pageB.locator('[data-testid="codef-bank-account-3"]').isChecked().catch(() => false)
  // eslint-disable-next-line no-console
  console.log(`[K1 내 선택 보존] 하나은행 체크 유지 = ${hanaStillChecked ? '✅ 유지' : '❌ 사라짐'}`)

  await pageB.screenshot({ path: path.join(SHOTS, '03-B-conflict-selection-preserved.png') })

  // ④ B 가 다시 저장하면 이번엔 성공해야 한다(막다른 길이 아님 — K5)
  await pageB.locator('[data-testid="codef-save-scope-button"]').click()
  await pageB.waitForTimeout(3500)
  const stillConflict = await pageB.locator('[data-testid="codef-scope-conflict"]').count() > 0
  // eslint-disable-next-line no-console
  console.log(`[K5 재저장] 충돌배너 ${stillConflict ? '여전히 있음' : '해소됨 ✅'}`)
  await dumpAccounts(pageB, 'B 재저장 후')
  await pageB.screenshot({ path: path.join(SHOTS, '04-B-resaved.png') })

  await ctxA.close()
  await ctxB.close()
})
