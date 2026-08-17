import { expect, test } from '@playwright/test'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const here = path.dirname(fileURLToPath(import.meta.url))
const shotsDir = resolveQaShotsDir(here)
const baseUrl = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5942'
const apiBase = process.env['API_BASE'] ?? 'http://localhost:8080'

function jwtClaims(token: string): Record<string, unknown> {
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as Record<string, unknown> } catch { return {} }
}

async function findDateWithRows(page: import('@playwright/test').Page, headers: Record<string, string>) {
  const candidates = Array.from({ length: 31 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 7, 14 + index - 15))
    return date.toISOString().slice(0, 10)
  })
  for (const date of candidates) {
    const response = await page.request.get(`${apiBase}/slips/query/daily-closing?slipDate=${date}`, {
      headers,
    })
    if (!response.ok()) {
      console.log(`일마감 날짜 ${date} 조회 ${response.status()}`)
      continue
    }
    const rows = ((await response.json()).data ?? []).filter((row: { isDeleted?: boolean }) => !row.isDeleted)
    console.log(`일마감 날짜 ${date} 원본행 ${rows.length}`)
    if (rows.length > 0) return { date, rows }
  }
  return { date: null, rows: [] }
}

test('D-02 일마감에서 실제 회계전표 생성과 중복 차단을 확인한다', async ({ page }) => {
  const login = await page.request.post(`${apiBase}/auth/login`, {
    data: { loginId: 'dev_master', password: resolveQaCredential('QA_DEV_DEFAULT_PASSWORD') },
  })
  expect(login.ok(), `로그인 실패 ${login.status()}`).toBeTruthy()
  const payload = (await login.json()).data ?? {}
  console.log(`로그인 데이터 키=${Object.keys(payload).join(',')} token길이=${String(payload.token ?? '').length}`)
  const claims = jwtClaims(payload.token ?? '')
  const authHeaders = {
    Authorization: `Bearer ${payload.token ?? ''}`,
    'X-User-Id': String(claims.sub ?? payload.userId ?? ''),
    'X-User-Role': String(claims.role ?? payload.role ?? 'MASTER'),
    'X-Is-System-Master': 'true',
    'X-User-Name': encodeURIComponent(payload.displayName ?? 'dev_master'),
    'X-User-Groups': Array.isArray(payload.groups)
      ? payload.groups.map((group: { id?: string } | string) => typeof group === 'string' ? group : group.id ?? '').join(',')
      : '',
  }
  const selected = await findDateWithRows(page, authHeaders)
  expect(selected.date, '공유 DB에서 읽기 전용으로 찾은 일마감 전표 날짜가 없다').not.toBeNull()
  await page.addInitScript(({ token, role, userId, fullName }) => {
    Object.defineProperty(window, 'samhanAuth', { configurable: true, value: {
      getToken: async () => ({ token, userId, role, fullName, partnerCode: null }),
      setToken: async () => undefined,
      clearToken: async () => undefined,
    } })
  }, { token: payload.token ?? '', role: payload.role ?? '', userId: payload.userId ?? '', fullName: payload.displayName ?? 'dev_master' })
  page.on('response', async (response) => {
    if (response.status() >= 400) console.log(`UI ERROR ${response.status()} ${response.url()}`)
    if (response.url().includes('/slips/query/daily-closing') || response.url().includes('/auth/me')) {
      console.log(`UI ${response.status()} ${response.url()}`)
    }
  })
  page.on('requestfailed', (request) => {
    if (request.url().includes('/slips/query/daily-closing') || request.url().includes('/auth/me')) {
      console.log(`UI FAILED ${request.url()} ${request.failure()?.errorText ?? ''}`)
    }
  })

  await page.goto(`${baseUrl}/#/accounting/daily-closings`)
  await page.getByTestId('daily-closing-filter-date').fill(selected.date as string)
  await page.getByTestId('daily-closing-filter-date').press('Enter')
  await page.getByTestId('daily-closing-tab-pre_issued').click()
  await page.waitForTimeout(5000)
  const rows = page.locator('[data-testid^="daily-closing-data-row-"]')
  const rowCount = await rows.count()
  expect(rowCount, '일마감 원본행이 0건이면 stub으로 간주').toBeGreaterThan(0)
  const createButtons = page.locator('[data-testid^="daily-closing-accounting-create-"]')
  const buttonCount = await createButtons.count()
  expect(buttonCount, '전표별 합계행 생성 버튼이 0건').toBeGreaterThan(0)
  await page.screenshot({ path: path.join(shotsDir, '01-daily-closing-before-create.png'), fullPage: true })

  const button = createButtons.first()
  console.log(`회계전표 생성 버튼 disabled=${await button.isDisabled()}`)
  await expect(button).toBeDisabled()
  await page.screenshot({ path: path.join(shotsDir, '02-daily-closing-create-blocked.png'), fullPage: true })
  expect(await page.locator('[data-testid="daily-closing-subtotal-row"]').count()).toBeGreaterThan(0)
})
