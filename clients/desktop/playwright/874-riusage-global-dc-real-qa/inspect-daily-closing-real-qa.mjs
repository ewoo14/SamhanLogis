import { chromium } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'

const baseUrl = process.env.AUDIT_BASE_URL ?? 'http://127.0.0.1:5943'
const shots = 'D:/dev/Samhan-Public/.claude/worktrees/w1057/docs/qa/874-riusage-global-dc-real-qa'
fs.mkdirSync(shots, { recursive: true })
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
page.on('console', message => { if (message.type() === 'error') console.log(`[console:error] ${message.text()}`) })
page.on('response', response => {
  if (/daily|closing|ledger/i.test(response.url())) console.log(`[response] ${response.status()} ${response.request().method()} ${response.url()}`)
})
await page.goto(`${baseUrl}/#/login`, { waitUntil: 'domcontentloaded' })
await page.getByRole('textbox', { name: '사용자 ID (필수)' }).fill('dev_manager')
await page.getByRole('textbox', { name: '비밀번호 (필수)' }).fill('dev_p05_pass!')
await page.getByRole('button', { name: '로그인', exact: true }).click()
await page.waitForURL('**/#/', { timeout: 20_000 })
await page.getByRole('button', { name: '회계', exact: true }).click()
await page.getByRole('link', { name: '일마감', exact: true }).click()
await page.waitForURL('**/#/accounting/daily-closing', { timeout: 20_000 })
await page.waitForTimeout(1800)
console.log('URL', page.url())
console.log('INPUTS', await page.locator('input').evaluateAll(els => els.map((el, index) => ({ index, type: el.type, value: el.value, aria: el.getAttribute('aria-label'), placeholder: el.placeholder }))))
console.log('SELECTS', await page.locator('select').evaluateAll(els => els.map((el, index) => ({ index, value: el.value, options: [...el.options].map(o => ({ text: o.text, value: o.value })) }))))
console.log('BUTTONS', await page.getByRole('button').allTextContents())
console.log('BODY', (await page.locator('body').innerText()).slice(-10000))
await page.screenshot({ path: path.join(shots, '01-daily-closing-entry.png'), fullPage: true })
const selects = page.locator('select')
await selects.nth(0).selectOption('SALES')
await selects.nth(1).selectOption('SALES_SLIP')
await page.waitForTimeout(2200)
console.log('QUERY_SELECTION', await selects.evaluateAll(els => els.map(el => el.value)))
console.log('QUERY_BODY', (await page.locator('body').innerText()).slice(-14000))
await page.screenshot({ path: path.join(shots, '01-daily-closing-query.png'), fullPage: true })
await browser.close()
