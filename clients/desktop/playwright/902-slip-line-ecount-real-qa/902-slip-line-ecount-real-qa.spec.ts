/**
 * PR #926 (#902) 라이브QA — 전표 품목 입력 이카운트 방식 · U-gate.
 *
 * U-gate 한 문장:
 *   창고 담당자가 품목 5개를 연속 입력할 때 '행 추가'를 한 번도 누르지 않고 끝낼 수 있고,
 *   수량을 비워 둔 행이 있으면 저장을 누르기 전에 그 행이 전표에 안 들어간다는 것을
 *   화면에서 알 수 있다.
 *
 * 실서버 전용(mock OFF). 렌더러는 vite.web.config.ts dev 서버(BrowserRouter)이므로
 * 해시 라우팅을 쓰지 않는다.
 *
 * 🚫 저장(POST)은 하지 않는다 — 실 전표를 만들지 않는다. 화면 상태만 측정한다.
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['QA_BASE_URL'] ?? 'http://127.0.0.1:5252'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const SHOTS = path.resolve(_dirname, '../../../../docs/qa/902-slip-line-ecount')
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

async function capture(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false })
  // eslint-disable-next-line no-console
  console.log(`[캡처] ${name}.png`)
}

async function rowCount(page: Page): Promise<number> {
  return page.locator('[aria-label$="수량"]').count()
}

async function noticeCount(page: Page): Promise<number> {
  return page.locator('[data-testid$="-incomplete-notice"]').count()
}

test.describe('#902 전표 품목 입력 이카운트 방식 — U-gate', () => {
  test.beforeEach(async ({ page }) => {
    const login = await realLogin(page, 'dev_master')
    await installAuthStub(page, login)
    await page.goto(`${BASE_URL}/sales/new`)
    await page.waitForLoadState('domcontentloaded')
    await page.getByLabel('라인 1 수량').waitFor({ state: 'visible', timeout: 30000 })
    await page.waitForTimeout(1500)
  })

  test('U-gate — 행 추가 버튼을 한 번도 누르지 않고 연속 입력이 되는가', async ({ page }) => {
    // eslint-disable-next-line no-console
    console.log(`[초기] 행 수 = ${await rowCount(page)} / 제외 안내 = ${await noticeCount(page)}`)
    await capture(page, '01-initial-5-rows')

    // 마지막 행부터 연속으로 수량을 입력한다 — '행 추가' 는 한 번도 누르지 않는다.
    for (let i = 0; i < 5; i++) {
      const rows = await rowCount(page)
      const last = page.getByLabel(`라인 ${rows} 수량`)
      await last.fill(String(i + 2))
      await page.waitForTimeout(700)
      // eslint-disable-next-line no-console
      console.log(`[연속입력 ${i + 1}회] 라인 ${rows} 에 입력 → 행 수 = ${await rowCount(page)}`)
    }
    // '행 추가' 버튼을 누른 적이 없음을 명시적으로 남긴다
    // eslint-disable-next-line no-console
    console.log(`[U-gate] '행 추가' 클릭 0회 / 최종 행 수 = ${await rowCount(page)} / 제외 안내 = ${await noticeCount(page)}`)
    await capture(page, '02-after-5-consecutive-inputs')

    const summary = page.locator('[data-testid="slip-form-incomplete-summary"]')
    const summaryText = await summary.first().innerText().catch(() => '(집계 배너 없음)')
    // eslint-disable-next-line no-console
    console.log(`[저장 지점 집계] ${summaryText.replace(/\s+/g, ' ')}`)
  })

  test('입력을 되돌리면 제외 안내도 사라지는가 (D1)', async ({ page }) => {
    const spec = page.getByLabel('라인 2 규격')
    await spec.fill('220V')
    await page.waitForTimeout(600)
    // eslint-disable-next-line no-console
    console.log(`[입력 후] 행 수 = ${await rowCount(page)} / 제외 안내 = ${await noticeCount(page)}`)
    await capture(page, '03-after-spec-input')

    await spec.fill('')
    await page.waitForTimeout(600)
    // eslint-disable-next-line no-console
    console.log(`[원복 후] 행 수 = ${await rowCount(page)} / 제외 안내 = ${await noticeCount(page)}  ← 0 이어야 한다`)
    await capture(page, '04-after-spec-revert')
  })

  test('값이 안 바뀌는 제스처는 행을 늘리지도 안내를 켜지도 않는가 (D2)', async ({ page }) => {
    const rows = await rowCount(page)
    const lastPrice = page.getByLabel(`라인 ${rows} 단가`)
    const before = await lastPrice.inputValue()
    // 단가 셀에서 백스페이스 — 화면 표시는 '0' 그대로다
    await lastPrice.click()
    await lastPrice.press('Backspace')
    await page.waitForTimeout(800)
    // eslint-disable-next-line no-console
    console.log(`[단가 백스페이스] 표시 '${before}' → '${await lastPrice.inputValue()}' / 행 수 ${rows} → ${await rowCount(page)} / 제외 안내 = ${await noticeCount(page)}  ← 행 수 불변·안내 0 이어야 한다`)
    await capture(page, '05-price-backspace-no-growth')
  })
})
