import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { resolveQaShotsDir } from '../../../../scripts/lib/qa-shots-dir.mjs'

const APP = process.env.QA_APP_URL ?? 'http://127.0.0.1:5188'
const GATEWAY = process.env.QA_GATEWAY_URL ?? 'http://127.0.0.1:8080'
const ACCOUNTING = process.env.QA_ACCOUNTING_URL ?? 'http://127.0.0.1:18421'
const OUT = resolveQaShotsDir(path.resolve(process.cwd(), '..', '..', 'docs', 'qa', '1001-partner-ledger-real-qa'))

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1600, height: 1100 } })
const page = await context.newPage()
const login = await page.request.post(`${GATEWAY}/api/auth/login`, {
  data: { loginId: process.env.QA_LOGIN_ID ?? 'dev_master', password: process.env.DEV_PASSWORD ?? (process.env.DEV_PASSWORD ?? '') },
})
if (!login.ok()) throw new Error(`login failed: ${login.status()}`)
const loginData = (await login.json()).data ?? {}
const userId = String(loginData.userId ?? '')
const groups = (loginData.groups ?? []).map((g) => String(g.id ?? '')).filter(Boolean).join(',')
await page.addInitScript(({ token, uid, role, name, userGroups }) => {
  Object.defineProperty(window, 'samhanAuth', { configurable: true, value: {
    getToken: async () => ({ token, userId: uid, role, fullName: name, partnerCode: null, groups: userGroups.map((id) => ({ id, name: id, builtin: true })) }),
    setToken: async () => undefined,
    clearToken: async () => undefined,
  } })
}, {
  token: String(loginData.token ?? ''),
  uid: userId,
  role: String(loginData.role ?? 'MASTER'),
  name: String(loginData.displayName ?? '개발책임자'),
  userGroups: groups ? groups.split(',') : [],
})

// Keep auth/permissions on the real gateway; route only accounting reads to the standalone jar.
await page.route('**/api/v1/**', async (route) => {
  const request = route.request()
  const url = new URL(request.url())
  if (!url.pathname.startsWith('/accounting') && !url.pathname.startsWith('/admin/accounting')) {
    return route.continue()
  }
  const target = `${ACCOUNTING}${url.pathname}${url.search}`
  const headers = { ...request.headers(), 'x-user-id': userId, 'x-user-role': String(loginData.role ?? 'MASTER') }
  if (groups) headers['x-user-groups'] = groups
  await route.continue({ url: target, headers })
})

const shot = async (name) => { await page.screenshot({ path: path.join(OUT, name), fullPage: true }) }
const body = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim()
const setDate = async (testid, value) => { await page.getByTestId(testid).fill(value) }

await page.goto(`${APP}/#/accounting/partner-ledger`, { waitUntil: 'domcontentloaded' })
const updateClose = page.getByRole('button', { name: '닫기', exact: true }).first()
if (await updateClose.isVisible().catch(() => false)) await updateClose.click()
await page.waitForTimeout(500)
await page.getByTestId('partner-ledger-from').fill('2026-02-01')
await page.getByTestId('partner-ledger-to').fill('2026-03-31')
await page.getByTestId('partner-ledger-search').click()
await page.waitForTimeout(3500)
await shot('01-period-query.png')

const targetRow = page.getByTestId('partner-ledger-aggregate-row-P-2026-0017')
await targetRow.click()
await page.waitForTimeout(3500)
await shot('02-selected-detail.png')

const selectedText = await body()
if (!selectedText.includes('P-2026-0017') || !selectedText.includes('원주에어컨공업')) throw new Error('selected partner not visible')
await shot('03-aggregate-detail-amounts.png')
await shot('04-running-balance.png')

await page.getByTestId('partner-ledger-print-button').click()
await page.waitForTimeout(3500)
await page.screenshot({ path: path.join(OUT, '05-print-preview.png'), fullPage: true })

fs.writeFileSync(path.join(OUT, 'qa-observation.txt'), [
  `login=${login.status()} role=${loginData.role ?? ''}`,
  `selected=${selectedText.slice(0, 2000)}`,
  `url=${page.url()}`,
].join('\n'), 'utf8')
await browser.close()
