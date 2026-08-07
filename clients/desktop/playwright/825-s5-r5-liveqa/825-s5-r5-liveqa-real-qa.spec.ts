import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #825 슬5 R5 머지 전 라이브 QA — HIGH-1(저장 scope BE 강제) 실 GUI 캡처.
 *
 * 실 게이트웨이 :8080 · mock OFF · 실 로그인(dev_master) · 합성/fixture 없음(전부 실 DOM).
 * 렌더러: vite.renderer.dev.config.ts (src/renderer 직접 서빙 — 최신 desktop 소스 반영).
 *
 * 검증:
 *  A) 정상 경로 무회귀(check#1) — 저장 {ALL, CARD} 사용자의 정상 실행(FE 가 저장값 CARD 전송)이
 *     여전히 CARD 만 열거(조회 15, 전체 45 아님). A1 함정: 카테고리 고유 건수(CARD=15/ALL=45)로 판정.
 *  B) 대조 — 저장 {ALL, ALL} 은 45. 같은 UI 에서 15(CARD) vs 45(ALL) 시각 대조.
 *  C) FE 드롭다운(check#3, 부분) — canUpdate=true(master) 에서 유형 드롭다운 활성 확인.
 *     canUpdate=false 잠김 상태는 라이브 계정 권한셀 부재로 미검증(보고서 정직 고지).
 *
 * 데이터 안전: dev_master 본인 connected-main scope + DRY_RUN 고정목록(외부호출 0).
 *  connected-main 은 PM 이 QA 종료 후 PRESTATE 값(SELECTED/BANK/2계좌)으로 복원한다.
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5291'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const LOGIN_ID = process.env['DEV_LOGIN'] ?? 'dev_master'
const PASSWORD = process.env['DEV_PASSWORD'] ?? (process.env.DEV_PASSWORD ?? '')
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/825-s5-r5-liveqa'))
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

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true })
}

