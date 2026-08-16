import { expect, test, type Page } from '@playwright/test'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const baseUrl = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5173'
const apiBase = process.env['API_BASE'] ?? 'http://127.0.0.1:8080'
const slipDate = process.env['DAILY_CLOSING_QA_DATE'] ?? '2026-08-14'
const shots = path.resolve(here, '../../../../docs/qa/1250-daily-closing-amount-real-qa')
fs.mkdirSync(shots, { recursive: true })

test('1250 일마감 금액 계약 라이브 화면을 읽기 전용으로 검증한다', async ({ page }) => {
  const login = await page.request.post(`${apiBase}/auth/login`, {
    data: { loginId: 'dev_master', password: resolveQaCredential('QA_DEV_DEFAULT_PASSWORD') },
  })
  expect(login.ok(), `로그인 실패 ${login.status()}`).toBeTruthy()
  const loginData = (await login.json()).data ?? {}
  const token = loginData.token ?? ''
  await page.addInitScript(({ token, role, userId, displayName }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: { getToken: async () => ({ token, userId, role, fullName: displayName }), setToken: async () => undefined, clearToken: async () => undefined },
    })
  }, { token, role: loginData.role ?? '', userId: loginData.userId ?? '', displayName: loginData.displayName ?? 'dev_master' })

  const response = await page.request.get(`${apiBase}/slips/query/daily-closing?slipDate=${slipDate}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(response.ok(), `원본행 조회 실패 ${response.status()}`).toBeTruthy()
  const backendRows = ((await response.json()).data ?? []).filter((row: { isDeleted?: boolean }) => !row.isDeleted)

  await page.goto(`${baseUrl}/#/accounting/daily-closings`)
  const loginIdInput = page.getByLabel(/사용자 ID/)
  if (await loginIdInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await loginIdInput.fill('dev_master')
    await page.getByLabel(/비밀번호/).fill(resolveQaCredential('QA_DEV_DEFAULT_PASSWORD'))
    await page.getByRole('button', { name: /로그인/ }).click()
  }
  await page.getByTestId('daily-closing-filter-date').fill(slipDate)
  await page.waitForLoadState('networkidle')
  const resultTab = page.getByRole('tab', { name: '결과' })
  await expect(resultTab).toBeVisible()
  await resultTab.click()
  const table = page.getByTestId('daily-closing-table')
  await expect(table).toBeVisible()
  await expect(page.getByTestId('daily-closing-nav')).toBeVisible()
  const visibleRows = await table.locator('tbody > tr[data-testid^="daily-closing-data-row-"]').count()
  expect(visibleRows).toBe(backendRows.length)
  await page.screenshot({ path: path.join(shots, '01-daily-closing-amount-before-real-qa.png'), fullPage: true })
  fs.writeFileSync(path.join(shots, 'README.md'), [
    '# PR #1250 일마감 금액 라이브 QA',
    '',
    `- 해시 라우터: ${baseUrl}/#/accounting/daily-closings`,
    `- 날짜: ${slipDate}`,
    `- 화면 행 수: ${visibleRows}`,
    `- 백엔드 응답 건수(삭제행 제외): ${backendRows.length}`,
    '- 증명 요소: daily-closing-nav, 결과 탭, daily-closing-table',
    '- 저장/편집 요청은 보내지 않았다.',
    `- 캡처: 01-daily-closing-amount-before-real-qa.png (${fs.statSync(path.join(shots, '01-daily-closing-amount-before-real-qa.png')).size} bytes)`,
  ].join('\n'), 'utf8')
})
