import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const renderer = 'http://localhost:5299'
const gateway = 'http://localhost:8080'
const slipId = 'f9955d73-45e6-4116-b46c-c10151dcf6c9'
const qaDir = path.resolve('../../docs/qa/874-riusage-r62-real-qa')
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
const login = await context.request.post(`${gateway}/api/auth/login`, { data: { loginId: 'dev_master', password: 'dev_p05_pass!' } })
console.log(`LOGIN dev_master ${login.status()} ${login.ok()}`)
const account = (await login.json()).data
if (!account?.token) throw new Error('dev_dispatch login missing token')
await context.addInitScript(({ token, userId, displayName }) => {
  Object.defineProperty(window, 'samhanAuth', { configurable: true, value: {
    getToken: async () => ({ token, userId, role: 'MASTER', fullName: displayName, partnerCode: null }),
    setToken: async () => undefined, clearToken: async () => undefined,
  } })
}, { token: account.token, userId: account.userId, displayName: account.displayName ?? '개발배차' })
const page = await context.newPage()
page.on('pageerror', e => console.log(`PAGE_ERROR ${e.message}`))
await page.goto(`${renderer}/#/sales/${slipId}`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)
const body = await page.locator('body').innerText()
console.log(body.slice(-8000))
console.log(`BUTTONS ${JSON.stringify(await page.locator('button').allTextContents())}`)
await page.screenshot({ path: path.join(qaDir, '11-dispatch-confirm-screen-before-action.png'), fullPage: true })
fs.writeFileSync(path.join(qaDir, '11-dispatch-confirm-screen-before-action.txt'), body, 'utf8')
const accept = page.getByRole('button', { name: '완료 (수락)', exact: true })
if (await accept.count()) {
  const responsePromise = page.waitForResponse(response => ['POST', 'PATCH', 'PUT'].includes(response.request().method()) && response.url().includes('/slips'), { timeout: 15000 }).catch(() => null)
  await accept.click()
  const response = await responsePromise
  await page.waitForTimeout(2500)
  const after = await page.locator('body').innerText()
  console.log(`ACCEPT_RESPONSE ${response ? `${response.status()} ${response.url()} ${(await response.text()).slice(0, 5000)}` : 'NO_RESPONSE'}`)
  console.log(`AFTER_ACCEPT ${after.slice(-4500)}`)
  await page.screenshot({ path: path.join(qaDir, '12-sales-slip-after-accept.png'), fullPage: true })
  fs.writeFileSync(path.join(qaDir, '12-sales-slip-after-accept.txt'), after, 'utf8')
}
await browser.close()
