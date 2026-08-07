/* 모바일 슬4a 공용 Modal 풀스크린 라이브 QA — Playwright(real :5175 + gateway :8080).
 * 가짜 금지 [[feedback_no_fake_data_ever]]. 실 로그인·실 모달 풀스크린 캡처.
 */
const { chromium } = require('playwright')
const path = require('path')
const { resolveQaShotsDir } = require('../../../scripts/lib/qa-shots-dir.cjs')
// 절대경로 하드코딩 제거 + _local 격리(2026-07-26 하네스 재수렴 라운드 G3).
const QA = resolveQaShotsDir(path.resolve(__dirname, '../../../docs/qa/mobile-s4a-modal-fullscreen'))
const BASE = 'http://localhost:5175'
async function launch() { try { return await chromium.launch({ headless: true }) } catch { return await chromium.launch({ headless: true, channel: 'chromium-headless-shell' }) } }
async function login(page) {
  // 이 하네스(:5175)는 HashRouter — 해시 필수(2026-07-26 하네스 재수렴 라운드 G5 실측).
  await page.goto(`${BASE}/#/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid=login-id-input]', { timeout: 15000 })
  await page.fill('[data-testid=login-id-input]', 'dev_master')
  await page.fill('[data-testid=login-password-input]', (process.env.DEV_PASSWORD ?? ''))
  await page.click('[data-testid=login-submit-button]')
  await page.waitForSelector('.app-shell', { timeout: 20000 }); await page.waitForTimeout(1000)
}
async function openAndShoot(page, label, file, trigger, navPath = '/admin/partners', waitSel = 'table tbody tr', afterOpen = null) {
  await page.goto(`${BASE}/#${navPath}`, { waitUntil: 'domcontentloaded' })
  // ⚠️ 이 단언이 재는 것은 URL 문자열이지 실제 화면 도달이 아니다(2026-07-27 재수렴 5차 X3).
  // 잡는 것은 "작성자가 `/#` 를 빠뜨렸다" 뿐 — 실 도달 측정은 페이지별 DOM 마커 단언이 필요하다.
  if (!page.url().includes(`/#${navPath}`)) {
    throw new Error(`${label} 해시 경로 이탈 — 기대=#${navPath} 실제=${page.url()}`)
  }
  await page.waitForSelector(waitSel, { timeout: 15000 }); await page.waitForTimeout(1500)
  await trigger(page)
  if (afterOpen) { try { await afterOpen(page) } catch {} }
  const dlg = page.locator('[role=dialog]').first()
  await dlg.waitFor({ state: 'visible', timeout: 10000 })
  await page.waitForTimeout(800)
  const box = await dlg.boundingBox().catch(() => null)
  const vp = page.viewportSize()
  const close = await page.locator('[aria-label=닫기]').first().isVisible().catch(() => false)
  await page.screenshot({ path: `${QA}/${file}`, fullPage: false })
  const fillW = box ? (box.width / vp.width) : 0
  const fillH = box ? (box.height / vp.height) : 0
  console.log(`${label}: dialogW=${box ? Math.round(box.width) : '?'}/${vp.width}(${(fillW*100).toFixed(0)}%) H=${box ? Math.round(box.height) : '?'}/${vp.height}(${(fillH*100).toFixed(0)}%) 닫기보임=${close}`)
}
(async () => {
  const b = await launch()
  // 모바일 390 — 풀스크린
  const m = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage()
  await login(m)
  await openAndShoot(m, '1.모바일 거래처상세(풀스크린)', 'M1-mobile-partner-detail-fullscreen.png',
    async (p) => { await p.locator('table tbody tr').first().click() })
  await openAndShoot(m, '6.모바일 탭 가로스크롤(비전이력 도달)', 'M6-mobile-tabs-scroll.png',
    async (p) => { await p.locator('table tbody tr').first().click() },
    '/admin/partners', 'table tbody tr',
    async (p) => {
      const tl = p.locator('[role=tablist]').first()
      const info = await tl.evaluate((el) => { const sw = el.scrollWidth, cw = el.clientWidth; el.scrollLeft = sw; return { sw, cw } }).catch(() => null)
      if (info) console.log(`   탭바 scrollWidth=${info.sw} clientWidth=${info.cw} 가로스크롤필요=${info.sw > info.cw + 1}`)
      await p.waitForTimeout(500)
    })
  await openAndShoot(m, '4.모바일 CSV업로드(풀스크린·④보완)', 'M4-mobile-csv-upload-fullscreen.png',
    async (p) => { await p.click('[data-testid=admin-regions-import-button]') },
    '/admin/regions', '[data-testid=admin-regions-import-button]')
  await openAndShoot(m, '5.모바일 창고편집 자체dialog(풀스크린·⑤보완)', 'M5-mobile-warehouse-edit-fullscreen.png',
    async (p) => { await p.locator('[data-testid^=admin-warehouses-edit-]').first().click() },
    '/admin/warehouses', '[data-testid^=admin-warehouses-edit-]')
  await m.context().close()
  // 데스크탑 1280 — 중앙 카드
  const d = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
  await login(d)
  await openAndShoot(d, '3.데스크탑 거래처상세(중앙카드)', 'M3-desktop-partner-detail-centered.png',
    async (p) => { await p.locator('table tbody tr').first().click() })
  await d.context().close()
  await b.close(); console.log('QA_DONE')
})().catch((e) => { console.error('QA_FAIL', e); process.exit(1) })
