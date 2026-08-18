import { expect, test } from '@playwright/test'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5517'
const SHOTS = resolveQaShotsDir(path.resolve(here, '../../../../docs/qa/1250-luna-real-qa'))
fs.mkdirSync(SHOTS, { recursive: true })

async function openReadOnly(page: import('@playwright/test').Page, route: string, proof: string) {
  const loginResponse = await page.request.post('http://127.0.0.1:8080/auth/login', {
    data: {
      loginId: resolveQaCredential('QA_DEV_MANAGER_LOGIN_ID'),
      password: resolveQaCredential('QA_DEV_MANAGER_PASSWORD'),
    },
  })
  expect(loginResponse.ok()).toBeTruthy()
  const loginData = (await loginResponse.json()).data
  await page.addInitScript(({ token, userId, role, displayName }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: { getToken: async () => ({ token, userId, role, fullName: displayName }), setToken: async () => undefined, clearToken: async () => undefined },
    })
  }, { token: loginData.token, userId: loginData.userId, role: loginData.role, displayName: loginData.displayName })
  await page.goto(`${BASE_URL}/#${route}`)
  const login = page.getByLabel('사용자 ID (필수)')
  if (await login.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await login.fill(resolveQaCredential('QA_DEV_MANAGER_LOGIN_ID'))
    await page.getByLabel('비밀번호 (필수)').fill(resolveQaCredential('QA_DEV_MANAGER_PASSWORD'))
    await page.getByRole('button', { name: /^로그인$/ }).click()
  }
  await expect(page.getByTestId(proof)).toBeVisible({ timeout: 60_000 })
}

test('PR 1250 회귀 소비자 거래처원장·전표요약·일마감을 읽기 전용 캡처한다', async ({ page }) => {
  await openReadOnly(page, '/accounting/partner-ledger', 'partner-ledger-aggregate-table')
  await page.screenshot({ path: path.join(SHOTS, '01-partner-ledger-real-qa.png'), fullPage: true })

  await openReadOnly(page, '/accounting/reports/daily-summary', 'accounting-daily-summary-table')
  await page.screenshot({ path: path.join(SHOTS, '02-daily-summary-real-qa.png'), fullPage: true })

  await openReadOnly(page, '/accounting/daily-closings', 'daily-closing-nav')
  await page.screenshot({ path: path.join(SHOTS, '03-daily-closing-real-qa.png'), fullPage: true })

  fs.writeFileSync(path.join(SHOTS, 'README.md'), [
    '# PR #1250 LUNA round fix 실제 QA',
    '',
    `- base: ${BASE_URL}`,
    '- 해시 라우터: 거래처원장, 일계표(전표요약 소비자), 일마감',
    '- 직원 계정: QA_DEV_MANAGER_* 자격으로 로그인',
    '- 각 화면 고유 증명 요소: partner-ledger-aggregate-table, accounting-daily-summary-table, daily-closing-nav',
    '- 읽기 전용 캡처만 수행했으며 공유 실데이터에 write를 남기지 않았다.',
  ].join('\n'), 'utf8')
})
