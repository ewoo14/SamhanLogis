/**
 * PR #926 (#902) 라운드 fix 2 라이브QA — 금액 칸 입력 회귀 해소 확인.
 *
 * 개발책임자가 직접 발견한 회귀("공급가액·부가세는 왜 수정이 안되지?")를
 * 실서버 실화면에서 재측정한다. 저장(POST)은 하지 않는다.
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

async function login(page: Page): Promise<void> {
  const res = await page.request.post(`${API_BASE}/auth/login`, { data: { loginId: 'dev_master', password: PASSWORD } })
  expect(res.ok(), `로그인 실패: HTTP ${res.status()}`).toBeTruthy()
  const d = (await res.json()).data ?? {}
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
    { tok: d.token ?? '', r: d.role ?? '', uid: d.userId ?? '', name: d.displayName ?? 'dev_master' },
  )
}

test('금액 칸(단가·공급가액·부가세·합계)에 입력한 값이 화면에 남는다', async ({ page }) => {
  await login(page)
  await page.goto(`${BASE_URL}/sales/new`)
  await page.getByLabel('라인 1 수량').waitFor({ state: 'visible', timeout: 30000 })
  await page.waitForTimeout(1500)

  const labels = ['라인 1 단가', '라인 1 공급가액', '라인 1 부가세', '라인 1 합계(VAT포함)']
  for (const label of labels) {
    const el = page.getByLabel(label).first()
    await el.fill('12345')
    await page.waitForTimeout(350)
    const after = await el.inputValue()
    // eslint-disable-next-line no-console
    console.log(`[${label}] '12345' 입력 후 = "${after}"`)
    expect(after, `${label} 입력값이 화면에 남아야 한다`).toBe('12,345')
  }

  // 수량 정수 게이트 — 소수·음수·지수 표기는 받아들이지 않고 이전 값을 유지한다
  const qty = page.getByLabel('라인 1 수량')
  await qty.fill('3')
  await page.waitForTimeout(250)
  for (const bad of ['2.7', '0.5', '-3', '1e3']) {
    await qty.fill(bad).catch(() => undefined)
    await page.waitForTimeout(250)
    // eslint-disable-next-line no-console
    console.log(`[수량 게이트] '${bad}' 입력 후 = "${await qty.inputValue()}"`)
  }

  await page.screenshot({ path: path.join(SHOTS, '06-amount-inputs-editable.png'), fullPage: false })
  // eslint-disable-next-line no-console
  console.log('[캡처] 06-amount-inputs-editable.png')
})
