/* 잔여 모바일 화면 점검(리스트/폼/대시보드) — 클린 기준 평가용 캡처. */
const { chromium } = require('playwright')
const fs = require('fs')
const QA = 'C:/dev/Samhan-Public/docs/qa/mobile-other'
const BASE = 'http://localhost:5175'
fs.mkdirSync(QA, { recursive: true })
const PAGES = [
  { label: 'tax-invoice-batch', path: '/accounting/tax-invoices/batch' },
  { label: 'tax-invoice-inbound', path: '/accounting/tax-invoices/inbound' },
  { label: 'link-dispatch', path: '/sales/link-dispatch' },
  { label: 'dispatch-sms-audit', path: '/arologis/dispatch-sms/send-audit' },
]
async function launch() { try { return await chromium.launch({ headless: true }) } catch { return await chromium.launch({ headless: true, channel: 'chromium-headless-shell' }) } }
;(async () => {
  const b = await launch()
  const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid=login-id-input]', { timeout: 15000 })
  await page.fill('[data-testid=login-id-input]', 'dev_master')
  await page.fill('[data-testid=login-password-input]', 'dev_p05_pass!')
  await page.click('[data-testid=login-submit-button]')
  await page.waitForSelector('.app-shell', { timeout: 20000 })
  for (const p of PAGES) {
    try {
      await page.goto(`${BASE}${p.path}`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(1800)
      // 페이지 가로 overflow 측정
      const ov = await page.evaluate(() => {
        const vw = window.innerWidth
        let clipped = 0
        for (const el of document.querySelectorAll('.app-main *')) {
          const r = el.getBoundingClientRect()
          if (r.width > 0 && r.right > vw + 1) {
            let scroll = false, q = el.parentElement
            while (q && !q.classList.contains('app-main')) { const o = getComputedStyle(q).overflowX; if (o === 'auto' || o === 'scroll') { scroll = true; break } q = q.parentElement }
            if (!scroll) clipped++
          }
        }
        return { vw, docW: document.documentElement.scrollWidth, clipped }
      })
      await page.screenshot({ path: `${QA}/mobile-${p.label}.png`, fullPage: true })
      console.log(`[${p.label}] docW=${ov.docW}/${ov.vw} 클리핑요소=${ov.clipped} ${ov.clipped > 0 ? '⚠️' : 'OK'}`)
    } catch (e) { console.log(`[${p.label}] ERROR ${e.message}`) }
  }
  await b.close(); console.log('DONE')
})().catch((e) => { console.error('FAIL', e); process.exit(1) })
