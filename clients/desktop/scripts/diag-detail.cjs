/* 상세 페이지(리스트→행클릭) 모바일 오버플로 진단 — thead 제외 실 오버플로. */
const { chromium } = require('playwright')
const path = require('path')
const { resolveQaShotsDir } = require('../../../scripts/lib/qa-shots-dir.cjs')
const LIST = process.argv[2] || '/accounting/journals'
const OUT = process.argv[3] || 'detail-journal.png'
// 절대경로 하드코딩 제거 + _local 격리(2026-07-26 하네스 재수렴 라운드 G3).
const QA = resolveQaShotsDir(path.resolve(__dirname, '../../../docs/qa/mobile-other'))
;(async () => {
  const b = await chromium.launch({ headless: true }).catch(() => chromium.launch({ headless: true, channel: 'chromium-headless-shell' }))
  const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage()
  await page.goto('http://localhost:5175/#/login', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid=login-id-input]', { timeout: 15000 })
  await page.fill('[data-testid=login-id-input]', 'dev_master')
  await page.fill('[data-testid=login-password-input]', (process.env.DEV_PASSWORD ?? ''))
  await page.click('[data-testid=login-submit-button]')
  await page.waitForSelector('.app-shell', { timeout: 20000 })
  // 이 하네스(:5175, vite.renderer.dev.config.ts)는 HashRouter — 해시 없는 goto 는 조용히
  // 홈으로 낙착한다(2026-07-26 하네스 재수렴 라운드 G5 실측).
  await page.goto('http://localhost:5175/#' + LIST, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  if (!page.url().includes('/#' + LIST)) {
    throw new Error(`해시 경로 이탈 — 기대=#${LIST} 실제=${page.url()}`)
  }
  // 첫 행(카드) 클릭 → 상세
  const row = page.locator('.app-main table tbody tr').first()
  if (await row.count() === 0) { console.log('NO ROWS (무데이터)'); await b.close(); return }
  await row.click()
  await page.waitForTimeout(2200)
  const r = await page.evaluate(() => {
    const vw = window.innerWidth
    const over = []
    for (const el of document.querySelectorAll('.app-main *')) {
      if (el.closest('thead')) continue
      const rc = el.getBoundingClientRect()
      if (rc.width > 0 && rc.right > vw + 1) {
        let scroll = false, q = el.parentElement
        while (q && !q.classList.contains('app-main')) { const o = getComputedStyle(q).overflowX; if (o === 'auto' || o === 'scroll') { scroll = true; break } q = q.parentElement }
        if (!scroll) over.push(`${el.tagName}.${(el.className||'').toString().slice(0,45)} w=${Math.round(rc.width)} right=${Math.round(rc.right)} disp=${getComputedStyle(el).display}`)
      }
    }
    return { url: location.hash, count: over.length, samples: over.slice(0, 10) }
  })
  console.log('url=' + r.url + ' realOverflow=' + r.count)
  console.log(r.samples.join('\n'))
  await page.screenshot({ path: path.join(QA, OUT), fullPage: true })
  await b.close()
})().catch((e) => { console.error('FAIL', e.message); process.exit(1) })
