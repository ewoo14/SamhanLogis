/* 첫 카드 타깃 캡처(요소 스크린샷) — fullPage 과대 회피. */
const { chromium } = require('playwright')
// 이 파일은 라우트 인자를 `path` 로 부르므로 node:path 는 다른 이름으로 불러온다.
const nodePath = require('path')
const { resolveQaShotsDir } = require('../../../scripts/lib/qa-shots-dir.cjs')
const path = process.argv[2] || '/accounting/bank-transactions'
const out = process.argv[3] || 'card-bank.png'
// 절대경로 하드코딩 제거 + _local 격리(2026-07-26 하네스 재수렴 라운드 G3).
const QA = resolveQaShotsDir(nodePath.resolve(__dirname, '../../../docs/qa/mobile-other'))
;(async () => {
  const b = await chromium.launch({ headless: true }).catch(() => chromium.launch({ headless: true, channel: 'chromium-headless-shell' }))
  const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage()
  await page.goto('http://localhost:5175/#/login', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid=login-id-input]', { timeout: 15000 })
  await page.fill('[data-testid=login-id-input]', 'dev_master')
  await page.fill('[data-testid=login-password-input]', 'dev_p05_pass!')
  await page.click('[data-testid=login-submit-button]')
  await page.waitForSelector('.app-shell', { timeout: 20000 })
  // 이 하네스(:5175, vite.renderer.dev.config.ts)는 HashRouter — 해시 없는 goto 는 조용히
  // 홈으로 낙착해 rows=0 인데도 성공 종료했다(2026-07-26 하네스 재수렴 라운드 G5 실측).
  await page.goto('http://localhost:5175/#' + path, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2200)
  if (!page.url().includes('/#' + path)) {
    throw new Error(`목표 화면 도달 실패 — 기대=#${path} 실제=${page.url()}`)
  }
  const tr = page.locator('.app-main table tbody tr').first()
  const n = await page.locator('.app-main table tbody tr').count()
  if (n === 0) { console.log('NO ROWS (무데이터)'); await b.close(); return }
  await tr.screenshot({ path: nodePath.join(QA, out) })
  console.log('CARD SHOT saved', out, 'rows=', n)
  await b.close()
})().catch((e) => { console.error('FAIL', e.message); process.exit(1) })
