import { chromium } from '@playwright/test'
import path from 'node:path'

const baseUrl = process.env.AUDIT_BASE_URL ?? 'http://127.0.0.1:5943'
const shots = 'D:/dev/Samhan-Public/.claude/worktrees/w1057/docs/qa/874-riusage-global-dc-real-qa'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
page.on('dialog', async dialog => { console.log(`[dialog] ${dialog.message()}`); await dialog.accept() })
page.on('console', message => { if (message.type() === 'error') console.log(`[console:error] ${message.text()}`) })
page.on('response', response => {
  if (response.request().method() !== 'GET' && /slip|sales/i.test(response.url())) console.log(`[response] ${response.status()} ${response.request().method()} ${response.url()}`)
})
await page.goto(`${baseUrl}/#/login`, { waitUntil: 'domcontentloaded' })
await page.getByRole('textbox', { name: '사용자 ID (필수)' }).fill('dev_manager')
await page.getByRole('textbox', { name: '비밀번호 (필수)' }).fill('dev_p05_pass!')
await page.getByRole('button', { name: '로그인', exact: true }).click()
await page.waitForURL('**/#/', { timeout: 20_000 })
await page.getByRole('button', { name: '판매', exact: true }).click()
await page.getByRole('button', { name: '판매관리', exact: true }).click()
await page.waitForURL('**/#/sales', { timeout: 20_000 })
await page.waitForTimeout(2000)
const row = page.locator('tr').filter({ hasText: 'QA-874-A' }).first()
await row.locator('button').first().evaluate(el => el.click())
await page.waitForTimeout(800)
console.log('BEFORE_STEP', (await page.locator('body').innerText()).slice(-3000))
const step = page.locator('[aria-label="창고 전송 — 미진행"]')
console.log('STEP_COUNT', await step.count())
await step.click()
await page.waitForTimeout(1800)
console.log('AFTER_STEP_URL', page.url())
console.log('AFTER_STEP', (await page.locator('body').innerText()).slice(-3500))
await page.screenshot({ path: path.join(shots, '14-sales-A-warehouse-transfer.png'), fullPage: true })
await browser.close()
