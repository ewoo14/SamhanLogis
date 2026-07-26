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
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['QA_BASE_URL'] ?? 'http://127.0.0.1:5253'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
// K5 라이브 재검증 전용 하위폴더 — docs/qa/** 기존 커밋 파일(01~04*, r3-*, r4-verify/*,
// rA-closing/*, rB-bound-revert/*) 절대 미접촉(덮어쓰기 금지 컨벤션). 이 상수 자신도
// 재실행 시 자기 자신의 기존 커밋 증거를 덮어쓸 수 있어 resolveQaShotsDir 로 감싼다
// (기본 _local/ 격리, 승격은 QA_SHOTS_DIR opt-in — 2026-07-26 하네스 재수렴 라운드 G2).
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/920-codef-scope-lock/k5-live'))

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
  // 경로만(path) goto 하면 렌더러가 createHashRouter 라 해시가 비어 대시보드(기본 라우트)로
  // 떨어진다(routes/index.tsx — VITE_PLATFORM!=='web' 이면 항상 HashRouter) — 반드시 `#/...`.
  await page.goto(`${BASE_URL}/#/accounting/bank-transactions`)
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
  // 무음 유실 차단의 핵심 — B 는 A 가 먼저 저장했다는 사실을 통지받아야 한다. console.log
  // 만으로는 회귀해도 스펙이 계속 green 이므로(재수렴 R4 지적) 실제 expect 로 고정한다.
  expect(hasConflict, 'B 는 충돌(409) 통지를 받아야 한다 — 통지 없이 조용히 성공하면 무음 유실').toBeTruthy()

  // 🔑 K1 — B 가 방금 고른 하나은행이 화면에서 사라지지 않아야 한다
  const hanaStillChecked = await pageB.locator('[data-testid="codef-bank-account-3"]').isChecked().catch(() => false)
  // eslint-disable-next-line no-console
  console.log(`[K1 내 선택 보존] 하나은행 체크 유지 = ${hanaStillChecked ? '✅ 유지' : '❌ 사라짐'}`)
  expect(hanaStillChecked, 'K1 — 충돌 후에도 방금 고른 하나은행 체크가 조용히 사라지면 안 된다').toBe(true)

  await pageB.screenshot({ path: path.join(SHOTS, '03-B-conflict-selection-preserved.png') })

  // ④ B 가 다시 저장하면 이번엔 성공해야 한다(막다른 길이 아님 — K5).
  //
  // ⚠️ 재수렴 R4 이전에는 여기서 일반 저장 버튼(codef-save-scope-button)을 다시 눌렀다 —
  // 그러나 L3 fix 이후 충돌 중 일반 저장은 "서버 항목을 조용히 지울 수 있다"는 이유로
  // 항상 비활성이다(가려진 채 아무 PUT 도 나가지 않아 이 스펙은 더 이상 K5 를 증명하지
  // 못했다). B 의 화면(하나만 추가, 우리는 없음)은 A 가 저장한 우리를 포괄하지 않으므로
  // (N7 covering 아님) 배너의 명시적 "현재 화면 선택으로 덮어쓰기" 버튼이 진짜 K5 경로다.
  const overwriteButton = pageB.locator('[data-testid="codef-scope-overwrite-button"]')
  await expect(
    overwriteButton,
    'K5 — 충돌 후에도 명시적 재저장 수단이 화면에 있어야 한다(막다른 길이면 안 된다)',
  ).toBeVisible({ timeout: 5000 })
  await expect(overwriteButton, 'K5 재저장 버튼은 클릭 가능(비활성 아님)해야 한다').toBeEnabled()
  await overwriteButton.click()
  await pageB.waitForTimeout(3500)
  const stillConflict = await pageB.locator('[data-testid="codef-scope-conflict"]').count() > 0
  // eslint-disable-next-line no-console
  console.log(`[K5 재저장] 충돌배너 ${stillConflict ? '여전히 있음' : '해소됨 ✅'}`)
  await dumpAccounts(pageB, 'B 재저장 후')
  await pageB.screenshot({ path: path.join(SHOTS, '04-B-resaved.png') })
  expect(stillConflict, 'K5 — 명시적 재저장 후에는 충돌 배너가 해소되어야 한다(막다른 길이 아님)').toBe(false)
  // 재저장이 실제로 반영됐는지 새로고침으로 재확인한다(화면 상태만이 아니라 서버 반영 확인).
  await pageB.reload()
  await pageB.waitForLoadState('domcontentloaded')
  await pageB.locator('[data-testid="codef-save-scope-button"]').waitFor({ state: 'visible', timeout: 40000 })
  await pageB.waitForTimeout(2500)
  await dumpAccounts(pageB, 'B 재진입(서버 반영 확인)')
  const hanaPersisted = await pageB.locator('[data-testid="codef-bank-account-3"]').isChecked().catch(() => false)
  expect(hanaPersisted, 'K5 — 재저장한 선택(하나은행)이 서버에 실제로 반영되어 재진입 시 복원되어야 한다').toBe(true)
  // ⑥ 최종 서버 상태가 B 선택과 일치함을 캡처로 남긴다(새로고침 후 화면 = 서버 GET 응답 그대로).
  await pageB.screenshot({ path: path.join(SHOTS, '05-B-reentry-server-state-confirmed.png') })

  await ctxA.close()
  await ctxB.close()
})
