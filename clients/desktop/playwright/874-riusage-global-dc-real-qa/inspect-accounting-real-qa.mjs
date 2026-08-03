import { chromium } from '@playwright/test'
const baseUrl = process.env.AUDIT_BASE_URL ?? 'http://127.0.0.1:5943'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
await page.goto(`${baseUrl}/#/login`, { waitUntil: 'domcontentloaded' })
await page.getByRole('textbox', { name: '사용자 ID (필수)' }).fill('dev_master')
await page.getByRole('textbox', { name: '비밀번호 (필수)' }).fill('dev_p05_pass!')
await page.getByRole('button', { name: '로그인', exact: true }).click()
await page.waitForURL('**/#/', { timeout: 20_000 })
await page.getByRole('button', { name: '회계', exact: true }).click()
await page.waitForTimeout(500)
console.log('ACCOUNTING LINKS', await page.getByRole('link').allTextContents())
console.log('ACCOUNTING HREFS', await page.getByRole('link').evaluateAll(els => els.map(el => ({ text: el.textContent, href: el.getAttribute('href') }))))
await browser.close()
