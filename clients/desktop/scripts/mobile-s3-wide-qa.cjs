/* 슬3 ④/⑤ 검증 라이브 캡처 — 대형 래퍼 화면(MAJOR) + 긴 값 화면(④fix). */
const { chromium } = require('playwright')
const QA = 'C:/dev/Samhan-Public/docs/qa/mobile-s3-datatable-card'
const BASE = 'http://localhost:5175'
async function launch() { try { return await chromium.launch({ headless: true }) } catch { return await chromium.launch({ headless: true, channel: 'chromium-headless-shell' }) } }
async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid=login-id-input]', { timeout: 15000 })
  await page.fill('[data-testid=login-id-input]', 'dev_master')
  await page.fill('[data-testid=login-password-input]', 'dev_p05_pass!')
  await page.click('[data-testid=login-submit-button]')
  await page.waitForSelector('.app-shell', { timeout: 20000 }); await page.waitForTimeout(1000)
}
async function cap(page, path, file, label) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3000)
  const sw = await page.evaluate(() => document.documentElement.scrollWidth)
  const iw = await page.evaluate(() => window.innerWidth)
  await page.screenshot({ path: `${QA}/${file}`, fullPage: false })
  console.log(`${label}: ${path} scrollWidth=${sw} innerWidth=${iw} 가로overflow=${sw > iw + 1 ? 'YES(스크롤)' : 'NO'}`)
}
(async () => {
  const b = await launch()
  const m = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage()
  await login(m)
  await cap(m, '/accounting/reports/income-statement/monthly', 'W1-mobile-monthly-income.png', '1.MAJOR 월별손익(대형래퍼 1760)')
  await cap(m, '/admin/external-carriers', 'W2-mobile-external-carriers.png', '2.④fix 외부배송사(이메일 긴값)')
  await m.context().close()
  await b.close(); console.log('QA_DONE')
})().catch((e) => { console.error('QA_FAIL', e); process.exit(1) })
