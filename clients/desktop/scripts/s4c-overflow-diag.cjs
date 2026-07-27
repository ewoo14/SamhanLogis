/* 슬4c 가로 overflow 재검증 — 상세 페이지 mobile(390)에서 우측 넘침 요소가
 * scroll 컨테이너 안(OK·스크롤가능)인지 app-main 클리핑(BAD·접근불가)인지 분류. */
const { chromium } = require('playwright')
const path = require('path')
const { resolveQaShotsDir } = require('../../../scripts/lib/qa-shots-dir.cjs')
// 절대경로 하드코딩 제거 + _local 격리(2026-07-26 하네스 재수렴 라운드 G3).
const QA = resolveQaShotsDir(path.resolve(__dirname, '../../../docs/qa/mobile-s4c-detail-responsive'))
const BASE = 'http://localhost:5175'
const ROUTES = [
  { label: 'slip', list: '/sales/slips' },
  { label: 'tax-invoice', list: '/accounting/tax-invoices' },
  { label: 'journal', list: '/accounting/journals' },
  { label: 'estimate', list: '/sales/estimates' },
]
async function launch() { try { return await chromium.launch({ headless: true }) } catch { return await chromium.launch({ headless: true, channel: 'chromium-headless-shell' }) } }
;(async () => {
  const b = await launch()
  const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage()
  // 이 하네스(:5175)는 HashRouter — 해시 필수(2026-07-26 하네스 재수렴 라운드 G5 실측).
  await page.goto(`${BASE}/#/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid=login-id-input]', { timeout: 15000 })
  await page.fill('[data-testid=login-id-input]', 'dev_master')
  await page.fill('[data-testid=login-password-input]', 'dev_p05_pass!')
  await page.click('[data-testid=login-submit-button]')
  await page.waitForSelector('.app-shell', { timeout: 20000 })
  for (const r of ROUTES) {
    await page.goto(`${BASE}/#${r.list}`, { waitUntil: 'domcontentloaded' })
    // ⚠️ 이 단언이 재는 것은 URL 문자열이지 실제 화면 도달이 아니다(2026-07-27 재수렴 5차 X3).
    // 잡는 것은 "작성자가 `/#` 를 빠뜨렸다" 뿐 — 실 도달 측정은 페이지별 DOM 마커 단언이 필요하다.
    if (!page.url().includes(`/#${r.list}`)) {
      throw new Error(`해시 경로 이탈 — 기대=#${r.list} 실제=${page.url()}`)
    }
    await page.waitForSelector('table tbody tr', { timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(700)
    if (await page.locator('table tbody tr').count().catch(() => 0) === 0) { console.log(`[${r.label}] 리스트 비어 미진입`); continue }
    await page.locator('table tbody tr').first().click().catch(() => {})
    await page.waitForTimeout(1500)
    const diag = await page.evaluate(() => {
      const vw = window.innerWidth
      const clipped = [], scrollable = []
      for (const el of document.querySelectorAll('.app-main *')) {
        const rect = el.getBoundingClientRect()
        if (rect.width <= 0 || rect.right <= vw + 1) continue
        let scroll = false, p = el.parentElement
        while (p && !p.classList.contains('app-main')) {
          const ov = getComputedStyle(p).overflowX
          if (ov === 'auto' || ov === 'scroll') { scroll = true; break }
          p = p.parentElement
        }
        const info = { tag: el.tagName.toLowerCase(), cls: (typeof el.className === 'string' ? el.className : '').slice(0, 36), right: Math.round(rect.right), text: (el.textContent || '').trim().slice(0, 24) }
        ;(scroll ? scrollable : clipped).push(info)
      }
      clipped.sort((a, b) => b.right - a.right)
      return { vw, docW: document.documentElement.scrollWidth, clippedCount: clipped.length, scrollableCount: scrollable.length, clipped: clipped.slice(0, 8) }
    })
    const verdict = diag.clippedCount === 0 ? 'PASS(클리핑 0)' : 'FAIL(클리핑 잔존)'
    console.log(`[${r.label}] vw=${diag.vw} docW=${diag.docW} | 클리핑(BAD)=${diag.clippedCount} 스크롤가능(OK)=${diag.scrollableCount} → ${verdict}`)
    for (const c of diag.clipped) console.log(`   CLIPPED <${c.tag} class="${c.cls}"> right=${c.right} "${c.text}"`)
    await page.screenshot({ path: `${QA}/mobile-${r.label}.png`, fullPage: true })
  }
  await b.close(); console.log('DIAG_DONE')
})().catch((e) => { console.error('DIAG_FAIL', e); process.exit(1) })
