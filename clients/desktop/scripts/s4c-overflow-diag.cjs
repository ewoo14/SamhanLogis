/* 슬4c 가로 overflow 진단 — slip 상세 mobile(390)에서 우측 넘침 요소 식별. */
const { chromium } = require('playwright')
const BASE = 'http://localhost:5175'
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
  for (const route of ['/sales/slips']) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('table tbody tr', { timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(800)
    await page.locator('table tbody tr').first().click().catch(() => {})
    await page.waitForTimeout(1500)
    const diag = await page.evaluate(() => {
      const vw = window.innerWidth
      const docW = document.documentElement.scrollWidth
      const over = []
      const all = document.querySelectorAll('.app-main *, .app-main')
      for (const el of all) {
        const r = el.getBoundingClientRect()
        if (r.width > 0 && r.right > vw + 1) {
          // 자식이 아니라 자신이 overflow 원인인지: scrollWidth > clientWidth 또는 rect.right 큰 leaf
          over.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.className && typeof el.className === 'string') ? el.className.slice(0, 40) : '',
            right: Math.round(r.right), w: Math.round(r.width),
            scrollW: el.scrollWidth, clientW: el.clientWidth,
            text: (el.textContent || '').trim().slice(0, 30),
          })
        }
      }
      // right 큰 순 정렬, 상위 12
      over.sort((a, b) => b.right - a.right)
      return { vw, docW, overflowing: over.slice(0, 12), totalOver: over.length }
    })
    console.log(`[${route}] viewport=${diag.vw} documentScrollWidth=${diag.docW} (overflow=${diag.docW > diag.vw}) overflowing요소=${diag.totalOver}`)
    for (const o of diag.overflowing) console.log(`  <${o.tag} class="${o.cls}"> right=${o.right} w=${o.w} scrollW=${o.scrollW}/clientW=${o.clientW} "${o.text}"`)
    await page.screenshot({ path: 'C:/dev/Samhan-Public/docs/qa/mobile-s4c-detail-responsive/_diag-slip-overflow.png', fullPage: true })
  }
  await b.close(); console.log('DIAG_DONE')
})().catch((e) => { console.error('DIAG_FAIL', e); process.exit(1) })
