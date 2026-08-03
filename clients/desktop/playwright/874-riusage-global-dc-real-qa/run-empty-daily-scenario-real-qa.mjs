import { chromium } from '@playwright/test'
import path from 'node:path'

const baseUrl = process.env.AUDIT_BASE_URL ?? 'http://127.0.0.1:5943'
const scenario = process.env.AUDIT_SCENARIO ?? '02-r15-hidden-mismatch'
const shots = 'D:/dev/Samhan-Public/.claude/worktrees/w1057/docs/qa/874-riusage-global-dc-real-qa'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
page.on('console', message => { if (message.type() === 'error') console.log(`[console:error] ${message.text()}`) })
page.on('response', response => {
  if (/accounting\/daily|closings\/daily/i.test(response.url())) console.log(`[response] ${response.status()} ${response.request().method()} ${response.url()}`)
})
await page.goto(`${baseUrl}/#/login`, { waitUntil: 'domcontentloaded' })
await page.getByRole('textbox', { name: '사용자 ID (필수)' }).fill('dev_manager')
await page.getByRole('textbox', { name: '비밀번호 (필수)' }).fill('dev_p05_pass!')
await page.getByRole('button', { name: '로그인', exact: true }).click()
await page.waitForURL('**/#/', { timeout: 20_000 })
await page.getByRole('button', { name: '회계', exact: true }).click()
await page.getByRole('link', { name: '일마감', exact: true }).click()
await page.waitForURL('**/#/accounting/daily-closing', { timeout: 20_000 })
await page.waitForTimeout(900)
const selects = page.locator('select')
await selects.nth(0).selectOption('SALES')
await selects.nth(1).selectOption('SALES_SLIP')
await page.waitForTimeout(1600)
const rows = page.locator('tbody tr')
const statusBadges = page.locator('[class*="badge"], [class*="Badge"]')
console.log('SCENARIO', scenario)
console.log('SELECTION', await selects.evaluateAll(els => els.map(el => el.value)))
console.log('DATA_ROWS', await rows.count())
console.log('VISIBLE_CONFIRM_OR_MISMATCH', await page.getByText(/확인|불일치/).allTextContents())
console.log('BODY_TAIL', (await page.locator('body').innerText()).slice(-5000))
await page.screenshot({ path: path.join(shots, `${scenario}.png`), fullPage: true })
await browser.close()
