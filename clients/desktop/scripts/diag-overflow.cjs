const { resolveQaCredential } = require('../../../scripts/lib/qa-credentials.cjs')
const { chromium } = require('playwright')
const P = process.argv[2] || '/accounting/bank-transactions'
;(async () => {
  const b = await chromium.launch({ headless: true }).catch(() => chromium.launch({ headless: true, channel: 'chromium-headless-shell' }))
  const page = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage()
  await page.goto('http://localhost:5175/#/login', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid=login-id-input]', { timeout: 15000 })
  await page.fill('[data-testid=login-id-input]', 'dev_master')
  await page.fill('[data-testid=login-password-input]', (resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')))
  await page.click('[data-testid=login-submit-button]')
  await page.waitForSelector('.app-shell', { timeout: 20000 })
  // 이 하네스(:5175, vite.renderer.dev.config.ts)는 HashRouter — 해시 없는 goto 는 조용히
  // 홈으로 낙착한다(2026-07-26 하네스 재수렴 라운드 G5 실측).
  await page.goto('http://localhost:5175/#' + P, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2200)
  if (!page.url().includes('/#' + P)) {
    throw new Error(`해시 경로 이탈 — 기대=#${P} 실제=${page.url()}`)
  }
  const r = await page.evaluate(() => {
    const vw = window.innerWidth
    const over = []
    for (const el of document.querySelectorAll('.app-main *')) {
      const rc = el.getBoundingClientRect()
      if (rc.width > 0 && rc.right > vw + 1) {
        let scroll = false, q = el.parentElement
        if (el.closest('thead')) continue
        while (q && !q.classList.contains('app-main')) { const o = getComputedStyle(q).overflowX; if (o === 'auto' || o === 'scroll') { scroll = true; break } q = q.parentElement }
        if (!scroll) over.push(`${el.tagName}.${(el.className||'').toString().slice(0,40)} w=${Math.round(rc.width)} right=${Math.round(rc.right)} disp=${getComputedStyle(el).display}`)
      }
    }
    return over.slice(0, 8)
  })
  console.log(P + ' overflow:\n' + r.join('\n'))
  await b.close()
})().catch((e) => { console.error('FAIL', e.message); process.exit(1) })
