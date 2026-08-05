import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const renderer = 'http://localhost:5299'
const gateway = 'http://localhost:8080'
const qaDir = path.resolve('../../docs/qa/874-riusage-r66-real-qa')
fs.mkdirSync(path.join(qaDir, 'screenshots'), { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
const login = await context.request.post(`${gateway}/api/auth/login`, {
  data: { loginId: 'dev_manager', password: 'dev_p05_pass!' },
})
const loginText = await login.text()
console.log(`LOGIN status=${login.status()} body=${loginText.slice(0, 2000)}`)
const loginBody = JSON.parse(loginText)
const account = loginBody.data
if (!account?.token) throw new Error(`login response missing token: ${loginText}`)

const authHeaders = { authorization: `Bearer ${account.token}` }
for (const keyword of ['4348703365', '000011111111']) {
  const response = await context.request.get(`${gateway}/api/v1/partner-dc-configs?keyword=${keyword}&page=0&size=50`, { headers: authHeaders })
  const body = await response.text()
  fs.writeFileSync(path.join(qaDir, `dc-read-${keyword}.txt`), `${response.status()} ${body}`, 'utf8')
  console.log(`DC_READ ${keyword} status=${response.status()} body=${body.slice(0, 8000)}`)
}

await context.addInitScript(({ token, userId, displayName }) => {
  Object.defineProperty(window, 'samhanAuth', {
    configurable: true,
    value: { getToken: async () => ({ token, userId, role: 'MANAGER', fullName: displayName, partnerCode: null }), setToken: async () => undefined, clearToken: async () => undefined },
  })
}, { token: account.token, userId: account.userId, displayName: account.displayName ?? '개발매니저' })

const page = await context.newPage()
const pageErrors = []
page.on('pageerror', error => pageErrors.push(error.message))
page.on('console', message => { if (message.type() === 'error') console.log(`CONSOLE_ERROR ${message.text()}`) })

async function capture(name) {
  const body = await page.locator('body').innerText()
  fs.writeFileSync(path.join(qaDir, `${name}.txt`), body, 'utf8')
  await page.screenshot({ path: path.join(qaDir, 'screenshots', `${name}.png`), fullPage: true })
  console.log(`CAPTURE ${name} url=${page.url()} body=${body.slice(-5000).replace(/\n/g, ' | ')}`)
  return body
}

async function selectWarehouse() {
  const input = page.getByPlaceholder('창고 코드 또는 이름 입력…')
  await input.fill('2')
  await page.waitForTimeout(900)
  const option = page.getByRole('option').filter({ hasText: '상일창고' }).first()
  if (await option.count()) await option.click()
  else { await input.press('ArrowDown'); await input.press('Enter') }
}

async function selectPartner(keyword, expectedText) {
  const input = page.getByPlaceholder('거래처명 또는 코드 입력…')
  await input.fill(keyword)
  await page.waitForTimeout(900)
  console.log(`PARTNER_OPTIONS ${keyword} ${JSON.stringify(await page.locator('[role=listbox], [role=option]').allTextContents())}`)
  const option = page.getByRole('option').filter({ hasText: expectedText }).first()
  if (!(await option.count())) throw new Error(`partner option not found: ${expectedText}`)
  await option.click()
}

async function selectProduct(line, model) {
  const input = page.locator(`input[aria-label="라인 ${line} 품목"]`)
  await input.fill(model)
  await page.waitForTimeout(900)
  console.log(`PRODUCT_OPTIONS ${model} ${JSON.stringify(await page.locator('[role=listbox], [role=option]').allTextContents())}`)
  await input.press('ArrowDown')
  await input.press('Enter')
  await page.waitForTimeout(900)
}

async function saveSlip(label) {
  const responsePromise = page.waitForResponse(response => response.request().method() === 'POST' && response.url().includes('/slips'), { timeout: 20000 }).catch(() => null)
  await page.getByRole('button', { name: '저장', exact: true }).click()
  const response = await responsePromise
  await page.waitForTimeout(1800)
  const responseText = response ? `${response.status()} ${response.url()}\n${await response.text()}` : 'NO_POST_RESPONSE'
  fs.writeFileSync(path.join(qaDir, `${label}-save-response.txt`), responseText, 'utf8')
  console.log(`SAVE_RESPONSE ${label} ${responseText.slice(0, 16000)}`)
  await capture(label)
  return responseText
}

async function openNew() {
  await page.goto(`${renderer}/#/sales/new`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
}

await openNew()
await capture('01-initial')
await selectWarehouse()
await capture('02-warehouse-2-sangil')
await selectPartner('4348703365', '주식회사 엠엠시스템에어')
await capture('03-global-dc-partner-selected')
await selectProduct(1, 'AR09TXEAAWKNEU-04')
await selectProduct(2, 'MCU-S6NDB1N')
await page.locator('input[aria-label="라인 1 수량"]').fill('1')
await page.locator('input[aria-label="라인 2 수량"]').fill('1')
await capture('04-mixed-fixed-and-global-dc-lines')
const mixedSave = await saveSlip('05-mixed-lines-save-result')

await openNew()
await selectWarehouse()
await selectPartner('000011111111', '한울냉열시스템')
await selectProduct(1, 'AR09TXEAAWKNEU-04')
await page.locator('input[aria-label="라인 1 수량"]').fill('1')
await capture('06-no-global-dc-partner-line')
const noGlobalSave = await saveSlip('07-no-global-dc-save-result')

console.log(`SUMMARY mixed=${mixedSave.slice(0, 500)} noGlobal=${noGlobalSave.slice(0, 500)}`)
console.log(`PAGE_ERRORS ${JSON.stringify(pageErrors)}`)
await browser.close()
