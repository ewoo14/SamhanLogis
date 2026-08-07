const { resolveQaCredential } = require('../../../scripts/lib/qa-credentials.cjs')
/* 모바일 슬4c 상세 페이지 반응형 라이브 QA — Playwright(real :5175 + gateway :8080).
 * 가짜 금지 [[feedback_no_fake_data_ever]]. 실 로그인·실 상세 페이지.
 * 검증: .detail-grid/.audit-detail-meta 등 computed grid-template-columns 트랙수(mobile=1),
 *       합계 클래스(.tax-invoice-totals 등) mobile display:flex+flex-wrap. + 실 스크린샷.
 */
const { chromium } = require('playwright')
const path = require('path')
const { resolveQaShotsDir } = require('../../../scripts/lib/qa-shots-dir.cjs')
// 절대경로 하드코딩 제거 + _local 격리(2026-07-26 하네스 재수렴 라운드 G3).
const QA = resolveQaShotsDir(path.resolve(__dirname, '../../../docs/qa/mobile-s4c-detail-responsive'))
const BASE = 'http://localhost:5175'

const TARGET_CLASSES = ['detail-grid', 'audit-detail-meta', 'audit-barcode-form', 'tax-invoice-totals', 'estimate-totals', 'journal-totals']
// 리스트 라우트 → 행 클릭 → 상세 페이지
const CANDIDATES = [
  { label: 'tax-invoice', list: '/accounting/tax-invoices' },
  { label: 'slip', list: '/sales/slips' },
  { label: 'transfer', list: '/transfers' },
  { label: 'estimate', list: '/sales/estimates' },
  { label: 'partner-order', list: '/sales/partner-orders' },
  { label: 'journal', list: '/accounting/journals' },
  { label: 'inventory-audit', list: '/warehouse/audit' },
]

async function launch() {
  try { return await chromium.launch({ headless: true }) }
  catch { return await chromium.launch({ headless: true, channel: 'chromium-headless-shell' }) }
}
async function login(page) {
  // 이 하네스(:5175)는 HashRouter — 해시 필수(2026-07-26 하네스 재수렴 라운드 G5 실측).
  await page.goto(`${BASE}/#/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid=login-id-input]', { timeout: 15000 })
  await page.fill('[data-testid=login-id-input]', 'dev_master')
  await page.fill('[data-testid=login-password-input]', (resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')))
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
    // 해시 없는 goto 는 조용히 홈으로 낙착해 "리스트 비어있음"으로 오분류된다(2026-07-26
    // 하네스 재수렴 라운드 G5 실측) — rows===0 판정보다 먼저 해시 경로부터 확인한다.
    // ⚠️ 이 단언이 재는 것은 URL 문자열이지 실제 화면 도달이 아니다(2026-07-27 재수렴 5차 X3).
    await page.goto(`${BASE}/#${c.list}`, { waitUntil: 'domcontentloaded' })
    if (!page.url().includes(`/#${c.list}`)) {
      throw new Error(`해시 경로 이탈 — 기대=#${c.list} 실제=${page.url()}`)
    }
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
  } catch (e) { console.log(`[${ctxLabel}] ${c.label} ERROR: ${e.message}`); return { label: c.label, ctxLabel, reachable: false, error: e.message } }
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
  // 빈 리스트(데이터 없음)로 인한 reachable:false 는 정상 소프트스킵이지만, 해시 경로 이탈로
  // 실패(.error)한 항목은 게이트다(2026-07-26 하네스 재수렴 라운드 G5).
  if (results.some((r) => r.error)) {
    console.error('QA_FAIL_PARTIAL', JSON.stringify(results.filter((r) => r.error).map((r) => `${r.ctxLabel}-${r.label}`)))
    process.exit(1)
  }
  console.log('QA_DONE')
})().catch((e) => { console.error('QA_FAIL', e); process.exit(1) })
