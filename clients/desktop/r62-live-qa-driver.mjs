import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const renderer = 'http://localhost:5299'
const gateway = 'http://localhost:8080'
const qaDir = path.resolve('../../docs/qa/874-riusage-r62-real-qa')
fs.mkdirSync(qaDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
const login = await context.request.post(`${gateway}/api/auth/login`, {
  data: { loginId: 'dev_manager', password: 'dev_p05_pass!' },
})
console.log(`LOGIN status=${login.status()} ok=${login.ok()}`)
const loginBody = await login.json()
const account = loginBody.data
if (!account?.token) throw new Error(`login response missing token: ${JSON.stringify(loginBody)}`)
for (const url of [
  `${gateway}/admin/partners/search?q=4348703365&size=20`,
  `${gateway}/api/v1/slips/lookup-product?modelName=SHA`,
  `${gateway}/api/v1/slips/lookup-product?modelName=에어컨`,
  `${gateway}/api/v1/slips/lookup-product?modelName=AJ020FERPBC1`,
  `${gateway}/api/v1/slips/lookup-product?modelName=AC023CN1DBC1`,
  `${gateway}/api/v1/products?q=&page=0&size=1000`,
]) {
  const response = await context.request.get(url, { headers: { authorization: `Bearer ${account.token}` } })
  const raw = await response.text()
  console.log(`READ ${url} status=${response.status()} body=${raw.slice(0, 5000)}`)
  if (url.includes('/api/v1/products?q=')) {
    const payload = JSON.parse(raw)
    const rows = payload.content ?? payload.data?.content ?? payload.data?.items ?? []
    console.log(`PRODUCT_SHAPE keys=${Object.keys(payload)} dataKeys=${payload.data && Object.keys(payload.data)} rows=${rows.length}`)
    console.log(`PRODUCT_CANDIDATES ${JSON.stringify(rows.filter(row => row.fixedDiscountRate != null).slice(0, 8))}`)
    console.log(`PRODUCT_NO_FIXED ${JSON.stringify(rows.filter(row => row.fixedDiscountRate == null && Number(row.releasePrice ?? 0) > 0).slice(0, 8))}`)
  }
}
await context.addInitScript(({ token, userId, displayName }) => {
  Object.defineProperty(window, 'samhanAuth', {
    configurable: true,
    value: {
      getToken: async () => ({ token, userId, role: 'MANAGER', fullName: displayName, partnerCode: null }),
      setToken: async () => undefined,
      clearToken: async () => undefined,
    },
  })
}, { token: account.token, userId: account.userId, displayName: account.displayName ?? '개발매니저' })

const page = await context.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
page.on('console', m => { if (m.type() === 'error') console.log(`CONSOLE_ERROR ${m.text()}`) })
await page.goto(`${renderer}/#/sales/new`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(5000)
console.log(`URL ${page.url()}`)
console.log(`TITLE ${await page.title()}`)
const text = await page.locator('body').innerText()
console.log(text.slice(0, 12000))
const controls = await page.locator('input, select, textarea, button').evaluateAll(nodes => nodes.slice(0, 120).map((n, i) => ({
  i,
  tag: n.tagName,
  type: n.getAttribute('type'),
  name: n.getAttribute('name'),
  aria: n.getAttribute('aria-label'),
  testid: n.getAttribute('data-testid'),
  text: (n.textContent ?? '').trim().slice(0, 80),
  placeholder: n.getAttribute('placeholder'),
})))
console.log(`CONTROLS ${JSON.stringify(controls, null, 2)}`)
await page.screenshot({ path: path.join(qaDir, '01-sales-new-initial.png'), fullPage: true })
fs.writeFileSync(path.join(qaDir, '01-sales-new-initial.txt'), text, 'utf8')
console.log(`PAGE_ERRORS ${JSON.stringify(errors)}`)

const warehouse = page.getByPlaceholder('창고 코드 또는 이름 입력…')
await warehouse.fill('2')
await page.waitForTimeout(1200)
console.log(`WAREHOUSE_POPUP ${await page.locator('[role=listbox], [role=option]').allTextContents()}`)
await page.screenshot({ path: path.join(qaDir, '02-warehouse-selection.png'), fullPage: true })
const warehouseOption = page.getByRole('option').filter({ hasText: '2' }).first()
if (await warehouseOption.count()) await warehouseOption.click()
else await warehouse.press('Enter')

const partner = page.getByPlaceholder('거래처명 또는 코드 입력…')
await partner.fill('4348703365')
await page.waitForTimeout(1200)
console.log(`PARTNER_POPUP ${await page.locator('[role=listbox], [role=option]').allTextContents()}`)
await page.screenshot({ path: path.join(qaDir, '03-partner-global-dc-target.png'), fullPage: true })
const partnerOption = page.getByRole('option').filter({ hasText: '4348703365' }).first()
if (await partnerOption.count()) await partnerOption.click()
else throw new Error('partner option 4348703365 not found')

const line1 = page.locator('input[aria-label="라인 1 품목"]')
const line2 = page.locator('input[aria-label="라인 2 품목"]')
await line1.fill('AJ020FERPBC1')
await page.waitForTimeout(800)
console.log(`LINE1_AFTER_FILL ${await page.locator('[role=listbox], [role=option]').allTextContents()} bodyHas=${(await page.locator('body').innerText()).includes('비스포크 AI 에어콤보')}`)
const line1Option = page.getByRole('option').filter({ hasText: 'AJ020FERPBC1' }).first()
if (await line1Option.count()) { await line1.press('ArrowDown'); await line1.press('Enter') }
else await line1.press('Tab')
await page.waitForTimeout(1000)
await line2.fill('AC023CN1DBC1')
await page.waitForTimeout(800)
console.log(`LINE2_AFTER_FILL ${await page.locator('[role=listbox], [role=option]').allTextContents()} bodyHas=${(await page.locator('body').innerText()).includes('무풍 1way 냉방전용')}`)
const line2Option = page.getByRole('option').filter({ hasText: 'AC023CN1DBC1' }).first()
if (await line2Option.count()) { await line2.press('ArrowDown'); await line2.press('Enter') }
else await line2.press('Tab')
await page.waitForTimeout(1500)
console.log(`LINES ${JSON.stringify({
  line1: await page.locator('input[aria-label="라인 1 단가"]').inputValue(),
  line2: await page.locator('input[aria-label="라인 2 단가"]').inputValue(),
  body: (await page.locator('body').innerText()).slice(-4500),
})}`)
await page.screenshot({ path: path.join(qaDir, '04-confirmed-products-discount-price.png'), fullPage: true })
fs.writeFileSync(path.join(qaDir, '04-confirmed-products-discount-price.txt'), await page.locator('body').innerText(), 'utf8')
await page.locator('input[aria-label="라인 1 수량"]').fill('1')
const saveResponsePromise = page.waitForResponse(response => response.request().method() === 'POST' && response.url().includes('/slips'), { timeout: 15000 }).catch(() => null)
await page.getByRole('button', { name: '저장', exact: true }).click()
const saveResponse = await saveResponsePromise
await page.waitForTimeout(2000)
const saveText = await page.locator('body').innerText()
console.log(`SAVE_RESPONSE ${saveResponse ? `${saveResponse.status()} ${saveResponse.url()} ${(await saveResponse.text()).slice(0, 4000)}` : 'NO_POST_RESPONSE'}`)
console.log(`SAVE_BODY ${saveText.slice(-4000)}`)
await page.screenshot({ path: path.join(qaDir, '05-fixed-dc-slip-save-result.png'), fullPage: true })
fs.writeFileSync(path.join(qaDir, '05-fixed-dc-slip-save-result.txt'), saveText, 'utf8')

await page.goto(`${renderer}/#/sales/new`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
const warehouse2 = page.getByPlaceholder('창고 코드 또는 이름 입력…')
await warehouse2.fill('2')
await page.waitForTimeout(700)
await warehouse2.press('ArrowDown')
await warehouse2.press('Enter')
const partner2 = page.getByPlaceholder('거래처명 또는 코드 입력…')
await partner2.fill('4348703365')
await page.waitForTimeout(700)
await partner2.press('ArrowDown')
await partner2.press('Enter')
const noFixedLine = page.locator('input[aria-label="라인 1 품목"]')
await noFixedLine.fill('AC023CS1DBC1SY')
await page.waitForTimeout(700)
console.log(`NO_FIXED_LINE_POPUP ${await page.locator('[role=listbox], [role=option]').allTextContents()}`)
await noFixedLine.press('ArrowDown')
await noFixedLine.press('Enter')
await page.waitForTimeout(1200)
const noFixedPrice = await page.locator('input[aria-label="라인 1 단가"]').inputValue()
console.log(`NO_FIXED_LINE_CONFIRMED price=${noFixedPrice} body=${(await page.locator('body').innerText()).slice(-2200)}`)
await page.screenshot({ path: path.join(qaDir, '06-no-fixed-dc-product-confirmed.png'), fullPage: true })
await page.locator('input[aria-label="라인 1 수량"]').fill('1')
const save2Promise = page.waitForResponse(response => response.request().method() === 'POST' && response.url().includes('/slips'), { timeout: 15000 }).catch(() => null)
await page.getByRole('button', { name: '저장', exact: true }).click()
const save2 = await save2Promise
await page.waitForTimeout(1500)
console.log(`NO_FIXED_SAVE ${save2 ? `${save2.status()} ${(await save2.text()).slice(0, 4000)}` : 'NO_POST_RESPONSE'}`)
await page.screenshot({ path: path.join(qaDir, '07-no-fixed-dc-slip-save-result.png'), fullPage: true })
fs.writeFileSync(path.join(qaDir, '07-no-fixed-dc-slip-save-result.txt'), await page.locator('body').innerText(), 'utf8')
await browser.close()
