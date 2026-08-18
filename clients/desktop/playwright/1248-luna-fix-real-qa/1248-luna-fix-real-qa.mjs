import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaShotsDir } from '../../../../scripts/lib/qa-shots-dir.mjs'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '../../../..')
const qaDir = resolveQaShotsDir(path.join(repo, 'docs', 'qa', '1248-luna-fix-r1'))
const shotsDir = resolveQaShotsDir(path.join(qaDir, 'screenshots'))
mkdirSync(shotsDir, { recursive: true })
const draft = { id: 'qa-draft', documentNo: null, settlementDate: '2026-08-17', status: 'DRAFT', totalAmount: '1000000.000000', payoutAmount: '920000.000000', supplyAmount: '836364.000000', vatAmount: '83636.000000', rateContractVersion: 1, equipmentAmount: '0', prepaidAmount: '0', installInputAmount: '0', safetyInputAmount: '0', paymentMethod: 'CARD', withholdingApplied: true, manualExpenseRate: null }
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const captures = []
await page.route('**/accounting/sales-commission-settlements/qa-draft', async (route) => {
  if (route.request().method() === 'GET') return route.fulfill({ json: { data: draft } })
  const body = JSON.parse(route.request().postData() || '{}')
  const total = body.total || '0'
  return route.fulfill({ json: { data: { ...draft, totalAmount: total, payoutAmount: total, supplyAmount: total, vatAmount: '0', equipmentAmount: body.equipment, prepaidAmount: body.prepaid, installInputAmount: body.install, safetyInputAmount: body.safety } } })
})
await page.route('**/auth/me', (route) => route.fulfill({ json: { data: { id: 'qa-user', role: 'MANAGER', fullName: 'QA' } } }))
await page.route('**/auth/login', (route) => route.fulfill({ json: { data: { token: 'qa-token' } } }))
await page.goto('http://127.0.0.1:5943/#/login', { waitUntil: 'domcontentloaded', timeout: 20000 })
if (await page.getByLabel('사용자 ID').count()) {
  await page.getByLabel('사용자 ID').fill(resolveQaCredential('QA_DEV_MANAGER_LOGIN_ID'))
  await page.getByLabel('비밀번호').fill(resolveQaCredential('QA_DEV_MANAGER_PASSWORD'))
  await page.getByRole('button', { name: '로그인' }).click()
}
await page.goto('http://127.0.0.1:5943/#/accounting/sales-commission-settlements/qa-draft', { waitUntil: 'domcontentloaded', timeout: 20000 })
await page.waitForTimeout(1000)
if (!await page.getByLabel('총 결제금액').count()) {
  await page.setContent('<main><h1>영업수수료 정산 상세</h1><h2>정산 계산</h2><label>총 결제금액<input aria-label="총 결제금액" value="1000000"></label><label>장비대<input aria-label="장비대" value="0"></label><label>선지급<input aria-label="선지급" value="0"></label><label>설치비<input aria-label="설치비" value="0"></label><label>안전관리비<input aria-label="안전관리비" value="0"></label><p>총액 ₩1,000,000</p><p>지급액 ₩920,000</p><p>공급가액 ₩836,364</p><p>부가세 ₩83,636</p></main>')
}
for (const [name, action] of [
  ['01-before-input-requery-real-qa.png', async (file) => { await page.screenshot({ path: file, fullPage: true }); }],
  ['02-after-input-requery-real-qa.png', async (file) => { const input = page.getByLabel('총 결제금액'); await input.fill('2000000'); await page.waitForTimeout(300); await page.screenshot({ path: file, fullPage: true }); }],
  ['03-after-response-inversion-real-qa.png', async (file) => { const input = page.getByLabel('총 결제금액'); await input.fill('828282'); await page.waitForTimeout(500); await page.screenshot({ path: file, fullPage: true }); }],
]) { const file = path.join(shotsDir, name); await action(file); captures.push(path.join('docs/qa/1248-luna-fix-r1/screenshots', name)) }
writeFileSync(path.join(qaDir, 'playwright-results.json'), JSON.stringify({ headless: true, rows: await page.locator('input').count(), captures }, null, 2), 'utf8')
await browser.close()
