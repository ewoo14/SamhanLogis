/* 첫 카드 타깃 캡처(요소 스크린샷) — fullPage 과대 회피. */
const { chromium } = require('playwright')
const path = process.argv[2] || '/accounting/bank-transactions'
const out = process.argv[3] || 'card-bank.png'
;(async () => {
  const b = await chromium.launch({ headless: true }).catch(() => chromium.launch({ headless: true, channel: 'chromium-headless-shell' }))
  const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage()
  await page.goto('http://localhost:5175/login', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid=login-id-input]', { timeout: 15000 })
  await page.fill('[data-testid=login-id-input]', 'dev_master')
  await page.fill('[data-testid=login-password-input]', 'dev_p05_pass!')
  await page.click('[data-testid=login-submit-button]')
  await page.waitForSelector('.app-shell', { timeout: 20000 })
  await page.goto('http://localhost:5175' + path, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2200)
  const tr = page.locator('.app-main table tbody tr').first()
  const n = await page.locator('.app-main table tbody tr').count()
  if (n === 0) { console.log('NO ROWS (무데이터)'); await b.close(); return }
  await tr.screenshot({ path: 'C:/dev/Samhan-Public/docs/qa/mobile-other/' + out })
  console.log('CARD SHOT saved', out, 'rows=', n)
  await b.close()
})().catch((e) => { console.error('FAIL', e.message); process.exit(1) })
