/* 모바일 잔여 백로그 라이브 검수 — Playwright (real :5175 web + :8080 gateway, mock OFF).
 * 가짜 금지 [[feedback_no_fake_data_ever]]. 실 로그인(dev_master)·실 데이터·실 화면.
 * 목적: (A) 병합 완료분 모바일 기능 동작 확인(드로어 클릭/네비/리스트→상세)
 *       (B) 조사로 드러난 갭 라이브 확증(가로 오버플로 측정, sr-only thead 아티팩트 제외).
 * 단일 mobile 뷰포트(390x844). 데스크탑 무회귀는 병합 PR에서 검증됨.
 */
const { chromium } = require('playwright')
const fs = require('fs')
const OUT = 'C:/Users/ewoo2/AppData/Local/Temp/claude/C--dev-Samhan-Public/9744a131-9548-4ad7-9355-bf2c72bcd53c/scratchpad/mobile-audit'
const BASE = 'http://localhost:5175'
fs.mkdirSync(OUT, { recursive: true })

async function launch() {
  try { return await chromium.launch({ headless: true }) }
  catch { return await chromium.launch({ headless: true, channel: 'chromium-headless-shell' }) }
}
async function login(page) {
  // 이 하네스(:5175)는 HashRouter — 해시 필수(2026-07-26 하네스 재수렴 라운드 G5 실측).
  await page.goto(`${BASE}/#/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid=login-id-input]', { timeout: 15000 })
  await page.fill('[data-testid=login-id-input]', 'dev_master')
  await page.fill('[data-testid=login-password-input]', 'dev_p05_pass!')
  await page.click('[data-testid=login-submit-button]')
  await page.waitForSelector('.app-shell', { timeout: 20000 })
  await page.waitForTimeout(800)
}
// 페이지 가로 오버플로 + 위반 엘리먼트 (sr-only thead·absolute/fixed 제외 → false-positive 회피)
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
      if (r.width > 0 && r.right > innerW + 3) {
        bad.push({ tag: el.tagName, cls: String(el.className || '').slice(0, 48), right: Math.round(r.right), w: Math.round(r.width) })
      }
    }
    bad.sort((a, b) => b.right - a.right)
    return { innerW, pageScrollW, hOverflow: pageScrollW > innerW + 3, overBy: pageScrollW - innerW, worst: bad.slice(0, 3) }
  })
}
async function visit(page, label, path, wait = 1400) {
  const r = { label, path }
  try {
    // 이 하네스(:5175)는 HashRouter — 해시 없는 goto 는 조용히 홈으로 낙착해 rows=0 인데도
    // 성공으로 보고된다(2026-07-26 하네스 재수렴 라운드 G5 실측: mobile-s3-datatable-card-qa.cjs
    // 와 동일 계열 결함).
    await page.goto(`${BASE}/#${path}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(wait)
    r.url = page.url()
    if (!r.url.includes(`/#${path}`)) {
      throw new Error(`해시 경로 이탈 — 기대=#${path} 실제=${r.url}`)
    }
    if (/\/login(\?|$)/.test(r.url)) r.status = 'REDIRECT_LOGIN'
    r.rows = await page.locator('table tbody tr').count().catch(() => 0)
    Object.assign(r, await probe(page))
    await page.screenshot({ path: `${OUT}/${label}.png`, fullPage: true }).catch(() => {})
  } catch (e) { r.error = e.message }
  return r
}
;(async () => {
  const b = await launch()
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await login(page)
  const results = []

  // === A. 드로어 네비 기능 동작 (슬2) ===
  const drawer = { label: 'A-drawer', path: '/' }
  try {
    // 빈 해시도 명시한다 — 드로어 자체는 화면 무관이라 도달 대상은 홈이면 충분하지만,
    // 해시 생략은 이 하네스(HashRouter)에서 "명시적으로 검증되지 않은 낙착"이라 가드가
    // 구분하지 못한다(2026-07-26 하네스 재수렴 라운드 G5 — 의미상 동작 변화 없음).
    await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1000)
    await page.screenshot({ path: `${OUT}/A-home.png`, fullPage: true }).catch(() => {})
    const toggle = page.locator('.app-drawer-toggle')
    drawer.toggleVisible = await toggle.isVisible().catch(() => false)
    if (drawer.toggleVisible) {
      await toggle.click(); await page.waitForTimeout(500)
      drawer.drawerVisible = await page.locator('#app-drawer').isVisible().catch(() => false)
      drawer.navLinks = await page.locator('#app-drawer a').count().catch(() => 0)
      await page.screenshot({ path: `${OUT}/A-drawer-open.png` }).catch(() => {})
      const before = page.url()
      await page.locator('#app-drawer a').nth(1).click().catch(() => {}); await page.waitForTimeout(1200)
      drawer.navigated = page.url() !== before
      drawer.afterUrl = page.url()
      drawer.drawerClosedAfterNav = !(await page.locator('#app-drawer').isVisible().catch(() => true))
    }
  } catch (e) { drawer.error = e.message }
  results.push(drawer)

  // === B. 병합 완료분 (모바일 OK 기대: 오버플로 0 / 기능 동작) ===
  results.push(await visit(page, 'B-list-slips', '/sales/slips'))
  results.push(await visit(page, 'B-list-taxinvoices', '/accounting/tax-invoices'))
  results.push(await visit(page, 'B-form-partner-new', '/admin/partners/new'))  // 슬4b FormGrid 1열
  // 리스트→행클릭→상세 (슬4c 모바일-퍼스트)
  const detail = { label: 'B-detail-slip', path: '/sales/slips→row' }
  try {
    await page.goto(`${BASE}/#/sales/slips`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1300)
    // ⚠️ 이 단언이 재는 것은 URL 문자열이지 실제 화면 도달이 아니다(2026-07-27 재수렴 5차 X3).
    if (!page.url().includes('/#/sales/slips')) {
      throw new Error(`해시 경로 이탈 — 기대=#/sales/slips 실제=${page.url()}`)
    }
    detail.rows = await page.locator('table tbody tr').count().catch(() => 0)
    if (detail.rows > 0) {
      await page.locator('table tbody tr').first().click().catch(() => {}); await page.waitForTimeout(1600)
      detail.url = page.url()
      detail.mobilePrimitives = await page.locator('[class*=mobile-]').count().catch(() => 0)
      Object.assign(detail, await probe(page))
      await page.screenshot({ path: `${OUT}/B-detail-slip.png`, fullPage: true }).catch(() => {})
    }
  } catch (e) { detail.error = e.message }
  results.push(detail)

  // === C. 갭 확증 (모바일 미대응/오버플로 기대) ===
  results.push(await visit(page, 'C-gap-partner-orders', '/sales/partner-orders'))     // raw table 주문서관리
  results.push(await visit(page, 'C-gap-statement-batch', '/accounting/statement-batch')) // 거래명세서 no-wrapper
  results.push(await visit(page, 'C-gap-permission-matrix', '/admin/permission-matrix'))   // 권한 매트릭스
  results.push(await visit(page, 'C-gap-dps-compare', '/warehouse/dps-compare'))         // DPS raw table
  results.push(await visit(page, 'C-gap-estimate-form', '/sales/estimates/new'))         // 미이관 폼

  await ctx.close(); await b.close()

  console.log('\n=== 모바일 백로그 라이브 검수 결과 (390px, dev_master) ===')
  console.log('[A 드로어]', JSON.stringify(drawer))
  for (const r of results.slice(1)) {
    const flag = r.error ? 'ERR' : (/REDIRECT/.test(r.status || '') ? 'AUTH차단' : (r.hOverflow ? `가로오버플로 +${r.overBy}px` : 'OK(오버플로0)'))
    const worst = r.worst && r.worst.length ? ` worst=${JSON.stringify(r.worst[0])}` : ''
    console.log(`[${r.label}] ${r.path} → rows=${r.rows ?? '-'} | ${flag}${worst}${r.mobilePrimitives !== undefined ? ' mobilePrim=' + r.mobilePrimitives : ''}${r.error ? ' ' + r.error : ''}`)
  }
  // 해시 경로 이탈(URL 문자열 검사 throw 로 만든 r.error 포함)이 하나라도 있으면 QA_DONE 을
  // 찍지 않는다 — "이탈해도 성공 종료" 는 게이트가 아니다(2026-07-26 하네스 재수렴 라운드 G5).
  if (results.some((r) => r.error)) {
    console.error('QA_FAIL_PARTIAL', JSON.stringify(results.filter((r) => r.error).map((r) => r.label)))
    process.exit(1)
  }
  console.log('QA_DONE')
})().catch((e) => { console.error('QA_FAIL', e); process.exit(1) })
