/**
 * QA capture — clients/web/order-app v4.
 *
 * 6 캡처:
 * 1. 01-order-app-bizgate-legacy.png         — BizGate (#pageBizGate)
 * 2. 02-order-app-main-legacy.png            — mobile-gate 4 카테고리
 * 3. 03-order-app-form-legacy.png            — 카테고리 active 후 라인 입력 (.est-table)
 * 4. 04-order-app-cardOrderInfo-legacy.png   — 라인 추가 후 cardOrderInfo
 * 5. 05-order-app-mobile-responsive-legacy.png — 모바일 viewport
 * 6. 06-order-app-pwa-install-legacy.png     — PWA install prompt (보존)
 *
 * 실행: `node scripts/qa-capture.mjs` (preview server `npm run preview` 가 5181 에서 동작 중이어야 함)
 */
import puppeteer from 'puppeteer-core'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaShotsDir } from '../../../../scripts/lib/qa-shots-dir.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
// _local 격리(2026-07-26 하네스 재수렴 라운드 G3).
const OUT_DIR = resolveQaShotsDir(resolve(__dirname, '../../../../docs/qa/migration-fe-order-app-v4'))
const URL_BASE = process.env.QA_URL || 'http://localhost:5181/'
const EDGE_PATH = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function newPage(browser, viewport) {
  const page = await browser.newPage()
  await page.setViewport(viewport)
  page.on('pageerror', (e) => console.warn('  [page error]', e.message))
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.warn('  [console error]', msg.text())
  })
  return page
}

async function capture(page, name) {
  const out = resolve(OUT_DIR, name)
  await page.screenshot({ path: out, fullPage: false })
  console.log('  saved:', out)
}

