const { resolveQaCredential } = require('../../../scripts/lib/qa-credentials.cjs')
/* 모바일 슬2 반응형 셸 Drawer 라이브 QA — Playwright 직접(real server :5175 + gateway :8080).
 * 가짜 금지 [[feedback_no_fake_data_ever]]. 실 로그인/실 화면/실 Drawer 캡처.
 */
const { chromium } = require('playwright')
const path = require('path')
const { resolveQaShotsDir } = require('../../../scripts/lib/qa-shots-dir.cjs')
// 절대경로 하드코딩 제거 + _local 격리(2026-07-26 하네스 재수렴 라운드 G3).
const QA = resolveQaShotsDir(path.resolve(__dirname, '../../../docs/qa/mobile-s2-responsive-shell'))
const BASE = 'http://localhost:5175'

async function launch() {
  try { return await chromium.launch({ headless: true }) }
  catch (e) { return await chromium.launch({ headless: true, channel: 'chromium-headless-shell' }) }
}

async function login(page) {
  // 이 하네스(:5175)는 HashRouter — 해시 필수(2026-07-26 하네스 재수렴 라운드 G5 실측).
  await page.goto(`${BASE}/#/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid=login-id-input]', { timeout: 15000 })
  await page.fill('[data-testid=login-id-input]', 'dev_master')
  await page.fill('[data-testid=login-password-input]', (resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')))
  await page.click('[data-testid=login-submit-button]')
  await page.waitForSelector('.app-shell', { timeout: 20000 })
  await page.waitForTimeout(1200)
}

(async () => {
  const browser = await launch()
  const log = (s) => console.log(s)

  // ===== 모바일 390x844 =====
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  const mp = await mctx.newPage()
  await login(mp)
  // 홈: 햄버거 보임 + 사이드바(Drawer) 닫힘
  const hamburgerVisible = await mp.isVisible('[data-testid=app-drawer-toggle]')
  const sidebarOpenBefore = await mp.locator('.app-sidebar.is-open').count()
  await mp.screenshot({ path: `${QA}/S1-mobile-home-hamburger.png` })
  log(`1. 모바일 홈: 햄버거 보임=${hamburgerVisible} drawer닫힘(is-open=${sidebarOpenBefore})`)
  // 햄버거 클릭 → Drawer 열림
  await mp.click('[data-testid=app-drawer-toggle]')
  await mp.waitForSelector('.app-sidebar.is-open', { timeout: 5000 })
  await mp.waitForTimeout(500)
  const backdropOpen = await mp.locator('.app-drawer-backdrop.is-open').count()
  const cat판매 = await mp.isVisible('[data-testid=sidebar-category-toggle-판매]')
  await mp.screenshot({ path: `${QA}/S2-mobile-drawer-open.png` })
  log(`2. Drawer 열림: 백드롭=${backdropOpen} 7분류(판매 보임)=${cat판매}`)
  // 가로 overflow 0 검증
  const noHOverflow = await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
  log(`3. 가로 overflow 없음=${noHOverflow} (scrollWidth=${await mp.evaluate(() => document.documentElement.scrollWidth)}, inner=${await mp.evaluate(() => window.innerWidth)})`)
  // 카테고리 펼침(7분류 동작 확인) → 네비 발생 링크(알림) 클릭 → 라우트 이동 + Drawer 자동 닫힘
  await mp.click('[data-testid=sidebar-category-toggle-판매]')
  await mp.waitForTimeout(400)
  await mp.click('[data-testid=sidebar-notifications]')   // 알림 내역 NavLink(→/notifications, 네비 발생)
  await mp.waitForTimeout(1000)
  const sidebarOpenAfterNav = await mp.locator('.app-sidebar.is-open').count()
  await mp.screenshot({ path: `${QA}/S3-mobile-after-nav-closed.png` })
  log(`4. 알림 링크 이동 후 url=${mp.url().replace(BASE, '')} Drawer자동닫힘(is-open=${sidebarOpenAfterNav})`)
  // 재오픈 → 백드롭 클릭 닫힘 → 재오픈 → ESC 닫힘
  await mp.click('[data-testid=app-drawer-toggle]'); await mp.waitForTimeout(400)
  await mp.click('[data-testid=app-drawer-backdrop]', { position: { x: 350, y: 400 } }); await mp.waitForTimeout(400)
  const afterBackdrop = await mp.locator('.app-sidebar.is-open').count()
  await mp.click('[data-testid=app-drawer-toggle]'); await mp.waitForTimeout(400)
  await mp.keyboard.press('Escape'); await mp.waitForTimeout(400)
  const afterEsc = await mp.locator('.app-sidebar.is-open').count()
  log(`5. 백드롭닫힘(is-open=${afterBackdrop}) · ESC닫힘(is-open=${afterEsc})`)
  await mctx.close()

  // ===== 데스크탑 1280x800 (무회귀) =====
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const dp = await dctx.newPage()
  await login(dp)
  const dHamburger = await dp.isVisible('[data-testid=app-drawer-toggle]')
  const dSidebar = await dp.isVisible('.app-sidebar')
  await dp.screenshot({ path: `${QA}/S4-desktop-static-sidebar.png` })
  log(`6. 데스크탑(1280): 햄버거숨김=${!dHamburger} 사이드바정적노출=${dSidebar}`)
  await dctx.close()

  await browser.close()
  console.log('QA_DONE')
})().catch((e) => { console.error('QA_FAIL', e); process.exit(1) })
