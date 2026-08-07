import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #2 P1 fix 라이브 실QA(mock OFF) — 재빌드 slip-service(today-draft 엔드포인트 + 발송그룹 가드).
 *
 * 실 게이트웨이(:8080) → 재빌드 slip-service → 실 Postgres. dev_master 실로그인.
 * (Codex 라운드) today-draft 재사용: 보드 진입 후 F5 reload 해도 taskCode 동일 = mount-creates-new-task
 *   교착(Codex/Fable5 P1) 해소 실증.
 * (Fable5 라운드) active subset(차종9/톤수6) 라이브 재확인.
 * 산출: docs/qa/dispatch-board-2pane/codex-round-today-draft-reuse.png,
 *       docs/qa/dispatch-board-2pane/fable5-round-active-subset.png
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5178'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? (process.env.DEV_PASSWORD ?? '')
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/dispatch-board-2pane'))
fs.mkdirSync(SHOTS, { recursive: true })

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

test('Codex 라운드 — today-draft 재사용(F5 reload 동일 taskCode, 교착 해소)', async ({ page }) => {
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)
  await page.goto(`${BASE_URL}/#/dispatch-board`)
  await page.waitForSelector('[data-testid="dispatch-board-page"]', { timeout: 30000 })
  // today-draft 엔드포인트로 mount 초기화 성공 = 초기화 실패 배너 부재
  await expect(page.getByTestId('dispatch-board-task-code')).toBeVisible({ timeout: 20000 })
  const firstCode = (await page.getByTestId('dispatch-board-task-code').textContent())?.trim()
  expect(firstCode, 'taskCode 표시').toBeTruthy()

  // F5 reload → today-draft 가 같은 DRAFT 재사용 → 동일 taskCode (새 task 생성 안 함)
  await page.reload()
  await page.waitForSelector('[data-testid="dispatch-board-page"]', { timeout: 30000 })
  await expect(page.getByTestId('dispatch-board-task-code')).toBeVisible({ timeout: 20000 })
  const secondCode = (await page.getByTestId('dispatch-board-task-code').textContent())?.trim()
  expect(secondCode, 'reload 후 동일 taskCode = today-draft 재사용').toBe(firstCode)

  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(SHOTS, 'codex-round-today-draft-reuse.png'), fullPage: true })
})

test('Fable5 라운드 — active subset(차종9/톤수6) 라이브', async ({ page }) => {
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)
  await page.goto(`${BASE_URL}/#/dispatch-board`)
  await page.waitForSelector('[data-testid="dispatch-board-page"]', { timeout: 30000 })
  await expect(page.getByTestId('dispatch-board-add-vehicle-button')).toBeEnabled({ timeout: 15000 })

  await page.getByTestId('dispatch-board-add-vehicle-button').click()
  await expect(page.getByTestId('dispatch-board-add-vehicle-submit')).toBeVisible({ timeout: 10000 })
  await expect(page.locator('[data-testid^="dispatch-board-add-vehicle-body-option-"]')).toHaveCount(9)
  await page.getByTestId('dispatch-board-add-vehicle-body-option-CARGO').click()
  await expect(page.locator('[data-testid^="dispatch-board-add-vehicle-tonnage-option-"]')).toHaveCount(6)
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(SHOTS, 'fable5-round-active-subset.png'), fullPage: true })
})
