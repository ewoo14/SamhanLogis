import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * PR #1027(#1013) 라이브 QA — 배차안내문자 화면의 클립보드 복사 계승.
 * 레거시는 발송 API 를 호출하지 않고 대상·멘트를 클립보드로 복사했고,
 * 실무도 지금 그렇게 돈다(2026-08-01 개발책임자 확인).
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5932'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/1013-clipboard'))
fs.mkdirSync(SHOTS, { recursive: true })

let n = 0
async function capture(page: Page, name: string): Promise<void> {
  n++
  await page.screenshot({ path: path.join(SHOTS, `${String(n).padStart(2, '0')}-${name}.png`), fullPage: true })
}

test('#1013 배차안내문자 — 클립보드 복사 버튼이 화면에 있고 동작한다', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const res = await page.request.post(`${API_BASE}/auth/login`, {
    data: { loginId: 'dev_master', password: PASSWORD },
  })
  expect(res.ok(), `로그인 실패 HTTP ${res.status()}`).toBeTruthy()
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

  await page.goto(`${BASE_URL}/#/arologis/dispatch-sms`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(6000)
  await capture(page, 'dispatch-sms-page')

  // 미리보기를 불러와야 복사 버튼이 나타난다 (preview 조건부 렌더)
  const dateInput = page.getByTestId('dispatch-sms-date')
  await dateInput.fill(process.env['QA_DATE'] ?? '2026-07-16')
  await page.getByTestId('dispatch-sms-preview-button').click()
  await page.waitForTimeout(10000)
  await capture(page, 'after-preview')

  const bodyText = await page.locator('body').innerText()
  fs.writeFileSync(path.join(SHOTS, 'page-text.txt'), bodyText, 'utf8')

  const copyCandidates = page.getByRole('button', { name: /복사|copy/i })
  const copyCount = await copyCandidates.count()
  fs.appendFileSync(path.join(SHOTS, 'page-text.txt'), `\n\n[복사 버튼 개수] ${copyCount}\n`, 'utf8')
  console.log('[COPY BUTTONS]', copyCount)

  if (copyCount > 0) {
    await copyCandidates.first().click()
    await page.waitForTimeout(1500)
    await capture(page, 'after-copy-click')
    const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => '<읽기실패>'))
    fs.appendFileSync(path.join(SHOTS, 'page-text.txt'), `\n[클립보드 내용]\n${clip}\n`, 'utf8')
    console.log('[CLIPBOARD]', JSON.stringify(clip))
  }
})
