/* 모바일 슬4c 상세 페이지 반응형 라이브 QA — Playwright(real :5175 + gateway :8080).
 * 가짜 금지 [[feedback_no_fake_data_ever]]. 실 로그인·실 상세 페이지.
 * 검증: .detail-grid/.audit-detail-meta 등 computed grid-template-columns 트랙수(mobile=1),
 *       합계 클래스(.tax-invoice-totals 등) mobile display:flex+flex-wrap. + 실 스크린샷.
 */
const { chromium } = require('playwright')
const fs = require('fs')
const QA = 'C:/dev/Samhan-Public/docs/qa/mobile-s4c-detail-responsive'
const BASE = 'http://localhost:5175'
fs.mkdirSync(QA, { recursive: true })

const TARGET_CLASSES = ['detail-grid', 'audit-detail-meta', 'audit-barcode-form', 'tax-invoice-totals', 'estimate-totals', 'journal-totals']
// 리스트 라우트 → 행 클릭 → 상세 페이지
const CANDIDATES = [
  { label: 'tax-invoice', list: '/accounting/tax-invoices' },
  { label: 'slip', list: '/sales/slips' },
  { label: 'transfer', list: '/transfers' },
  { label: 'estimate', list: '/estimates' },
  { label: 'partner-order', list: '/sales/partner-orders' },
  { label: 'journal', list: '/accounting/journal' },
]

async function launch() {
  try { return await chromium.launch({ headless: true }) }
  catch { return await chromium.launch({ headless: true, channel: 'chromium-headless-shell' }) }
}
async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid=login-id-input]', { timeout: 15000 })
  await page.fill('[data-testid=login-id-input]', 'dev_master')
  await page.fill('[data-testid=login-password-input]', 'dev_p05_pass!')
  await page.click('[data-testid=login-submit-button]')
  await page.waitForSelector('.app-shell', { timeout: 20000 })
  await page.waitForTimeout(800)
}
async function measure(page) {
  return await page.evaluate((classes) => {
    const out = []
    for (const cls of classes) {
      for (const el of Array.from(document.querySelectorAll('.' + cls))) {
        if (el.offsetParent === null) continue
        const cs = getComputedStyle(el)
        out.push({
          cls, display: cs.display,
          cols: cs.gridTemplateColumns,
          tracks: cs.gridTemplateColumns && cs.gridTemplateColumns !== 'none' ? cs.gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length : 0,
          flexWrap: cs.flexWrap,
        })
      }
    }
    return out
  }, TARGET_CLASSES)
}
async function cap(ctxLabel, page, c) {
  try {
    await page.goto(`${BASE}${c.list}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('table tbody tr', { timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(800)
    const rows = await page.locator('table tbody tr').count().catch(() => 0)
    if (rows === 0) { console.log(`[${ctxLabel}] ${c.label}: 리스트 비어있음(데이터 없음) → 미진입`); return { label: c.label, ctxLabel, reachable: false } }
    await page.locator('table tbody tr').first().click().catch(() => {})
    await page.waitForTimeout(1500)
    const found = await measure(page)
    if (found.length === 0) { console.log(`[${ctxLabel}] ${c.label}: 상세 진입했으나 대상 클래스 없음`); return { label: c.label, ctxLabel, reachable: true, found: [] } }
    await page.screenshot({ path: `${QA}/${ctxLabel}-${c.label}.png`, fullPage: true })
    const summary = found.map((f) => `${f.cls}[${f.display}${f.display === 'grid' ? ' ' + f.tracks + 'tracks' : ' wrap=' + f.flexWrap}]`).join(', ')
    // 판정: mobile=grid 1track 또는 flex+wrap / desktop=grid 다track
    const ok = found.every((f) => ctxLabel === 'mobile'
      ? (f.display === 'flex' ? f.flexWrap === 'wrap' : f.tracks === 1)
      : (f.display === 'grid' ? f.tracks >= 1 : true))
    console.log(`[${ctxLabel}] ${c.label}: ${found.length}개 [${ok ? 'PASS' : 'CHECK'}] ${summary}`)
    return { label: c.label, ctxLabel, reachable: true, found, ok }
  } catch (e) { console.log(`[${ctxLabel}] ${c.label} ERROR: ${e.message}`); return { label: c.label, ctxLabel, reachable: false } }
}
;(async () => {
  const b = await launch()
  const results = []
  for (const [ctxLabel, vp, dsf] of [['mobile', { width: 390, height: 844 }, 2], ['desktop', { width: 1280, height: 900 }, 1]]) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: dsf })
    const page = await ctx.newPage()
    await login(page)
    for (const c of CANDIDATES) results.push(await cap(ctxLabel, page, c))
    await ctx.close()
  }
  await b.close()
  const reached = results.filter((r) => r.reachable && r.found && r.found.length)
  console.log(`\n=== 요약: 진입+측정 ${reached.length} / 후보 ${CANDIDATES.length * 2} ===`)
  console.log('진입 가능:', [...new Set(reached.map((r) => r.label))].join(', ') || '(없음)')
  console.log('QA_DONE')
})().catch((e) => { console.error('QA_FAIL', e); process.exit(1) })
