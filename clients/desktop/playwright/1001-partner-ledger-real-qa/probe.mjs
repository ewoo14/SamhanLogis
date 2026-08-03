import { chromium } from '@playwright/test'

const browser = await chromium.launch({
  headless: false,
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args: ['--disable-gpu'],
})
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
page.on('console', (message) => console.log(`[console:${message.type()}] ${message.text()}`))
page.on('pageerror', (error) => console.log(`[pageerror] ${error.stack}`))
page.on('requestfailed', (request) => console.log(`[requestfailed] ${request.url()} ${request.failure()?.errorText}`))
await page.goto('http://127.0.0.1:5175/#/login', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)
console.log('URL', page.url())
console.log('TITLE', await page.title())
console.log('BODY', (await page.locator('body').innerText()).slice(0, 12000))
await page.screenshot({ path: 'D:/dev/Samhan-Public/.claude/worktrees/w1061/docs/qa/1001-partner-ledger-real-qa/00-renderer-error.png', fullPage: true })
console.log('HTML', (await page.locator('body').innerHTML()).slice(0, 20000))
console.log('OVERLAY', await page.locator('vite-error-overlay').evaluate((element) => element.shadowRoot?.innerText ?? element.shadowRoot?.innerHTML ?? 'no-shadow').catch(() => 'no-overlay'))
await browser.close()
