/* 모바일 슬3 DataTable 카드화 라이브 QA — Playwright(real server :5175 + gateway :8080).
 * 가짜 금지 [[feedback_no_fake_data_ever]]. 실 로그인·실 리스트 데이터·실 카드 캡처.
 */
const { chromium } = require('playwright')
const path = require('path')
const { resolveQaShotsDir } = require('../../../scripts/lib/qa-shots-dir.cjs')
// 절대경로 하드코딩 제거 + _local 격리(2026-07-26 하네스 재수렴 라운드 G3).
const QA = resolveQaShotsDir(path.resolve(__dirname, '../../../docs/qa/mobile-s3-datatable-card'))
const BASE = 'http://localhost:5175'

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
  await page.waitForTimeout(1000)
}
async function capture(page, path, file, label) {
  // 해시 없는 goto 는 조용히 홈으로 낙착해 rows=0 인데도 QA_DONE 으로 끝난다(실측:
  // "1.모바일 거래처(카드): /admin/partners rows=0" — 2026-07-26 하네스 재수렴 라운드 G5).
  await page.goto(`${BASE}/#${path}`, { waitUntil: 'domcontentloaded' })
  // DataTable(table) 또는 empty 렌더 대기
  await page.waitForTimeout(2500)
  // ⚠️ 이 단언이 재는 것은 **URL 문자열**이지 실제 화면 도달이 아니다(2026-07-27 재수렴 4차
  // X3 실행 반증). 5175 에 BrowserRouter 하네스를 대신 띄우면 앱이 해시를 무시하고 대시보드로
  // 낙착하는데도 URL 에는 해시가 남아 통과한다(rows=0 인데 QA_DONE/exit 0). 잡는 것은
  // "작성자가 `/#` 를 빠뜨렸다" 뿐이다 — 실 도달 측정은 페이지별 DOM 마커 단언이 필요하다.
  if (!page.url().includes(`/#${path}`)) {
    throw new Error(`${label} 해시 경로 이탈 — 기대=#${path} 실제=${page.url()}`)
  }
  const rows = await page.locator('table tbody tr').count().catch(() => 0)
  const noH = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
  await page.screenshot({ path: `${QA}/${file}`, fullPage: false })
  console.log(`${label}: ${path} rows=${rows} 가로overflow없음=${noH}`)
}

(async () => {
  const browser = await launch()
  // 모바일 390 — 카드
  const m = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage()
  await login(m)
  await capture(m, '/admin/partners', 'S1-mobile-partners-card.png', '1.모바일 거래처(카드)')
  await capture(m, '/sales/slips', 'S2-mobile-slips-card.png', '2.모바일 판매전표(카드)')
  await m.context().close()
  // 데스크탑 1280 — 테이블 무회귀
  const d = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
  await login(d)
  await capture(d, '/admin/partners', 'S3-desktop-partners-table.png', '3.데스크탑 거래처(테이블 무회귀)')
  const thead = await d.locator('table thead').first().isVisible().catch(() => false)
  console.log(`   데스크탑 thead(테이블 헤더) 가시=${thead}`)
  await d.context().close()
  await browser.close()
  console.log('QA_DONE')
})().catch((e) => { console.error('QA_FAIL', e); process.exit(1) })
