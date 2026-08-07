import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * PR #923 (#870) — PM 직접 라이브QA (실서버 :8080 + 실 렌더러 mock OFF).
 *
 * 결함: 401 후 gcTime(5분) 이내 다른 계정 재로그인 시 이전 사용자 권한 캐시가
 * 남아 새 사용자에게 렌더된다(Electron 분기 한정). fix 후 이 누출이 사라지는지
 * 실제 UI(사이드바 "개발" 그룹)로 실증한다.
 *
 * 하네스(T5 정찰 방식 재현): window.samhanAuth 를 localStorage 기반으로 shim 해
 * Electron 분기(isNativePlatform)를 강제한다. 토큰은 전부 실서버 발급분.
 *
 * 실행:
 *   cd clients/desktop
 *   set AUDIT_BASE_URL=http://127.0.0.1:5522
 *   node_modules\.bin\playwright test --config=playwright.real-qa.config.ts ^
 *     playwright/pm-870-liveqa-real-qa --reporter=line --timeout=180000
 */
import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5522'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? (process.env.DEV_PASSWORD ?? '')
const SHOTS = resolveQaShotsDir(path.resolve(process.env['AUDIT_SHOT_DIR'] ?? '../../docs/qa/pm-870-liveqa'))
fs.mkdirSync(SHOTS, { recursive: true })

const DEV_GROUP = "[data-testid='sidebar-category-toggle-개발']"

test.use({ viewport: { width: 1440, height: 900 } })

async function installShim(page: Page): Promise<void> {
  // window.samhanAuth 를 localStorage 기반으로 shim — Electron 분기 강제.
  await page.addInitScript(() => {
    const KEY = '__qa_token'
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => {
          const raw = localStorage.getItem(KEY)
          return raw ? JSON.parse(raw) : null
        },
        setToken: async (t: unknown) => localStorage.setItem(KEY, JSON.stringify(t)),
        clearToken: async () => localStorage.removeItem(KEY),
      },
    })
  })
}

async function realLogin(page: Page, loginId: string): Promise<void> {
  await page.getByTestId('login-id-input').fill(loginId)
  await page.getByTestId('login-password-input').fill(PASSWORD)
  await page.getByTestId('login-submit-button').click()
}

test('#870 PM 라이브QA — 401 후 타계정 재로그인 시 이전 권한 그룹이 남지 않는다', async ({ page }) => {
  const shot = async (n: string) => page.screenshot({ path: path.join(SHOTS, `${n}.png`), fullPage: false })

  // 실서버 health 확인 (사전 조건)
  const health = await page.request.get(`${API_BASE}/actuator/health`)
  expect(health.ok(), '실 BE 미가동').toBeTruthy()

  // permissions/my 재조회 횟수 카운트 (delta 측정)
  let permFetches = 0
  page.on('response', (r) => {
    if (r.url().includes('/auth/admin/permissions/my')) permFetches += 1
  })

  await installShim(page)

  // ── 1) dev_master 실 로그인
  await page.goto(`${BASE_URL}/#/login`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('login-submit-button')).toBeVisible({ timeout: 30_000 })
  await realLogin(page, 'dev_master')

  // 로그인 성공 → 사이드바 로드. "개발" 그룹은 MASTER 전용.
  await expect(page.locator(DEV_GROUP)).toBeVisible({ timeout: 30_000 })
  const masterFetches = permFetches
  const masterGroups = await page.locator('.app-sidebar-group').count()
  const masterHasDev = await page.locator(DEV_GROUP).count()
  await shot('01-master-sidebar')
  console.log('[PM-870] master:', JSON.stringify({ masterFetches, masterGroups, masterHasDev }))

  // ── 2) 토큰 무효화 → 보호 API 호출 → 401 → 로그인 화면
  await page.evaluate(() => {
    localStorage.setItem('__qa_token', JSON.stringify({ token: 'INVALID.qa.token', userId: 'x', role: 'MASTER' }))
  })
  // 보호 라우트로 이동 시도 → 그 화면의 쿼리가 401 → 인터셉터가 clearAuthState → #/login
  await page.goto(`${BASE_URL}/#/admin/photo-audit`, { waitUntil: 'domcontentloaded' }).catch(() => undefined)
  await expect(page.getByTestId('login-submit-button')).toBeVisible({ timeout: 30_000 })
  await shot('02-after-401-login-screen')

  // ── 3) dev_warehouse 재로그인 (같은 렌더러 인스턴스 = gcTime 이내)
  const fetchesBeforeRelogin = permFetches
  await realLogin(page, 'dev_warehouse')

  // 사이드바 재로드 — WAREHOUSE 는 "개발" 그룹이 없어야 한다(핵심 단언).
  await expect(page.locator('.app-sidebar-group').first()).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(1500)
  const whGroups = await page.locator('.app-sidebar-group').count()
  const whHasDev = await page.locator(DEV_GROUP).count()
  const permFetchDeltaAfterRelogin = permFetches - fetchesBeforeRelogin
  await shot('03-warehouse-after-relogin')

  const verdict = {
    masterGroups,
    masterHasDev,
    whGroups,
    whHasDev,
    permFetchDeltaAfterRelogin,
    staleLeak: whHasDev > 0, // 재로그인 후 WAREHOUSE 인데 개발 그룹이 남아 있으면 누출
  }
  console.log('[PM-870-VERDICT]', JSON.stringify(verdict))

  // ── 단언 (fix GREEN)
  expect(masterHasDev, 'dev_master 는 개발 그룹을 봐야 한다(사전 조건)').toBeGreaterThan(0)
  expect(whHasDev, '재로그인한 dev_warehouse 에게 이전 MASTER 개발 그룹이 남으면 안 된다').toBe(0)
  expect(whGroups, 'WAREHOUSE 그룹 수가 MASTER 보다 적어야 한다').toBeLessThan(masterGroups)
  expect(permFetchDeltaAfterRelogin, '재로그인 시 권한을 새로 조회해야 한다').toBeGreaterThan(0)
})
