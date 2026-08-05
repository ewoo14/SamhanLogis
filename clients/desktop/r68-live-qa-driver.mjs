import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const renderer = 'http://localhost:5299'
const gateway = 'http://localhost:8080'
const qaDir = path.resolve('../../docs/qa/874-riusage-r68-real-qa')
const shotDir = path.join(qaDir, 'screenshots')
fs.mkdirSync(shotDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
const login = await context.request.post(`${gateway}/api/auth/login`, {
  data: { loginId: 'dev_manager', password: 'dev_p05_pass!' },
})
const loginText = await login.text()
fs.writeFileSync(path.join(qaDir, 'login-response.txt'), `${login.status()} ${loginText}`, 'utf8')
console.log(`LOGIN ${login.status()} ${loginText.slice(0, 500)}`)
if (!login.ok()) throw new Error(`login failed ${login.status()}`)
const account = JSON.parse(loginText).data
if (!account?.token) throw new Error('missing token')

await context.addInitScript(({ token, userId, displayName }) => {
  Object.defineProperty(window, 'samhanAuth', { configurable: true, value: {
    getToken: async () => ({ token, userId, role: 'MANAGER', fullName: displayName, partnerCode: null }),
    setToken: async () => undefined, clearToken: async () => undefined,
  } })
}, { token: account.token, userId: account.userId, displayName: account.displayName ?? '개발매니저' })

const page = await context.newPage()
const errors = []
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) })
page.on('requestfailed', r => errors.push(`requestfailed: ${r.method()} ${r.url()} :: ${r.failure()?.errorText ?? 'unknown'}`))
page.on('response', async r => {
  if (/recent|price|slips/i.test(r.url())) {
    console.log(`HTTP ${r.status()} ${r.request().method()} ${r.url()}`)
  }
})

async function capture(name) {
  const text = await page.locator('body').innerText()
  fs.writeFileSync(path.join(qaDir, `${name}.txt`), text, 'utf8')
  await page.screenshot({ path: path.join(shotDir, `${name}.png`), fullPage: true })
  console.log(`CAPTURE ${name} url=${page.url()} tail=${text.slice(-1800).replace(/\n/g, ' | ')}`)
  return text
}
async function openNew() {
  await page.goto(`${renderer}/#/sales/new`, { waitUntil: 'domcontentloaded' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
}
async function warehouse() {
  const input = page.getByPlaceholder('창고 코드 또는 이름 입력…')
  await input.fill('2'); await page.waitForTimeout(900)
  console.log(`WAREHOUSE_OPTIONS=${JSON.stringify(await page.locator('[role=listbox], [role=option]').allTextContents())}`)
  const option = page.getByRole('option').filter({ hasText: '상일창고' }).first()
  if (await option.count()) await option.click(); else { await input.press('ArrowDown'); await input.press('Enter') }
  await page.waitForTimeout(500)
  console.log(`WAREHOUSE_VALUE=${await input.inputValue()}`)
}
async function partner(keyword, expected) {
  const input = page.getByPlaceholder('거래처명 또는 코드 입력…')
  await input.fill(keyword); await page.waitForTimeout(1000)
  const option = page.getByRole('option').filter({ hasText: expected }).first()
  console.log(`PARTNER ${keyword} options=${JSON.stringify(await page.locator('[role=listbox], [role=option]').allTextContents())}`)
  if (!(await option.count())) throw new Error(`partner option missing ${expected}`)
  await option.click(); await page.waitForTimeout(700)
}
async function product(line, model) {
  const input = page.locator(`input[aria-label="라인 ${line} 품목"]`)
  await input.fill(model); await page.waitForTimeout(1000)
  console.log(`PRODUCT ${model} options=${JSON.stringify(await page.locator('[role=listbox], [role=option]').allTextContents())}`)
  await input.press('ArrowDown'); await input.press('Enter'); await page.waitForTimeout(1000)
}
async function save(name) {
  const saveButton = page.getByRole('button', { name: '저장', exact: true })
  for (let i = 0; i < 30 && await saveButton.isDisabled(); i++) await page.waitForTimeout(1000)
  console.log(`SAVE_ENABLED ${name}=${!(await saveButton.isDisabled())}`)
  if (await saveButton.isDisabled()) {
    const resources = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name).filter((url) => url.includes('/api/')))
    const raw = `NO_POST_RESPONSE\n저장 버튼 비활성: 최근단가 확인 중…\nAPI_RESOURCES\n${resources.join('\n')}`
    fs.writeFileSync(path.join(qaDir, `${name}-save-response.txt`), raw, 'utf8')
    await capture(name)
    return raw
  }
  const p = page.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('/slips'), { timeout: 20000 }).catch(() => null)
  await saveButton.click()
  const response = await p
  await page.waitForTimeout(1800)
  const raw = response ? `${response.status()} ${response.url()}\n${await response.text()}` : 'NO_POST_RESPONSE'
  fs.writeFileSync(path.join(qaDir, `${name}-save-response.txt`), raw, 'utf8')
  console.log(`SAVE ${name} ${raw.slice(0, 12000)}`)
  await capture(name)
  return raw
}

await openNew()
await capture('01-initial')
await warehouse()
await capture('02-warehouse-2-sangil')
await partner('4348703365', '주식회사 엠엠시스템에어')
await capture('03-fixed-and-global-partner')
await product(1, 'AR09TXEAAWKNEU-04')
await product(2, 'MCU-S6NDB1N')
await page.locator('input[aria-label="라인 1 수량"]').fill('1')
await page.locator('input[aria-label="라인 2 수량"]').fill('1')
await page.waitForTimeout(500)
await capture('04-mixed-lines-before-save')
const mixed = await save('05-mixed-lines-after-save')

await openNew()
await warehouse()
await partner('000011111111', '한울냉열시스템')
await product(1, 'AR09TXEAAWKNEU-04')
await page.locator('input[aria-label="라인 1 수량"]').fill('1')
await page.waitForTimeout(500)
await capture('06-no-global-before-save')
const noGlobal = await save('07-no-global-after-save')

fs.writeFileSync(path.join(qaDir, 'driver-summary.txt'), JSON.stringify({ mixed, noGlobal, errors }, null, 2), 'utf8')
console.log(`SUMMARY errors=${JSON.stringify(errors)}`)
await browser.close()
