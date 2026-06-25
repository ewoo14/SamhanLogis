/* 모바일 슬4b 입력 폼 1열(공용 FormGrid) 라이브 QA — Playwright(real :5175 + gateway :8080).
 * 가짜 금지 [[feedback_no_fake_data_ever]]. 실 로그인·실 폼 캡처 + computed grid-template-columns 트랙 수로
 * 1열(mobile ≤768px)/2열(desktop >768px) ground-truth 측정(false-RED 회피 [[feedback_realqa_run_and_false_red]]).
 */
const { chromium } = require('playwright')
const fs = require('fs')
const QA = 'C:/dev/Samhan-Public/docs/qa/mobile-s4b-form-grid'
const BASE = 'http://localhost:5175'
fs.mkdirSync(QA, { recursive: true })

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
  await page.waitForTimeout(1000)
}
// --fg-cols 인라인 변수를 가진 visible div 의 computed grid-template-columns 트랙 수 측정
async function measureGrids(page) {
  return await page.evaluate(() => {
    return Array.from(document.querySelectorAll('div[style*="--fg-cols"]'))
      .filter((el) => el.offsetParent !== null)
      .map((el) => {
        const cs = getComputedStyle(el)
        const tracks = cs.gridTemplateColumns.trim().split(/\s+/).filter(Boolean)
        return {
          fgCols: el.style.getPropertyValue('--fg-cols').trim(),
          computed: cs.gridTemplateColumns,
          trackCount: tracks.length,
        }
      })
  })
}
async function capForm(ctxLabel, page, name, navPath, opener, waitSel) {
  try {
    await page.goto(`${BASE}${navPath}`, { waitUntil: 'domcontentloaded' })
    if (waitSel) await page.waitForSelector(waitSel, { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(1200)
    if (opener) { try { await opener(page) } catch (e) { console.log(`   opener fail ${name}: ${e.message}`) } }
    await page.waitForTimeout(900)
    const grids = await measureGrids(page)
    const expected = ctxLabel === 'mobile' ? 1 : '>=2'
    const ok = grids.length > 0 && grids.every((g) => ctxLabel === 'mobile' ? g.trackCount === 1 : g.trackCount >= 2)
    console.log(`[${ctxLabel}] ${name}: FormGrid ${grids.length}개, 기대트랙=${expected}, 판정=${grids.length === 0 ? 'NO-GRID' : ok ? 'PASS' : 'FAIL'} ${JSON.stringify(grids.map((g) => ({ fgCols: g.fgCols, tracks: g.trackCount, computed: g.computed })))}`)
    await page.screenshot({ path: `${QA}/${ctxLabel}-${name}.png`, fullPage: true })
    return { name, ctxLabel, grids, ok: grids.length > 0 && ok }
  } catch (e) { console.log(`[${ctxLabel}] ${name} ERROR: ${e.message}`); return { name, ctxLabel, grids: [], ok: false } }
}
;(async () => {
  const b = await launch()
  const results = []
  for (const [ctxLabel, vp, dsf] of [['mobile', { width: 390, height: 844 }, 2], ['desktop', { width: 1280, height: 900 }, 1]]) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: dsf })
    const page = await ctx.newPage()
    await login(page)
    // 1. 거래처 등록 (직접 라우트, 데이터 불요 — 핵심 증명)
    results.push(await capForm(ctxLabel, page, 'partner-create', '/admin/partners/new', null, 'form'))
    // 2. 창고 편집 모달 (s4a 검증 패턴)
    results.push(await capForm(ctxLabel, page, 'warehouse-edit', '/admin/warehouses',
      async (p) => { await p.locator('[data-testid^=admin-warehouses-edit-]').first().click(); await p.locator('[role=dialog]').first().waitFor({ state: 'visible', timeout: 8000 }) },
      '[data-testid^=admin-warehouses-edit-]'))
    // 3. 거래처 상세 편집 다이얼로그 (행클릭 → 편집모드)
    results.push(await capForm(ctxLabel, page, 'partner-detail', '/admin/partners',
      async (p) => {
        await p.locator('table tbody tr').first().click()
        await p.locator('[role=dialog]').first().waitFor({ state: 'visible', timeout: 8000 })
        const edit = p.getByRole('button', { name: /편집|수정/ }).first()
        if (await edit.isVisible().catch(() => false)) { await edit.click().catch(() => {}); await p.waitForTimeout(600) }
      },
      'table tbody tr'))
    // 4. 공급자 설정 (직접 라우트 → 등록/편집 모달 시도)
    results.push(await capForm(ctxLabel, page, 'supplier-profile', '/accounting/supplier-profiles',
      async (p) => { const btn = p.getByRole('button', { name: /등록|편집|수정|설정/ }).first(); if (await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); await p.waitForTimeout(800) } },
      null))
    await ctx.close()
  }
  await b.close()
  const fails = results.filter((r) => !r.ok)
  console.log(`\n=== 요약: ${results.length - fails.length}/${results.length} PASS ===`)
  if (fails.length) console.log('미통과/미발견:', fails.map((r) => `${r.ctxLabel}-${r.name}`).join(', '))
  console.log('QA_DONE')
})().catch((e) => { console.error('QA_FAIL', e); process.exit(1) })
