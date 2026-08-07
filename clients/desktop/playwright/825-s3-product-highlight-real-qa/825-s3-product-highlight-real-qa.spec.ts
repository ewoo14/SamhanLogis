import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #825 슬3 — 품목 자동완성 ④ 매치 하이라이트 + D-S3-01(DOM UUID 미노출) 라이브 QA.
 * 실 :8080(mock OFF)·실 품목 검색·dev_master. EstimateItemsCatalogPage(/products/estimate-items) 품목 추가 ProductAutocomplete.
 * 캡처: docs/qa/825-s3-product-highlight/
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5233'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? (process.env.DEV_PASSWORD ?? '')
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/825-s3-product-highlight'))
fs.mkdirSync(SHOTS, { recursive: true })
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

let shotNo = 0
async function capture(page: Page, name: string): Promise<void> {
  shotNo++
  await page.screenshot({ path: path.join(SHOTS, `${String(shotNo).padStart(2, '0')}-${name}.png`), fullPage: false })
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

/** 자동완성 option DOM id·aria-activedescendant에 UUID/업무키 미노출 + opaque -opt-N 형식 단언. */
async function assertNoUuidInDom(page: Page): Promise<void> {
  const ids = await page.locator('li[role="option"]').evaluateAll((els) => els.map((e) => e.id))
  expect(ids.length, 'option 미표시').toBeGreaterThan(0)
  for (const id of ids) {
    expect(id, `option id에 UUID 유출: ${id}`).not.toMatch(UUID_RE)
    expect(id, `option id가 opaque -opt-N 아님: ${id}`).toMatch(/-opt-\d+$/)
  }
  // 키보드 활성화 후 aria-activedescendant 확인
  await page.keyboard.press('ArrowDown')
  const active = await page.locator('input[aria-activedescendant]').first().getAttribute('aria-activedescendant')
  if (active) {
    expect(active, `aria-activedescendant UUID 유출: ${active}`).not.toMatch(UUID_RE)
    expect(active).toMatch(/-opt-\d+$/)
  }
}

test('#825 슬3 — 품목 자동완성 하이라이트 + DOM UUID 미노출 실증(EstimateItemsCatalog)', async ({ page }) => {
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)

  await page.goto(`${BASE_URL}/#/products/estimate-items`)
  await page.waitForTimeout(2500)
  await capture(page, 'estimate-items-initial')

  // 품목 추가 ProductAutocomplete combobox (카테고리 선택 필요 시 첫 카테고리)
  const cat = page.getByRole('tab').first()
  if (await cat.isVisible().catch(() => false)) { await cat.click().catch(() => undefined); await page.waitForTimeout(500) }

  const combo = page.getByRole('combobox').first()
  await expect(combo, 'ProductAutocomplete combobox 미표시').toBeVisible({ timeout: 20_000 })

  // mark 계수는 listbox option 스코프로 한정 — 페이지 전역 mark(무관 요소·표 강조 등)로
  // GREEN 되거나, 한 검색만 강조돼도 합산(mark1+mark2)으로 통과하는 느슨함 제거 (CODEX LOW).
  const optionMarks = page.locator('li[role="option"] mark')

  // 1) productName 검색("삼성") → 품목명 하이라이트 + "품목명" 매치 배지 + DOM UUID 미노출
  await combo.click()
  await combo.fill('삼성')
  await expect(page.locator('li[role="option"]').first(), '품목 후보 미표시').toBeVisible({ timeout: 15_000 })
  // "품목명" 배지 가시화 = "삼성" 결과 렌더 완료 신호 (stale 이전 결과 오계수 방지)
  await expect(
    page.locator('li[role="option"] [aria-label="매치 필드 품목명"]').first(),
    '"삼성" 검색 품목명 매치 배지 미렌더',
  ).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(500)
  const mark1 = await optionMarks.count()
  expect(mark1, '"삼성" 검색 option 내 <mark> 미렌더').toBeGreaterThan(0)
  await capture(page, 'product-name-highlight')
  await assertNoUuidInDom(page)
  console.log('[삼성 mark(option 스코프)]', mark1)

  // 2) modelName 검색("AR") → 모델명 하이라이트 + "모델명" 매치 배지
  await combo.fill('')
  await combo.fill('AR')
  await expect(page.locator('li[role="option"]').first()).toBeVisible({ timeout: 15_000 })
  await expect(
    page.locator('li[role="option"] [aria-label="매치 필드 모델명"]').first(),
    '"AR" 검색 모델명 매치 배지 미렌더',
  ).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(500)
  const mark2 = await optionMarks.count()
  expect(mark2, '"AR" 검색 option 내 <mark> 미렌더').toBeGreaterThan(0)
  await capture(page, 'model-name-highlight')
  await assertNoUuidInDom(page)
  console.log('[AR mark(option 스코프)]', mark2)
})