async function main() {
  console.log('[qa] launching Edge:', EDGE_PATH)
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  try {
    // ─── 1. BizGate ───────────────────────────────────────────────
    console.log('[qa 1/6] BizGate')
    {
      const page = await newPage(browser, { width: 1366, height: 900 })
      await page.goto(URL_BASE, { waitUntil: 'networkidle2', timeout: 15000 })
      await sleep(800)
      await capture(page, '01-order-app-bizgate-legacy.png')
      await page.close()
    }

    // ─── 2. mobile-gate 4 카테고리 (BizGate 숨김, body.no-active 유지) ───
    // legacy 초기 상태: <body class="no-active"> → mobile-gate 표시 + view-group/btnPreview/btnSaveSnapshot/
    // btnLoadSnapshot/btnHistory/.grid 모두 hide CSS 적용. BizGate 만 숨겨 그 아래 mobile-gate 노출.
    console.log('[qa 2/6] mobile-gate 4 카테고리 (body.no-active 유지)')
    {
      // 모바일 viewport 권장: legacy isMobileNow() 가 1280px 이하 기준으로 분기 (mobile-mode 활성)
      const page = await newPage(browser, { width: 768, height: 1024 })
      await page.goto(URL_BASE, { waitUntil: 'networkidle2', timeout: 15000 })
      await sleep(500)
      // BizGate 만 숨김 — body.no-active 는 그대로 유지하여 hide CSS 가 정상 동작하게 함.
      await page.evaluate(() => {
        const gate = document.getElementById('pageBizGate')
        if (gate) gate.classList.add('hidden')
        // mobileGate 는 body.no-active CSS 가 자동으로 display:flex 처리하므로 inline style 불필요.
      })
      await sleep(300)
      // 검증: body.no-active 유지 확인 (legacy hide CSS 활성)
      const ok = await page.evaluate(() => document.body.classList.contains('no-active'))
      if (!ok) throw new Error('[qa 2] body.no-active 가 비활성 — hide CSS 미적용 위험')
      await capture(page, '02-order-app-main-legacy.png')
      await page.close()
    }

    // ─── 3. 카테고리 active 후 라인 입력 (.est-table) ────────────────
    console.log('[qa 3/6] 카테고리 active (홈멀티)')
    {
      const page = await newPage(browser, { width: 1366, height: 900 })
      await page.goto(URL_BASE, { waitUntil: 'networkidle2', timeout: 15000 })
      await sleep(500)
      await page.evaluate(() => {
        const gate = document.getElementById('pageBizGate')
        if (gate) gate.classList.add('hidden')
        document.body.classList.remove('no-active')
        document.body.classList.add('home-active')
      })
      await sleep(300)
      await capture(page, '03-order-app-form-legacy.png')
      await page.close()
    }

    // ─── 4. cardOrderInfo (preview) ─────────────────────────────────
    console.log('[qa 4/6] cardOrderInfo (openPreview)')
    {
      const page = await newPage(browser, { width: 1366, height: 900 })
      await page.goto(URL_BASE, { waitUntil: 'networkidle2', timeout: 15000 })
      await sleep(500)
      await page.evaluate(() => {
        const gate = document.getElementById('pageBizGate')
        if (gate) gate.classList.add('hidden')
        document.body.classList.remove('no-active')
        document.body.classList.add('home-active')
        // openPreview 가 cardOrderInfo / cardPreview 표시 — legacy 함수 직접 호출
        try { window.openPreview && window.openPreview() } catch (e) { console.log('openPreview err', e) }
      })
      await sleep(500)
      await capture(page, '04-order-app-cardOrderInfo-legacy.png')
      await page.close()
    }

    // ─── 5. 모바일 viewport (legacy @media) ────────────────────────
    console.log('[qa 5/6] 모바일 viewport')
    {
      const page = await newPage(browser, { width: 390, height: 844 }) // iPhone 14 Pro
      await page.goto(URL_BASE, { waitUntil: 'networkidle2', timeout: 15000 })
      await sleep(500)
      await capture(page, '05-order-app-mobile-responsive-legacy.png')
      await page.close()
    }

    // ─── 6. PWA install prompt 시뮬 ────────────────────────────────
    console.log('[qa 6/6] PWA install (manifest 확인)')
    {
      const page = await newPage(browser, { width: 1366, height: 900 })
      await page.goto(URL_BASE, { waitUntil: 'networkidle2', timeout: 15000 })
      await sleep(500)
      // PWA install prompt 는 브라우저 chrome (수동 install 버튼) — headless 에선 표출 X.
      // 대신 manifest + service worker 등록 상태 표시 + 가이드 오버레이 inject.
      await page.evaluate(async () => {
        const mfRes = await fetch('/manifest.webmanifest')
        const mf = await mfRes.json()
        const swRegistered = 'serviceWorker' in navigator
        const overlay = document.createElement('div')
        overlay.style.cssText =
          'position:fixed;inset:0;background:rgba(2,6,23,0.92);color:#e5e7eb;z-index:300000;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;font-family:system-ui,sans-serif;'
        overlay.innerHTML = `
          <div style="font-size:24px;font-weight:800;color:#60a5fa;margin-bottom:16px;">PWA Install (보존)</div>
          <div style="background:#0b1120;border-radius:12px;padding:20px 24px;max-width:520px;line-height:1.7;">
            <div><strong>Manifest:</strong> ${mf.name} (${mf.short_name})</div>
            <div><strong>display:</strong> ${mf.display}</div>
            <div><strong>theme_color:</strong> ${mf.theme_color}</div>
            <div><strong>icons:</strong> ${mf.icons.length}개 (192 / 512)</div>
            <div><strong>service worker:</strong> ${swRegistered ? '지원 (autoUpdate)' : '미지원'}</div>
            <hr style="margin:14px 0;opacity:0.3;">
            <div style="font-size:13px;opacity:0.8;">
              실제 install prompt 는 Edge / Chrome 의 주소표시줄 install 아이콘 또는<br/>
              beforeinstallprompt 이벤트 (HTTPS 운영 환경) 에서 표출됩니다.<br/>
              v4 는 v3 의 PWA 설정 (vite-plugin-pwa workbox + manifest) 100% 보존.
            </div>
          </div>
        `
        document.body.appendChild(overlay)
      })
      await sleep(600)
      await capture(page, '06-order-app-pwa-install-legacy.png')
      await page.close()
    }

    console.log('[qa] complete — 6 captures saved to', OUT_DIR)
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error('[qa] FAIL', err)
  process.exit(1)
})
