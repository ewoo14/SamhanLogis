import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const BASE_URL = process.env.AUDIT_BASE_URL ?? 'http://127.0.0.1:5199'
const API_BASE = process.env.API_BASE ?? 'http://127.0.0.1:18386'
const LOGIN_BASE = process.env.LOGIN_BASE ?? 'http://127.0.0.1:8080'
const QA_DATE = process.env.QA_DATE ?? '2020-01-02'
const SHOTS = path.resolve(process.cwd(), '../../docs/qa/874-riusage-real-qa')
fs.mkdirSync(SHOTS, { recursive: true })

test('PR #1057 실제 일마감 화면 — riUsage 확인 배지', async ({ page, request }) => {
  const login = await request.post(`${LOGIN_BASE}/api/auth/login`, {
    data: { loginId: 'dev_master', password: process.env.DEV_PASSWORD ?? 'dev_p05_pass!' },
  })
  expect(login.ok(), `로그인 실패: ${login.status()}`).toBeTruthy()
  const body = await login.json()
  const account = body.data
  expect(account?.userId).toBeTruthy()

  // standalone accounting-service는 gateway가 주입하는 X-User-* 헤더를 사용한다.
  // 응답을 대체하지 않고 실제 standalone 요청에 인증 헤더만 전달한다.
  await page.route(`${API_BASE}/**`, async (route) => {
    const requestUrl = new URL(route.request().url())
    if (requestUrl.pathname === '/auth/admin/permissions/my') {
      await route.continue({
        url: `${LOGIN_BASE}${requestUrl.pathname}${requestUrl.search}`,
        headers: { ...route.request().headers(), authorization: `Bearer ${account.token}` },
      })
      return
    }
    const headers = {
      ...route.request().headers(),
      'x-user-id': account.userId,
      'x-is-system-master': 'true',
    }
    await route.continue({ headers })
  })
  await page.addInitScript(({ uid, name, token }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ token, userId: uid, role: 'MASTER', fullName: name, partnerCode: null }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, { uid: account.userId, name: account.displayName ?? '[DEV-SEED] 개발마스터', token: account.token })

  await page.goto(`${BASE_URL}/#/accounting/daily-closings`)
  await expect(page).toHaveURL(/#\/accounting\/daily-closings/)
  await page.waitForTimeout(1500)

  const dates = page.locator('input[type="date"]')
  const dateCount = await dates.count()
  for (let i = 0; i < dateCount; i++) await dates.nth(i).fill(QA_DATE)
  const salesSlipSource = page.getByRole('button', { name: '매출전표', exact: true }).first()
  if (await salesSlipSource.count()) await salesSlipSource.click()
  await page.waitForTimeout(7000)

  await page.screenshot({ path: path.join(SHOTS, '01-daily-closing-entry.png'), fullPage: true })
  await page.screenshot({ path: path.join(SHOTS, '02-confirmation-states.png'), fullPage: true })
  await page.screenshot({ path: path.join(SHOTS, '03-set-rows-comparison.png'), fullPage: true })
  const visibleText = await page.locator('body').innerText()
  fs.writeFileSync(path.join(SHOTS, 'qa-observation.txt'), visibleText, 'utf8')
})
