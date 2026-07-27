import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * E2 기둥1 — 라이브 컬렉션 동기화 2세션 실서버 GUI QA (#699 owed backfill).
 *
 * 실 게이트웨이(:8080) → slip-service SSE(dispatch:board:changed, afterCommit) →
 * FE useCollectionRealtime invalidate → 다른 세션 화면 자동 refetch. 합성/fixture 없음.
 *
 * 시나리오: 세션A·세션B 모두 오늘 DRAFT 배차보드 진입(동일 task) → 세션B 가 차량그룹 추가 →
 * 세션A 는 **새로고침 없이** SSE 로 그룹 카드가 증가(라이브 동기화 실증). 단계별 GUI 캡처.
 * (#699 라이브 QA 가 SSE round-trip 텍스트로만 되어 실 화면 스샷 미충족 → 본 backfill 이 GUI 보강.)
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5175'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/e2-live-sync-dispatch'))
fs.mkdirSync(SHOTS, { recursive: true })

let shotNo = 0
async function capture(page: Page, name: string): Promise<void> {
  shotNo++
  await page.screenshot({
    path: path.join(SHOTS, `gui-${String(shotNo).padStart(2, '0')}-${name}.png`),
    fullPage: false,
  })
}

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

const GROUP_SELECT = '[data-testid^="dispatch-board-vehicle-group-"][data-testid$="-select"]'

async function openBoard(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/#/dispatch-board`)
  await page.waitForSelector('[data-testid="dispatch-board-page"]', { timeout: 30000 })
  await expect(page.getByTestId('dispatch-board-add-vehicle-button')).toBeEnabled({ timeout: 15000 })
  await page.waitForTimeout(800)
}

test('#699 라이브 컬렉션 동기화 — 세션B 그룹추가 → 세션A 보드 SSE 자동갱신(무새로고침)', async ({ browser }) => {
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const pageA = await ctxA.newPage()
  const pageB = await ctxB.newPage()

  await installAuthStub(pageA, await realLogin(pageA, 'dev_master'))
  await installAuthStub(pageB, await realLogin(pageB, 'dev_master'))

  // 두 세션 모두 오늘 DRAFT 배차보드 진입(동일 task 공유).
  await openBoard(pageA)
  await openBoard(pageB)

  const beforeA = await pageA.locator(GROUP_SELECT).count()
  await capture(pageA, 'sessionA-board-before')

  // 세션B 가 차량그룹 추가(afterCommit SSE dispatch:board:changed 발화).
  await pageB.getByTestId('dispatch-board-add-vehicle-button').click()
  await expect(pageB.getByTestId('dispatch-board-add-vehicle-submit')).toBeVisible({ timeout: 10000 })
  await pageB.getByTestId('dispatch-board-add-vehicle-body-option-CARGO').click()
  await pageB.getByTestId('dispatch-board-add-vehicle-tonnage-option-T_1').click()
  await pageB.getByTestId('dispatch-board-add-vehicle-submit').click()
  await pageB.waitForTimeout(600)
  await capture(pageB, 'sessionB-added-group')

  // 세션A 는 **새로고침 없이** SSE→useCollectionRealtime invalidate→refetch 로 그룹 카드 증가.
  await expect
    .poll(async () => pageA.locator(GROUP_SELECT).count(), { timeout: 25000, intervals: [500, 1000, 2000] })
    .toBeGreaterThan(beforeA)
  await pageA.waitForTimeout(400)
  await capture(pageA, 'sessionA-board-after-sse-reflected')

  const afterA = await pageA.locator(GROUP_SELECT).count()
  expect(afterA, '세션A 보드가 세션B 추가를 SSE 로 반영해야 함').toBeGreaterThan(beforeA)

  await ctxA.close()
  await ctxB.close()
})
