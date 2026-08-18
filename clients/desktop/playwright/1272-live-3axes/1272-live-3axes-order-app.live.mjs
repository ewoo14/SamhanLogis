import { chromium } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../../../../scripts/lib/qa-shots-dir.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const shots = resolveQaShotsDir(path.resolve(here, '../../../../docs/qa/1272-live-3axes/screenshots'))
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const calls = []
page.on('request', request => {
  if (request.url().includes('/api/v1/')) calls.push(`${request.method()} ${request.url()}`)
})
await page.route('**/api/v1/auth/partner-login', async route => {
  const target = new URL(route.request().url())
  target.hostname = '127.0.0.1'
  target.port = '8080'
  const response = await route.fetch({ url: target.toString() })
  await route.fulfill({ response })
})
await page.route('**/api/v1/partner-orders/bootstrap', async route => {
  const target = new URL(route.request().url())
  target.hostname = '127.0.0.1'
  target.port = '8080'
  const response = await route.fetch({ url: target.toString() })
  await route.fulfill({ response })
})
await page.goto('http://127.0.0.1:5184/', { waitUntil: 'domcontentloaded' })
await page.locator('#bizGateInput').fill('2118712345')
await page.locator('#btnBizQuery').click()
await page.locator('#authPw1').fill(resolveQaCredential('QA_PARTNER_ORDER_PASSWORD'))
await page.locator('#btnAuthAction').click()
await page.waitForSelector('#pageBizGate', { state: 'hidden', timeout: 30000 })
await page.waitForTimeout(5000)
if (await page.locator('#gateImageModal').isVisible().catch(() => false)) await page.locator('#btnImgClose').click()
if (await page.locator('#tutBox').isVisible().catch(() => false)) {
  const skip = page.locator('button:has-text("튜토리얼 스킵")')
  if (await skip.isVisible().catch(() => false)) await skip.click()
}
await page.locator('#btnGoComm').click()
await page.waitForTimeout(2000)
const rows = await page.locator('#commBody > tr').count()
await page.screenshot({ path: path.join(shots, '01-order-app-commercial-catalog-real-qa.png'), fullPage: true })
console.log(JSON.stringify({ rows, calls: calls.filter(call => /bootstrap|products/.test(call)), screenshot: path.join(shots, '01-order-app-commercial-catalog-real-qa.png') }))
await context.close()
await browser.close()
