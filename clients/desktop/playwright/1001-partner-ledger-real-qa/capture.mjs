import { chromium } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaShotsDir } from '../../../../scripts/lib/qa-shots-dir.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = resolveQaShotsDir(path.resolve(__dirname, '..', '..', '..', '..', 'docs', 'qa', '1001-partner-ledger-real-qa'))

const APP = 'http://127.0.0.1:5175'
const password = process.env.QA_PASSWORD
if (!password) throw new Error('QA_PASSWORD 환경변수가 필요합니다.')
const browser = await chromium.launch({
  headless: false,
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args: ['--disable-gpu'],
})
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const page = await context.newPage()
page.on('console', (message) => console.log(`[console:${message.type()}] ${message.text()}`))
page.on('pageerror', (error) => console.log(`[pageerror] ${error.message}`))

await page.goto(`${APP}/#/login`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[data-testid="login-id-input"]', { timeout: 20000 })
console.log('LOGIN_BODY_START')
console.log((await page.locator('body').innerText()).slice(0, 5000))
console.log('LOGIN_BODY_END')
await page.screenshot({ path: path.join(OUT, '00-login.png'), fullPage: true })
await page.locator('[data-testid="login-id-input"]').fill('dev_manager')
await page.locator('[data-testid="login-password-input"]').fill(password)
await page.locator('[data-testid="login-submit-button"]').click()
await page.waitForTimeout(1500)
console.log(`AFTER_LOGIN_URL ${page.url()}`)
console.log('AFTER_LOGIN_BODY_START')
console.log((await page.locator('body').innerText()).slice(0, 8000))
console.log('AFTER_LOGIN_BODY_END')
await page.goto(`${APP}/#/accounting/partner-ledger`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
console.log(`LEDGER_URL ${page.url()}`)
console.log('LEDGER_BODY_START')
console.log((await page.locator('body').innerText()).slice(0, 12000))
console.log('LEDGER_BODY_END')
console.log('TESTIDS', await page.locator('[data-testid]').evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')).filter(Boolean).slice(0, 300)))
await page.screenshot({ path: path.join(OUT, '00-ledger-initial.png'), fullPage: true })
await browser.close()
