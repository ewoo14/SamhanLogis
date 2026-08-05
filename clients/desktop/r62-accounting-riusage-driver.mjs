import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const renderer = 'http://localhost:5299'
const gateway = 'http://localhost:8080'
const qaDir = path.resolve('../../docs/qa/874-riusage-r62-real-qa')
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
const login = await context.request.post(`${gateway}/api/auth/login`, { data: { loginId: 'dev_accountant', password: 'dev_p05_pass!' } })
console.log(`LOGIN dev_accountant ${login.status()} ${login.ok()}`)
const account = (await login.json()).data
await context.addInitScript(({ token, userId, displayName }) => {
  Object.defineProperty(window, 'samhanAuth', { configurable: true, value: {
    getToken: async () => ({ token, userId, role: 'ACCOUNTANT', fullName: displayName, partnerCode: null }),
    setToken: async () => undefined, clearToken: async () => undefined,
  } })
}, { token: account.token, userId: account.userId, displayName: account.displayName ?? '개발회계' })
const page = await context.newPage()
page.on('response', async response => {
  if (['POST', 'PUT', 'PATCH'].includes(response.request().method())) {
    console.log(`MUTATION_RESPONSE ${response.status()} ${response.request().method()} ${response.url()} ${(await response.text().catch(() => '')).slice(0, 3000)}`)
  }
})
const responses = []
page.on('response', async response => {
  if (response.url().includes('daily') || response.url().includes('closing') || response.url().includes('riUsage')) {
    responses.push(`${response.status()} ${response.request().method()} ${response.url()}`)
  }
})
await page.goto(`${renderer}/#/accounting/daily-closings`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)
const dates = page.locator('input[type=date]')
for (let i = 0; i < await dates.count(); i++) await dates.nth(i).fill('2026-08-06')
const source = page.getByRole('button', { name: '매출전표', exact: true }).first()
if (await source.count()) await source.click()
await page.waitForTimeout(2500)
const body = await page.locator('body').innerText()
console.log(`RESPONSES ${JSON.stringify(responses)}`)
console.log(body.slice(-10000))
console.log(`BUTTONS ${JSON.stringify(await page.locator('button').allTextContents())}`)
await page.screenshot({ path: path.join(qaDir, '13-accounting-daily-closing-riusage-blocked.png'), fullPage: true })
fs.writeFileSync(path.join(qaDir, '13-accounting-daily-closing-riusage-blocked.txt'), body, 'utf8')
await page.goto(`${renderer}/#/accounting/sales-slips/new`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3500)
const allocationBody = await page.locator('body').innerText()
console.log(`ALLOCATION_SCREEN ${allocationBody.slice(-9000)}`)
console.log(`ALLOCATION_BUTTONS ${JSON.stringify(await page.locator('button').allTextContents())}`)
const allocationControls = await page.locator('input,select,textarea').evaluateAll(nodes => nodes.map(n => ({ tag: n.tagName, type: n.getAttribute('type'), aria: n.getAttribute('aria-label'), placeholder: n.getAttribute('placeholder'), value: n.value })))
console.log(`ALLOCATION_CONTROLS ${JSON.stringify(allocationControls)}`)
const allocationInputs = page.locator('input')
const partnerCodeInput = allocationInputs.nth(1)
await partnerCodeInput.fill('4348703365')
await partnerCodeInput.press('Tab')
await page.waitForTimeout(1200)
console.log(`ALLOCATION_PARTNER_FILLED ${(await page.locator('body').innerText()).slice(-5000)}`)
const firstAllocation = page.locator('input[type=range]').first()
await firstAllocation.fill('100')
await page.waitForTimeout(800)
console.log(`ALLOCATION_AFTER_RANGE ${(await page.locator('body').innerText()).slice(-3000)}`)
const draftButton = page.getByRole('button', { name: '임시저장', exact: true })
if (await draftButton.count()) {
  const allocationResponsePromise = page.waitForResponse(response => ['POST', 'PUT'].includes(response.request().method()) && response.url().includes('accounting'), { timeout: 15000 }).catch(() => null)
  await draftButton.click()
  const allocationResponse = await allocationResponsePromise
  await page.waitForTimeout(2000)
  console.log(`ALLOCATION_SAVE_RESPONSE ${allocationResponse ? `${allocationResponse.status()} ${allocationResponse.url()} ${(await allocationResponse.text()).slice(0, 5000)}` : 'NO_RESPONSE'}`)
  const afterAllocationSave = await page.locator('body').innerText()
  console.log(`AFTER_ALLOCATION_SAVE ${afterAllocationSave.slice(-5000)}`)
  await page.screenshot({ path: path.join(qaDir, '15-accounting-allocation-save-result.png'), fullPage: true })
  fs.writeFileSync(path.join(qaDir, '15-accounting-allocation-save-result.txt'), afterAllocationSave, 'utf8')
}
await page.screenshot({ path: path.join(qaDir, '14-sales-accounting-allocation-no-confirmed-source.png'), fullPage: true })
fs.writeFileSync(path.join(qaDir, '14-sales-accounting-allocation-no-confirmed-source.txt'), allocationBody, 'utf8')
await browser.close()
