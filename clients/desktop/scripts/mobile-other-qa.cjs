/* 잔여 모바일 화면 점검(리스트/폼/대시보드) — 클린 기준 평가용 캡처. */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const { resolveQaShotsDir } = require('../../../scripts/lib/qa-shots-dir.cjs')
// 절대경로 하드코딩(이전: 'C:/dev/Samhan-Public/docs/qa/mobile-other')은 워크트리에서 실행해도
// 메인 체크아웃을 오염시켰다. __dirname 기준 상대 계산 + _local 격리로 교체한다
// (2026-07-26 하네스 재수렴 라운드 G3).
const QA = resolveQaShotsDir(path.resolve(__dirname, '../../../docs/qa/mobile-other'))
const BASE = 'http://localhost:5175'
const PAGES = [
  { label: 'journal-form', path: '/accounting/journals/new' },
  { label: 'sales-form', path: '/sales/new' },
  { label: 'purchase-form', path: '/purchases/new' },
  { label: 'estimate-form', path: '/sales/estimates/new' },
  { label: 'tax-invoice-form', path: '/accounting/tax-invoices/new' },
  { label: 'groupware-approval-create', path: '/groupware/approvals/new' },
]
async function launch() { try { return await chromium.launch({ headless: true }) } catch { return await chromium.launch({ headless: true, channel: 'chromium-headless-shell' }) } }
;(async () => {
  const b = await launch()
  const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage()
  await page.goto(`${BASE}/#/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid=login-id-input]', { timeout: 15000 })
  await page.fill('[data-testid=login-id-input]', 'dev_master')
  await page.fill('[data-testid=login-password-input]', (process.env.DEV_PASSWORD ?? ''))
  await page.click('[data-testid=login-submit-button]')
  await page.waitForSelector('.app-shell', { timeout: 20000 })
  let failed = false
  for (const p of PAGES) {
    try {
      // 이 하네스(:5175)는 HashRouter — 해시 없는 goto 는 조용히 홈으로 낙착한다
      // (2026-07-26 하네스 재수렴 라운드 G5 실측).
      await page.goto(`${BASE}/#${p.path}`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(1800)
      if (!page.url().includes(`/#${p.path}`)) {
        throw new Error(`해시 경로 이탈 — 기대=#${p.path} 실제=${page.url()}`)
      }
      // 페이지 가로 overflow 측정
      const ov = await page.evaluate(() => {
        const vw = window.innerWidth
        let clipped = 0
        for (const el of document.querySelectorAll('.app-main *')) {
          const r = el.getBoundingClientRect()
          if (r.width > 0 && r.right > vw + 1) {
            let scroll = false, q = el.parentElement
            while (q && !q.classList.contains('app-main')) { const o = getComputedStyle(q).overflowX; if (o === 'auto' || o === 'scroll') { scroll = true; break } q = q.parentElement }
            if (!scroll) clipped++
          }
        }
        return { vw, docW: document.documentElement.scrollWidth, clipped }
      })
      await page.screenshot({ path: `${QA}/mobile-${p.label}.png`, fullPage: true })
      console.log(`[${p.label}] docW=${ov.docW}/${ov.vw} 클리핑요소=${ov.clipped} ${ov.clipped > 0 ? '⚠️' : 'OK'}`)
    } catch (e) { console.log(`[${p.label}] ERROR ${e.message}`); failed = true }
  }
  await b.close()
  if (failed) { console.error('QA_FAIL_PARTIAL'); process.exit(1) }
  console.log('DONE')
})().catch((e) => { console.error('FAIL', e); process.exit(1) })