async function goto(page: Page, route: string): Promise<void> {
  await page.goto(`${BASE_URL}/#${route}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('MASTER').first()).toBeVisible({ timeout: 25000 })
  await page.waitForTimeout(1500)
}

async function resetCodefScopeToUnset(page: Page): Promise<void> {
  const hint = page.getByTestId('codef-scope-hint')
  if (await hint.count() > 0) {
    await expect(hint).toBeVisible({ timeout: 15000 })
    return
  }
  const allChip = page.getByTestId('codef-all-scope-chip')
  await allChip.click()
  await expect(allChip.locator('[role="button"]')).toHaveAttribute('aria-pressed', 'true', { timeout: 10000 })
  await allChip.getByRole('button', { name: '전체 범위 제거' }).click()
  await expect(hint).toBeVisible({ timeout: 15000 })
}

function fetchedFrom(text: string): number {
  const m = text.replace(/\s+/g, ' ').match(/조회 ([\d,]+)건/)
  return m ? Number(m[1].replace(/,/g, '')) : -1
}

test.describe.serial('#825 슬5 R5 — HIGH-1 라이브 GUI', () => {
  test.beforeEach(async ({ page }) => {
    const login = await realLogin(page, LOGIN_ID)
    expect(login.token, '토큰 없음').toBeTruthy()
    await installAuthStub(page, login)
  })

  test('A · 정상경로 무회귀 — 저장 {ALL,CARD} → 가져오기 조회 15(전체 45 아님) + 드롭다운 활성', async ({ page }) => {
    await goto(page, '/accounting/bank-transactions')
    await resetCodefScopeToUnset(page)

    // S1 — 칩0 잠금
    await expect(page.getByTestId('codef-scope-hint')).toBeVisible({ timeout: 15000 })
    await shot(page, 'a1-chip0-locked')

    // check#3(부분) — 유형 드롭다운은 canUpdate=true(master) 에서 활성
    const typeSelect = page.getByTestId('codef-import-type')
    await expect(typeSelect).toBeEnabled()
    // S2 — 유형=카드 선택
    await typeSelect.selectOption('CARD')
    await expect(typeSelect).toHaveValue('CARD')
    await shot(page, 'a2-type-card-dropdown-enabled')

    // S3 — '전체' 칩 → scopeMode=ALL (개별 체크박스 비활성) → 저장 {ALL, CARD}
    await page.getByTestId('codef-all-scope-chip').click()
    const saveBtn = page.getByTestId('codef-save-scope-button')
    await expect(saveBtn).toBeEnabled()
    await saveBtn.click()
    await expect(page.getByTestId('bank-transaction-toast')).toBeVisible({ timeout: 10000 })
    await shot(page, 'a3-saved-all-card-toast')

    // S4 — 재진입: 저장 {ALL, CARD} 복원(유형 드롭다운=카드, 전체 칩 눌림)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByText('MASTER').first()).toBeVisible({ timeout: 25000 })
    await page.waitForTimeout(2500)
    await expect(page.getByTestId('codef-import-type')).toHaveValue('CARD')
    await expect(page.getByTestId('codef-all-scope-chip').locator('[role="button"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('codef-scope-hint')).toHaveCount(0)
    await shot(page, 'a4-reload-restored-all-card')

    // S5 — 정상 가져오기(FE 가 저장값 type=CARD, scopeMode=ALL 전송) → 조회 15 (CARD 만, 45 아님)
    await page.getByTestId('codef-import-from').fill('2026-06-11')
    await page.getByTestId('codef-import-to').fill('2026-06-11')
    await expect(page.getByTestId('codef-import-button')).toBeEnabled()
    await page.getByTestId('codef-import-button').click()
    const result = page.getByTestId('codef-import-result')
    await expect(result).toBeVisible({ timeout: 20000 })
    await expect(page.getByTestId('bank-transaction-toast')).toContainText('거래내역 가져오기 완료', { timeout: 20000 })
    const cardText = (await result.innerText()).replace(/\s+/g, ' ').trim()
    const cardFetched = fetchedFrom(cardText)
    console.log(`[A] 저장 CARD 정상 가져오기 결과: "${cardText}" → fetched=${cardFetched}`)
    await shot(page, 'a5-card-import-result-15')
    expect(cardFetched, `CARD scope 정상경로 조회건수가 15 아님(=${cardFetched}). 45 면 확대 회귀`).toBe(15)
  })

  test('B · 대조 — 저장 {ALL,ALL} → 가져오기 조회 45 (같은 UI 에서 15 vs 45 시각 대조)', async ({ page }) => {
    await goto(page, '/accounting/bank-transactions')
    await resetCodefScopeToUnset(page)

    // 유형=전체 + '전체' 칩 → 저장 {ALL, ALL}
    await page.getByTestId('codef-import-type').selectOption('ALL')
    await page.getByTestId('codef-all-scope-chip').click()
    await expect(page.getByTestId('codef-save-scope-button')).toBeEnabled()
    await page.getByTestId('codef-save-scope-button').click()
    await expect(page.getByTestId('bank-transaction-toast')).toBeVisible({ timeout: 10000 })
    await page.waitForTimeout(3500)

    // 가져오기 → 조회 45
    await page.getByTestId('codef-import-from').fill('2026-06-12')
    await page.getByTestId('codef-import-to').fill('2026-06-12')
    await expect(page.getByTestId('codef-import-button')).toBeEnabled()
    await page.getByTestId('codef-import-button').click()
    const result = page.getByTestId('codef-import-result')
    await expect(result).toBeVisible({ timeout: 20000 })
    await expect(page.getByTestId('bank-transaction-toast')).toContainText('거래내역 가져오기 완료', { timeout: 20000 })
    const allText = (await result.innerText()).replace(/\s+/g, ' ').trim()
    const allFetched = fetchedFrom(allText)
    console.log(`[B] 저장 ALL 가져오기 결과: "${allText}" → fetched=${allFetched}`)
    await shot(page, 'b1-all-import-result-45')
    expect(allFetched, `ALL scope 조회건수가 45 아님(=${allFetched})`).toBe(45)
  })
})
