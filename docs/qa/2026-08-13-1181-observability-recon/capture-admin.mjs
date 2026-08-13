import { chromium } from '../../../clients/desktop/node_modules/playwright/index.mjs'

const executablePath = 'C:/Users/user/AppData/Local/ms-playwright/chromium-1217/chrome-win64/chrome.exe'
const browser = await chromium.launch({ headless: true, executablePath })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const consoleLines = []
  page.on('console', (message) => consoleLines.push(`${message.type()}: ${message.text()}`))
  await page.goto('http://127.0.0.1:49181/admin/app-releases', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: '릴리스 등록' }).click()
  await page.waitForTimeout(300)
  const title = await page.title()
  const url = page.url()
  const bodyText = await page.locator('body').innerText()
  const selects = await page.locator('select').evaluateAll((nodes) => nodes.map((node) => ({
    name: node.getAttribute('name'),
    options: Array.from(node.options).map((option) => option.textContent),
  })))
  await page.screenshot({ path: 'docs/qa/2026-08-13-1181-observability-recon/admin-app-releases.png', fullPage: true })
  console.log(JSON.stringify({ title, url, bodyText, selects, consoleLines }, null, 2))
} finally {
  await browser.close()
}
