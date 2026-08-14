import { chromium } from '../../../clients/desktop/node_modules/playwright/index.mjs'
import { resolveQaCredential } from '../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../../../scripts/lib/qa-shots-dir.mjs'
import fs from 'node:fs'
import path from 'node:path'

const app = 'http://127.0.0.1:5299'
const gateway = 'http://127.0.0.1:8080'
const output = resolveQaShotsDir(path.resolve('docs/qa/pr-1210-qr-scan-live'))

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Users/user/AppData/Local/ms-playwright/chromium-1217/chrome-win64/chrome.exe',
})
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'ko-KR' })
const login = await context.request.post(`${gateway}/auth/login`, {
  data: { loginId: 'dev_warehouse', password: resolveQaCredential('QA_DEV_DEFAULT_PASSWORD') },
})
if (!login.ok()) throw new Error(`login failed: ${login.status()}`)
const loginData = (await login.json()).data ?? {}
const token = String(loginData.token ?? '')
const userId = String(loginData.userId ?? '')
const groups = (loginData.groups ?? []).map((group) => String(group.id ?? '')).filter(Boolean)
await context.addCookies([{ name: 'access_token', value: token, domain: '127.0.0.1', path: '/' }])
await context.addCookies([{ name: 'access_token', value: token, domain: 'localhost', path: '/' }])

await context.addInitScript(({ token: authToken, userId: uid, role, name, groups: groupIds }) => {
  Object.defineProperty(window, 'samhanAuth', { configurable: true, value: {
    getToken: async () => ({ token: authToken, userId: uid, role, fullName: name, partnerCode: null,
      groups: groupIds.map((id) => ({ id, name: id, builtin: true })) }),
    setToken: async () => undefined,
    clearToken: async () => undefined,
  } })
}, { token, userId, role: String(loginData.role ?? ''), name: String(loginData.displayName ?? ''), groups })

await context.route(`${gateway}/**`, async (route) => {
  await route.continue({ headers: { ...route.request().headers(), Authorization: `Bearer ${token}` } })
})
await context.route('http://localhost:8080/**', async (route) => {
  await route.continue({ headers: { ...route.request().headers(), Authorization: `Bearer ${token}` } })
})
// 이번 UI 캡처와 무관한 선택적 프론트 로그 sink가 401이면 공통 interceptor가 세션을 지운다.
await context.route('**/logs/front', async (route) => {
  await route.fulfill({ status: 204, body: '' })
})
const page = await context.newPage()
const responses = []
const consoleErrors = []
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
page.on('response', (response) => {
  if (response.status() === 401) responses.push({ url: response.url(), status: 401 })
  if (response.url().includes('/slips/scan-context/by-number') || response.url().includes('/inventory/instances/scan/outbound')) {
    responses.push({ url: response.url(), status: response.status() })
  }
})
await page.goto(`${app}/#/sales/by-number?slipNo=${encodeURIComponent('2026/08/08-37')}`, { waitUntil: 'domcontentloaded' })
await page.getByRole('heading', { name: /출고전표/ }).waitFor({ state: 'visible', timeout: 15000 })
await page.waitForTimeout(1000)
const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim()
await page.screenshot({ path: path.join(output, '01-warehouse-outbound-scan-context.png'), fullPage: true })
await page.locator('input[aria-label="출고 QR 스캔 입력"]').fill('SI-GETJDE AWR-WG00N')
await page.getByRole('button', { name: '스캔', exact: true }).click()
const confirmResponse = page.waitForResponse((response) =>
  response.url().includes('/inventory/instances/scan/outbound'), { timeout: 15000 })
await page.getByRole('button', { name: '전체 출고 확정', exact: true }).click()
const confirmed = await confirmResponse
responses.push({ url: confirmed.url(), status: confirmed.status() })
await page.waitForTimeout(500)
await page.screenshot({ path: path.join(output, '02-warehouse-outbound-scan-confirmed.png'), fullPage: true })
fs.writeFileSync(path.join(output, 'observation.txt'), [
  `login=${login.status()} role=${loginData.role ?? ''}`,
  `url=${page.url()}`,
  `responses=${JSON.stringify(responses)}`,
  `auth=${JSON.stringify(await page.evaluate(async () => ({ hasAuth: typeof window.samhanAuth, token: await window.samhanAuth?.getToken?.() })) )}`,
  `consoleErrors=${JSON.stringify(consoleErrors)}`,
  `body=${body.slice(0, 3000)}`,
].join('\n'), 'utf8')
await browser.close()
