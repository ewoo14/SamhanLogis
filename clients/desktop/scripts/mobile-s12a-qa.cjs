/* 모바일 슬12a 라이브 QA — raw table→DataTable 카드화 4화면 검증.
 * mobile 390px: 카드 렌더·넓은 TABLE 클립 사라짐·행클릭 상세진입. desktop 1280px: 컬럼 테이블 무회귀.
 * 실 :5175 + gateway :8080, dev_master. 가짜 금지.
 */
const { chromium } = require('playwright')
const fs = require('fs')
const OUT = 'C:/Users/ewoo2/AppData/Local/Temp/claude/C--dev-Samhan-Public/9744a131-9548-4ad7-9355-bf2c72bcd53c/scratchpad/mobile-audit-s12a'
const BASE = 'http://localhost:5175'
fs.mkdirSync(OUT, { recursive: true })
const TARGETS = [
  { label: 'partner-orders', path: '/sales/partner-orders', rowClick: true },
  { label: 'order-approvals', path: '/sales/order-approvals' },
  { label: 'notifications', path: '/notifications' },
  { label: 'manual-dispatch', path: '/arologis/admin/manual-dispatch' },
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
  await page.fill('[data-testid=login-password-input]', (process.env.DEV_PASSWORD ?? ''))
  await page.click('[data-testid=login-submit-button]')
  await page.waitForSelector('.app-shell', { timeout: 20000 })
  await page.waitForTimeout(700)
}
// 뷰포트 넘어 클립된 넓은 요소(sr-only thead·absolute 제외)
async function probe(page) {
  return await page.evaluate(() => {
    const innerW = window.innerWidth
    const pageScrollW = document.documentElement.scrollWidth
    const bad = []
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('thead')) continue
      const cs = getComputedStyle(el)
      if (cs.position === 'absolute' || cs.position === 'fixed') continue
      if (cs.visibility === 'hidden' || cs.display === 'none') continue
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.right > innerW + 3) bad.push({ tag: el.tagName, cls: String(el.className || '').slice(0, 44), right: Math.round(r.right), w: Math.round(r.width) })
    }
    bad.sort((a, b) => b.right - a.right)
    return { innerW, hOverflow: pageScrollW > innerW + 3, overBy: pageScrollW - innerW, worst: bad.slice(0, 2) }
  })
}
async function run(ctxLabel, page) {
  const res = []
  for (const t of TARGETS) {
    const r = { ctx: ctxLabel, label: t.label, path: t.path }
    try {
      // 이 하네스(:5175)는 HashRouter — 해시 없는 goto 는 조용히 홈으로 낙착해 rows=0 인데도
      // 성공으로 보고된다(2026-07-26 하네스 재수렴 라운드 G5 실측). 아래 REDIRECT 감지는
      // 원래도 있었지만 상태 필드에만 기록되고 종료코드에 반영되지 않아 "감지=게이트" 가
      // 아니었다 — 이제 해시 경로 이탈은 throw 로 승격한다. ⚠️ 아래 단언이 재는 것은 URL
      // 문자열이지 실제 화면 도달이 아니다(2026-07-27 재수렴 5차 X3) — BrowserRouter 하네스로
      // 오기동하면 해시가 URL 에 남은 채 대시보드로 낙착해 rows=0 인데도 통과한다.
      await page.goto(`${BASE}/#${t.path}`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(1400)
      r.url = page.url()
      if (!r.url.includes(`/#${t.path}`)) {
        throw new Error(`해시 경로 이탈 — 기대=#${t.path} 실제=${r.url}`)
      }
      if (/\/login(\?|$)/.test(r.url)) r.status = 'REDIRECT_LOGIN'
      r.rows = await page.locator('table tbody tr').count().catch(() => 0)
      r.theadCols = await page.locator('table thead th').count().catch(() => 0)
      Object.assign(r, await probe(page))
      await page.screenshot({ path: `${OUT}/${ctxLabel}-${t.label}.png`, fullPage: true }).catch(() => {})
      if (ctxLabel === 'mobile' && t.rowClick && r.rows > 0) {
        const before = page.url()
        await page.locator('table tbody tr').first().click().catch(() => {})
        await page.waitForTimeout(1400)
        r.rowClickNav = page.url() !== before
        r.afterUrl = page.url().replace(BASE, '')
        await page.screenshot({ path: `${OUT}/${ctxLabel}-${t.label}-detail.png`, fullPage: true }).catch(() => {})
      }
    } catch (e) { r.error = e.message }
    res.push(r)
  }
  return res
}
;(async () => {
  const b = await launch(); const all = []
  for (const [ctxLabel, vp, dsf] of [['mobile', { width: 390, height: 844 }, 2], ['desktop', { width: 1280, height: 900 }, 1]]) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: dsf })
    const page = await ctx.newPage(); await login(page)
    all.push(...await run(ctxLabel, page)); await ctx.close()
  }
  await b.close()
  console.log('\n=== 슬12a 라이브 QA (mobile 390 / desktop 1280) ===')
  for (const r of all) {
    const flag = r.error ? 'ERR' : (/REDIRECT/.test(r.status || '') ? r.status : (r.hOverflow ? `오버플로+${r.overBy}px` : 'OK'))
    const wt = r.worst && r.worst.length ? ` worst=${JSON.stringify(r.worst[0])}` : ''
    const rc = r.rowClickNav !== undefined ? ` rowClick=${r.rowClickNav}(${r.afterUrl})` : ''
    console.log(`[${r.ctx}] ${r.label} rows=${r.rows} thead=${r.theadCols} | ${flag}${wt}${rc}${r.error ? ' ' + r.error : ''}`)
  }
  if (all.some((r) => r.error)) {
    console.error('QA_FAIL_PARTIAL', JSON.stringify(all.filter((r) => r.error).map((r) => `${r.ctx}/${r.label}`)))
    process.exit(1)
  }
  console.log('QA_DONE')
})().catch((e) => { console.error('QA_FAIL', e); process.exit(1) })
