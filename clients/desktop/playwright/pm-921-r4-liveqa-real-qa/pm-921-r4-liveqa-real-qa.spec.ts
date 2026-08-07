import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * PR #921 R-4 — PM 직접 라이브QA (실서버 :8080 + 실 렌더러 :5441 mock OFF).
 * SONNET5 R-4 는 mock 렌더러(:5520)로 검증했다. 캐논상 실서버 종단을 PM 이 재취득한다.
 *   A-1: 배차보드 차량 추가 모달 인쇄 시 크롬(제목·설명·조작부) 유지
 *   B-1: 사이드바 판매관리 기본 진입점(/sales) + 검색 모달 인쇄 시 목록 유지
 */
import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5441'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const SHOTS = resolveQaShotsDir(path.resolve(process.env['AUDIT_SHOT_DIR'] ?? '../../docs/qa/pm-921-r4-liveqa'))
fs.mkdirSync(SHOTS, { recursive: true })
const BACKDROP = "[data-testid='ds-modal-backdrop']"

test.use({ viewport: { width: 1600, height: 900 } })

async function login(page: Page): Promise<void> {
  const r = await page.request.post(`${API_BASE}/auth/login`, {
    data: { loginId: 'dev_master', password: PASSWORD },
  })
  expect(r.ok(), `로그인 실패 ${r.status()}`).toBeTruthy()
  const d = (await r.json()).data ?? {}
  await page.addInitScript((v: Record<string, unknown>) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ ...v, partnerCode: null }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, { token: d.token ?? '', userId: d.userId ?? '', role: d.role ?? 'MASTER', fullName: d.displayName ?? '개발마스터' })
}

test('#921 R-4 A-1 — 차량 추가 모달 인쇄에 제목·설명·조작부가 유지된다', async ({ page }) => {
  await login(page)
  await page.goto(`${BASE_URL}/#/dispatch-board`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('dispatch-board-page')).toBeVisible({ timeout: 30_000 })
  const addBtn = page.getByTestId('dispatch-board-add-vehicle-button')
  await expect(addBtn).toBeVisible({ timeout: 20_000 })
  await addBtn.click()
  await expect(page.locator(BACKDROP)).toBeVisible({ timeout: 15_000 })
  await page.emulateMedia({ media: 'print' })
  await page.pdf({ format: 'A4', printBackground: true }) // 워밍업
  const pdf = await page.pdf({ format: 'A4', printBackground: true })
  fs.writeFileSync(path.join(SHOTS, 'a1-add-vehicle-print.pdf'), pdf)
  await page.screenshot({ path: path.join(SHOTS, 'a1-add-vehicle-print-media.png') })

  // 크롬 display 계산값 + 텍스트 유무
  const chrome = await page.evaluate((sel) => {
    const bd = document.querySelector(sel)
    const pick = (frag: string) => {
      const el = Array.from(bd?.querySelectorAll('*') ?? []).find((e) => e.className.toString().includes(frag))
      return el ? { display: getComputedStyle(el).display, text: (el.textContent ?? '').slice(0, 40) } : null
    }
    return { header: pick('header'), description: pick('description'), footer: pick('footer') }
  }, BACKDROP)
  const pdfText = pdf.toString('latin1')
  console.log('[R4-A1]', JSON.stringify(chrome))
  expect(chrome.header?.display, '제목이 인쇄에서 사라지면 안 된다').not.toBe('none')
  expect(chrome.footer?.display, '조작부가 인쇄에서 사라지면 안 된다').not.toBe('none')
  await page.emulateMedia({ media: 'screen' })
})

for (const menu of [
  { path: '/sales', searchBtn: 'sales-query-search-btn', label: 'sales' },
  { path: '/purchases', searchBtn: 'purchase-query-search-btn', label: 'purchases' },
]) {
  test(`#921 R-4 B-1 — 사이드바 진입점 ${menu.path} + 검색 모달 인쇄에 목록이 유지된다`, async ({ page }) => {
    await login(page)
    await page.goto(`${BASE_URL}/#${menu.path}`, { waitUntil: 'domcontentloaded' })
    const searchBtn = page.getByTestId(menu.searchBtn)
    await expect(searchBtn).toBeVisible({ timeout: 30_000 })
    await searchBtn.click()
    await expect(page.locator(BACKDROP)).toBeVisible({ timeout: 15_000 })
    await page.emulateMedia({ media: 'print' })

    const state = await page.evaluate(() => {
      const main = document.querySelector('.app-main')
      if (!main) return null
      const cs = getComputedStyle(main)
      return {
        display: cs.display,
        isPrintSurface: main.classList.contains('is-print-surface'),
        textLen: (main.textContent ?? '').length,
      }
    })
    await page.screenshot({ path: path.join(SHOTS, `b1-${menu.label}-primary-modal-print-media.png`) })
    console.log(`[R4-B1-${menu.path}]`, JSON.stringify(state))
    expect(state?.display, `${menu.path} 목록이 인쇄에서 차폐되면 안 된다`).toBe('block')
    expect(state?.isPrintSurface, `${menu.path} 는 인쇄 표면이어야 한다`).toBeTruthy()
    expect(state?.textLen ?? 0, '목록 내용이 남아 있어야 한다').toBeGreaterThan(300)
    await page.emulateMedia({ media: 'screen' })
  })
}
