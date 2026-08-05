import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const renderer = 'http://localhost:5299'
const gateway = 'http://localhost:8080'
const slipId = 'f9955d73-45e6-4116-b46c-c10151dcf6c9'
const qaDir = path.resolve('../../docs/qa/874-riusage-r62-real-qa')
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
const login = await context.request.post(`${gateway}/api/auth/login`, { data: { loginId: 'dev_manager', password: 'dev_p05_pass!' } })
const account = (await login.json()).data
await context.addInitScript(({ token, userId, displayName }) => {
  Object.defineProperty(window, 'samhanAuth', { configurable: true, value: {
    getToken: async () => ({ token, userId, role: 'MANAGER', fullName: displayName, partnerCode: null }),
    setToken: async () => undefined, clearToken: async () => undefined,
  } })
}, { token: account.token, userId: account.userId, displayName: account.displayName ?? '개발매니저' })
const page = await context.newPage()
page.on('pageerror', e => console.log(`PAGE_ERROR ${e.message}`))
await page.goto(`${renderer}/#/sales/${slipId}`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)
const initial = await page.locator('body').innerText()
console.log(`URL ${page.url()}`)
console.log(initial.slice(-10000))
console.log(`BUTTONS ${JSON.stringify(await page.locator('button').allTextContents())}`)
await page.screenshot({ path: path.join(qaDir, '08-sales-slip-detail-before-confirm.png'), fullPage: true })
fs.writeFileSync(path.join(qaDir, '08-sales-slip-detail-before-confirm.txt'), initial, 'utf8')
const buttons = page.locator('button')
for (let i = 0; i < await buttons.count(); i++) {
  const label = (await buttons.nth(i).innerText()).trim()
  if (label) console.log(`BUTTON ${i} ${JSON.stringify(label)}`)
}
const action = (await page.getByRole('button', { name: '완료 (저장)', exact: true }).count())
  ? page.getByRole('button', { name: '완료 (저장)', exact: true })
  : page.getByRole('button', { name: '완료 (전송)', exact: true })
if (await action.count()) {
  const actionResponsePromise = page.waitForResponse(response => ['POST', 'PATCH', 'PUT'].includes(response.request().method()) && response.url().includes('/slips'), { timeout: 15000 }).catch(() => null)
  await action.click()
  const actionResponse = await actionResponsePromise
  await page.waitForTimeout(2500)
  const after = await page.locator('body').innerText()
  console.log(`ACTION_RESPONSE ${actionResponse ? `${actionResponse.status()} ${actionResponse.url()} ${(await actionResponse.text()).slice(0, 5000)}` : 'NO_RESPONSE'}`)
  console.log(`AFTER_ACTION ${after.slice(-6000)}`)
  await page.screenshot({ path: path.join(qaDir, '09-sales-slip-after-complete-action.png'), fullPage: true })
  fs.writeFileSync(path.join(qaDir, '09-sales-slip-after-complete-action.txt'), after, 'utf8')
  const send = page.getByRole('button', { name: '완료 (전송)', exact: true })
  if ((await send.count()) && (await action.innerText()) !== '완료 (전송)') {
    const sendResponsePromise = page.waitForResponse(response => ['POST', 'PATCH', 'PUT'].includes(response.request().method()) && response.url().includes('/slips'), { timeout: 15000 }).catch(() => null)
    await send.click()
    const sendResponse = await sendResponsePromise
    await page.waitForTimeout(2500)
    const afterSend = await page.locator('body').innerText()
    console.log(`SEND_RESPONSE ${sendResponse ? `${sendResponse.status()} ${sendResponse.url()} ${(await sendResponse.text()).slice(0, 5000)}` : 'NO_RESPONSE'}`)
    console.log(`AFTER_SEND ${afterSend.slice(-5000)}`)
    await page.screenshot({ path: path.join(qaDir, '10-sales-slip-after-send.png'), fullPage: true })
    fs.writeFileSync(path.join(qaDir, '10-sales-slip-after-send.txt'), afterSend, 'utf8')
  }
}
await browser.close()
