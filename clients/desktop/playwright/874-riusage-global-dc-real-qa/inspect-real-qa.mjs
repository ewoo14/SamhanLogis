import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const baseUrl = process.env.AUDIT_BASE_URL ?? 'http://127.0.0.1:5943'
const repoRoot = path.resolve(fileURLToPath(new URL('../../../..', import.meta.url)))
const shots = path.join(repoRoot, 'docs/qa/874-riusage-global-dc-real-qa')
fs.mkdirSync(shots, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
const page = await context.newPage()
page.on('pageerror', error => console.log(`[pageerror] ${error.message}`))
page.on('console', message => {
  if (message.type() === 'error' || message.type() === 'warning') console.log(`[console:${message.type()}] ${message.text()}`)
})

await page.goto(`${baseUrl}/#/login`, { waitUntil: 'domcontentloaded' })
await page.screenshot({ path: path.join(shots, '00-login.png'), fullPage: true })
await page.getByRole('textbox', { name: '사용자 ID (필수)' }).fill('dev_master')
await page.getByRole('textbox', { name: '비밀번호 (필수)' }).fill('dev_p05_pass!')
await page.getByRole('button', { name: '로그인', exact: true }).click()
await page.waitForURL('**/#/', { timeout: 20_000 })
await page.screenshot({ path: path.join(shots, '01-home.png'), fullPage: true })

await page.getByRole('button', { name: '판매', exact: true }).click()
await page.getByRole('button', { name: '새 판매전표', exact: true }).click()
await page.waitForURL('**/#/sales/new', { timeout: 20_000 })
await page.screenshot({ path: path.join(shots, '02-sales-new.png'), fullPage: true })

console.log('URL', page.url())
console.log('SELECTS', await page.locator('select').count())
console.log('INPUTS')
console.log(await page.locator('input').evaluateAll(elements => elements.map((el, index) => ({ index, type: el.type, name: el.getAttribute('name'), placeholder: el.getAttribute('placeholder'), aria: el.getAttribute('aria-label'), value: el.value }))))
console.log('COMBOBOXES')
console.log(await page.getByRole('combobox').evaluateAll(elements => elements.map((el, index) => ({ index, tag: el.tagName, text: el.textContent, aria: el.getAttribute('aria-label'), value: el.value, outer: el.outerHTML.slice(0, 400) }))))
console.log('BUTTONS', await page.getByRole('button').allTextContents())

const warehouse = page.getByRole('combobox').nth(0)
await warehouse.fill('본')
await page.waitForTimeout(1000)
console.log('WAREHOUSE POPUP TEXT', await page.locator('[role="listbox"], [role="option"]').allTextContents())
await page.screenshot({ path: path.join(shots, '03-warehouse-popup.png'), fullPage: true })
await page.locator('[role="listbox"] [role="option"]').first().click()

const partner = page.getByRole('combobox').nth(2)
await partner.fill('P0-6-C002')
await page.waitForTimeout(1000)
console.log('PARTNER POPUP TEXT', await page.locator('[role="listbox"], [role="option"]').allTextContents())
await page.screenshot({ path: path.join(shots, '04-partner-popup.png'), fullPage: true })
await page.locator('[role="listbox"] [role="option"]').first().click()
const line1Product = page.getByRole('combobox', { name: '라인 1 품목' })
await line1Product.fill('냉방전용')
await page.waitForTimeout(2000)
console.log('PRODUCT POPUP TEXT', await page.locator('[role="listbox"], [role="option"]').allTextContents())
await page.screenshot({ path: path.join(shots, '05-product-popup.png'), fullPage: true })

await browser.close()
