import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
/**
 * PR #926 (#902) 라운드 fix 2 라이브QA — 금액 칸 입력 회귀 해소 확인.
 *
 * 개발책임자가 직접 발견한 회귀("공급가액·부가세는 왜 수정이 안되지?")를
 * 실서버 실화면에서 재측정한다. 저장(POST)은 하지 않는다.
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['QA_BASE_URL'] ?? 'http://127.0.0.1:5252'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
// 기본값은 커밋된 docs/qa/902-slip-line-ecount/ 가 아니라 그 밑 _local/ (gitignore 대상) —
// 재실행이 커밋된 증거를 덮어쓰지 않는다. QA_SHOTS_DIR 로 의도적 승격만 opt-in.
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/902-slip-line-ecount'))

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

test('금액 칸은 유효한 값만 표시하고 잘못된 입력을 재조합하지 않으며 합계는 읽기 전용이다', async ({ page }) => {
  await login(page)
  await page.goto(`${BASE_URL}/sales/new`)
  await page.getByLabel('라인 1 수량').waitFor({ state: 'visible', timeout: 30000 })
  await page.waitForTimeout(1500)

  const labels = ['라인 1 단가', '라인 1 공급가액', '라인 1 부가세']
  for (const label of labels) {
    const el = page.getByLabel(label).first()
    await el.fill('12345')
    await page.waitForTimeout(350)
    const after = await el.inputValue()
    // eslint-disable-next-line no-console
    console.log(`[${label}] '12345' 입력 후 = "${after}"`)
    expect(after, `${label} 입력값이 화면에 남아야 한다`).toBe('12,345')

    for (const bad of ['2.7', '-3', '1e3', '1,,2']) {
      await el.fill(bad).catch(() => undefined)
      await page.waitForTimeout(250)
      const rejected = await el.inputValue()
      // eslint-disable-next-line no-console
      console.log(`[${label} 금액 게이트] '${bad}' 입력 후 = "${rejected}"`)
      expect(rejected, `${label}의 잘못된 입력 '${bad}'은 재조합하지 않고 이전 값을 유지해야 한다`).toBe('12,345')
    }
  }

  const total = page.getByLabel('라인 1 합계(VAT포함)').first()
  await expect(total, '합계는 입력 요소가 아닌 읽기 전용 표시여야 한다').not.toHaveJSProperty('tagName', 'INPUT')
  await expect(total, '합계는 공급가액+부가세 파생값을 표시해야 한다').toHaveText('24,690')
  // eslint-disable-next-line no-console
  console.log(`[라인 1 합계(VAT포함)] read-only 표시값 = "${(await total.innerText()).trim()}"`)

  // 수량 정수 게이트 — 소수·음수·지수 표기는 받아들이지 않고 이전 값을 유지한다
  const qty = page.getByLabel('라인 1 수량')
  await qty.fill('3')
  await page.waitForTimeout(250)
  for (const bad of ['2.7', '-3', '1e3', '1,,2']) {
    await qty.fill(bad).catch(() => undefined)
    await page.waitForTimeout(250)
    expect(await qty.inputValue(), `수량의 잘못된 입력 '${bad}'은 재조합하지 않고 이전 값을 유지해야 한다`).toBe('3')
    // eslint-disable-next-line no-console
    console.log(`[수량 게이트] '${bad}' 입력 후 = "${await qty.inputValue()}"`)
  }

  await page.screenshot({ path: path.join(SHOTS, '06-amount-inputs-editable.png'), fullPage: false })
  // eslint-disable-next-line no-console
  console.log('[캡처] 06-amount-inputs-editable.png')
})
