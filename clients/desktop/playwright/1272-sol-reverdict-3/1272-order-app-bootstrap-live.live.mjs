import { chromium } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../../../../scripts/lib/qa-shots-dir.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const shots = resolveQaShotsDir(path.resolve(here, '../../../../docs/qa/1272-sol-reverdict-3/screenshots'))
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
let bootstrapStatus = null

page.on('response', response => {
  if (response.url().includes('/api/v1/partner-orders/bootstrap')) bootstrapStatus = response.status()
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
await page.waitForFunction(() => document.body.innerText.includes('오류: HTTP 503'), undefined, { timeout: 30_000 })
const dataRows = await page.locator('#commBody > tr, #homeBody > tr, #singleBody > tr, #legacyBody > tr').count()
const screenshot = path.join(shots, '01-order-app-bootstrap-503-real-qa.png')
await page.screenshot({ path: screenshot, fullPage: true })
console.log(JSON.stringify({
  bootstrapStatus,
  dataRows,
  hasError: (await page.locator('body').innerText()).includes('오류: HTTP 503'),
  credentialSource: resolveQaCredential('QA_PARTNER_ORDER_PASSWORD') ? 'resolveQaCredential' : 'missing',
  screenshot,
}))

await context.close()
await browser.close()
