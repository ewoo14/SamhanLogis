const { resolveQaCredential } = require('../../../scripts/lib/qa-credentials.cjs')
/* 모바일 슬1 웹 쿠키 인증 라이브 QA — Playwright 직접 구동 (real server :5175 + gateway :8080).
 * 가짜 금지 [[feedback_no_fake_data_ever]]. 실 로그인/실 쿠키/실 화면 캡처 + 진단.
 */
const { chromium } = require('playwright')
const path = require('path')
const { resolveQaShotsDir } = require('../../../scripts/lib/qa-shots-dir.cjs')

// 절대경로 하드코딩 제거 + _local 격리(2026-07-26 하네스 재수렴 라운드 G3).
const QA = resolveQaShotsDir(path.resolve(__dirname, '../../../docs/qa/mobile-s1-foundation'))
const BASE = 'http://localhost:5175'

async function launch() {
  try {
    return await chromium.launch({ headless: true })
  } catch (e) {
    console.log('default launch failed, trying chromium-headless-shell:', e.message)
    return await chromium.launch({ headless: true, channel: 'chromium-headless-shell' })
  }
}

(async () => {
  const browser = await launch()
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
  })
  const page = await context.newPage()

  const setCookieSeen = []
  const cookieHeaderSeen = []
  const authResponses = []
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.log(`  [console.${m.type()}] ${m.text().slice(0, 200)}`) })
  page.on('pageerror', (e) => console.log(`  [pageerror] ${e.message.slice(0, 200)}`))
  page.on('requestfailed', (req) => { if (req.url().includes(':8080')) console.log(`  [requestfailed] ${req.method()} ${req.url().split(':8080')[1]} :: ${req.failure() && req.failure().errorText}`) })
  page.on('response', async (r) => {
    const url = r.url()
    if (url.includes('/auth/')) {
      let body = ''
      try { body = (await r.text()).slice(0, 120) } catch {}
      authResponses.push(`${r.request().method()} ${url.split(':8080')[1] || url} :: ${r.status()} :: ${body}`)
      const sc = (await r.headersArray()).filter((h) => h.name.toLowerCase() === 'set-cookie')
      sc.forEach((h) => setCookieSeen.push(`${url.split('/api')[1] || url} :: ${r.status()} :: ${h.value.slice(0, 80)}`))
    }
  })
  page.on('request', (req) => {
    const url = req.url()
    if (url.includes(':8080/') && (url.includes('/auth/me') || url.includes('/api/v1/'))) {
      const ck = req.headers()['cookie']
      if (ck && ck.includes('access_token')) cookieHeaderSeen.push(`${url.split(':8080')[1]} :: Cookie=access_token present`)
    }
  })

  const log = (s) => console.log(s)

  // 1) 로그인 페이지 — 이 하네스(:5175)는 HashRouter, 해시 필수(2026-07-26 G5 실측).
  await page.goto(`${BASE}/#/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid=login-id-input]', { timeout: 15000 })
  await page.screenshot({ path: `${QA}/B1-web-login-mobile.png` })
  log(`1. login page url=${page.url()} (B1 captured)`)

  // 2) 로그인 수행
  await page.fill('[data-testid=login-id-input]', 'dev_master')
  await page.fill('[data-testid=login-password-input]', (resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')))
  await page.click('[data-testid=login-submit-button]')
  log('2. submitted login')

  // 3) 홈(.app-shell) 또는 에러배너 둘 중 먼저
  let landed = 'timeout'
  try {
    await Promise.race([
      page.waitForSelector('.app-shell', { timeout: 12000 }).then(() => { landed = 'home' }),
      page.waitForSelector('.error-banner', { timeout: 12000 }).then(() => { landed = 'error-banner' }),
    ])
  } catch {}
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${QA}/B2-web-home-after-login.png` })
  log(`3. after-login landed=${landed} url=${page.url()} (B2 captured)`)
  const banner = await page.$('.error-banner')
  if (banner) log(`   error-banner text: ${(await banner.textContent()).trim().slice(0, 160)}`)

  // 4) 쿠키
  const cookies = await context.cookies()
  const at = cookies.find((c) => c.name === 'access_token')
  log(`4. cookie access_token present=${!!at}${at ? ` httpOnly=${at.httpOnly} sameSite=${at.sameSite} valuePrefix=${at.value.slice(0, 12)}` : ''}`)

  if (landed === 'home') {
    // 5) 새로고침 → /auth/me bootstrap 세션 복원
    await page.reload({ waitUntil: 'domcontentloaded' })
    let restored = false
    try { await page.waitForSelector('.app-shell', { timeout: 15000 }); restored = true } catch {}
    await page.waitForTimeout(1200)
    await page.screenshot({ path: `${QA}/B3-web-after-reload-session-restored.png` })
    log(`5. after reload restored=${restored} url=${page.url()} (B3 captured)`)

    // 6) 쿠키 삭제 → 새로고침 → 가드 /login
    await context.clearCookies()
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)
    await page.screenshot({ path: `${QA}/B4-web-no-cookie-redirect-login.png` })
    log(`6. after clear-cookie reload url=${page.url()} redirected-to-login=${page.url().includes('/login') ? 'YES' : 'NO'} (B4 captured)`)
  }

  log('--- auth 응답: ' + JSON.stringify(authResponses, null, 0))
  log('--- Set-Cookie 응답: ' + JSON.stringify(setCookieSeen))
  log('--- Cookie 요청헤더: ' + JSON.stringify(cookieHeaderSeen.slice(0, 5)))

  await browser.close()
  console.log('QA_DONE')
})().catch((e) => { console.error('QA_FAIL', e); process.exit(1) })
