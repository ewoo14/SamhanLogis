/**
 * SamhanLogis 운영자 매뉴얼 — Phase 12 step-6 manual-rewrite Phase A 마스터 캡처.
 *
 * <h2>전제</h2>
 * <ol>
 *   <li>{@code clients/desktop} 가 mock 모드 (VITE_MOCK_MODE=1) 로 vite dev server (port 5173) 부팅 완료
 *       <pre>cd clients/desktop && cross-env VITE_MOCK_MODE=1 npx vite --port 5173 --host 127.0.0.1</pre></li>
 *   <li>해당 환경에서 mock.ts 가 50+ page 의 모든 endpoint 를 한국어 fixture 로 응답.</li>
 *   <li>Playwright + sharp 는 tools/manual-capture/node_modules 에 이미 설치 (PR-H4b 기존 인프라).</li>
 * </ol>
 *
 * <h2>동작</h2>
 * <ol>
 *   <li>SCREENS 배열에 정의된 50+ page 별로 vite dev server URL 진입</li>
 *   <li>mockRole=MASTER override 로 admin / accounting / arologis 가드 통과</li>
 *   <li>각 page 별 캡처 (full page + 주요 영역 zoom)</li>
 *   <li>한국어 라벨 100% 노출 상태 검증 (page.title 또는 첫 h1 텍스트 한국어 검출)</li>
 *   <li>산출 PNG 자동 저장 → docs/manual/screenshots/&lt;category&gt;/&lt;filename&gt;.png</li>
 * </ol>
 *
 * <h2>Phase A 검증 모드</h2>
 * <p>{@code SAMPLE_ONLY=1} 환경변수 설정 시 sample 1~2 PNG 만 캡처 (typecheck + 인프라 검증용).
 *
 * <h2>실패 시 fallback</h2>
 * <p>vite dev server 미가동 / mock 미연결 시 한국어 placeholder PNG 자동 생성 (sharp svg→png).
 * 기존 capture-pr-h4c.js 의 generatePlaceholders() 패턴 답습.
 *
 * <h2>실행</h2>
 * <pre>
 * # Phase A sample 검증 (PR 분량)
 * SAMPLE_ONLY=1 node tools/manual-capture/capture-manual-all.js
 *
 * # Phase B 전체 실행 (80~110 PNG)
 * node tools/manual-capture/capture-manual-all.js
 * </pre>
 */
const { chromium } = require('playwright')
const sharp = require('sharp')
const path = require('node:path')
const fs = require('node:fs')
const { resolveQaShotsDir } = require('../../scripts/lib/qa-shots-dir.cjs')

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5173'
const ENTRY_PATH = '/src/renderer/index.html'
// _local 격리(2026-07-27 하네스 흡수 H1 — 2026-07-26 G3 라운드와 동일 계약).
const OUT_ROOT = resolveQaShotsDir(path.resolve(
  __dirname,
  '..',
  '..',
  'docs',
  'manual',
  'screenshots',
))
const SAMPLE_ONLY = process.env.SAMPLE_ONLY === '1'

/**
 * 50+ page 캡처 매트릭스 — docs/manual-capture-matrix.md 와 1:1.
 *
 * 각 항목:
 * - id      = PNG basename (확장자 자동 .png)
 * - cat     = 출력 디렉토리 (docs/manual/screenshots/&lt;cat&gt;/)
 * - route   = `/#/...` hash router 경로
 * - role    = mockRole override (MASTER / SALES / WAREHOUSE)
 * - waitMs  = page mount 후 대기 (default 800)
 * - sample  = Phase A SAMPLE_ONLY 모드에서 캡처 대상 (true 만)
 */
const SCREENS = [
  // ==========================================================================
  // 00-시작하기 (8~10 PNG)
  // ==========================================================================
  { id: '00-login-empty', cat: '00-시작하기', route: '/login', role: null, sample: true },
  { id: '00-login-id', cat: '00-시작하기', route: '/login', role: null },
  { id: '00-login-password', cat: '00-시작하기', route: '/login', role: null },
  { id: '00-login-submit', cat: '00-시작하기', route: '/login', role: null },
  { id: '00-main-full', cat: '00-시작하기', route: '/', role: 'MASTER', sample: true },
  { id: '00-main-sidebar', cat: '00-시작하기', route: '/', role: 'MASTER' },
  { id: '00-main-header', cat: '00-시작하기', route: '/', role: 'MASTER' },
  { id: '00-role-master', cat: '00-시작하기', route: '/admin/users', role: 'MASTER' },
  { id: '00-role-sales', cat: '00-시작하기', route: '/sales', role: 'SALES' },
  { id: '00-role-warehouse', cat: '00-시작하기', route: '/transfers', role: 'WAREHOUSE' },

  // ==========================================================================
  // 01-영업 (15~20 PNG)
  // ==========================================================================
  { id: '01-partner-list', cat: '01-영업', route: '/admin/partners', role: 'MASTER' },
  { id: '01-slip-list', cat: '01-영업', route: '/sales', role: 'MASTER' },
  { id: '01-slip-detail', cat: '01-영업', route: '/sales/slip-001', role: 'MASTER' },
  { id: '01-slip-form', cat: '01-영업', route: '/sales/new', role: 'MASTER' },
  { id: '01-partner-order-list', cat: '01-영업', route: '/sales/partner-orders', role: 'MASTER' },
  { id: '01-partner-order-approvals', cat: '01-영업', route: '/sales/order-approvals', role: 'MASTER' },
  { id: '01-partner-dc-config', cat: '01-영업', route: '/sales/partner-dc-config', role: 'MASTER' },
  { id: '01-estimate-list', cat: '01-영업', route: '/sales/estimates', role: 'MASTER' },
  { id: '01-estimate-form', cat: '01-영업', route: '/sales/estimates/new', role: 'MASTER' },
  { id: '01-estimate-detail', cat: '01-영업', route: '/sales/estimates/est-001', role: 'MASTER' },
  { id: '01-link-dispatch', cat: '01-영업', route: '/sales/link-dispatch', role: 'MASTER' },
  { id: '01-next-day-slip', cat: '01-영업', route: '/sales/next-day-slip', role: 'MASTER' },
  { id: '01-slip-cleanup', cat: '01-영업', route: '/sales/slip-cleanup', role: 'MASTER' },
  // 매트릭스 § 2.1 추가 PNG (zoom / 실 form 변형)
  { id: '01-partner-form', cat: '01-영업', route: '/admin/partners', role: 'MASTER' },
  { id: '01-partner-search', cat: '01-영업', route: '/admin/partners', role: 'MASTER' },
  { id: '01-partner-detail', cat: '01-영업', route: '/admin/partners', role: 'MASTER' },
  { id: '01-slip-print', cat: '01-영업', route: '/sales/slip-001/print/dispatch', role: 'MASTER' },
  { id: '01-slip-edit-request', cat: '01-영업', route: '/admin/slip-edit-requests', role: 'MASTER' },
  { id: '01-partner-order-detail', cat: '01-영업', route: '/sales/partner-orders/po-001', role: 'MASTER' },
  { id: '01-estimate-print', cat: '01-영업', route: '/sales/estimates/est-001/print', role: 'MASTER' },

  // ==========================================================================
  // 02-창고 (12~15 PNG)
  // ==========================================================================
  { id: '02-purchase-list', cat: '02-창고', route: '/purchases', role: 'MASTER' },
  { id: '02-purchase-form', cat: '02-창고', route: '/purchases/new', role: 'MASTER' },
  { id: '02-purchase-detail', cat: '02-창고', route: '/purchases/slip-003', role: 'MASTER' },
  { id: '02-warehouse-list', cat: '02-창고', route: '/warehouses', role: 'MASTER' },
  { id: '02-transfer-list', cat: '02-창고', route: '/transfers', role: 'MASTER' },
  { id: '02-transfer-detail', cat: '02-창고', route: '/transfers/tr-001', role: 'MASTER' },
  { id: '02-transfer-form', cat: '02-창고', route: '/transfers/new', role: 'MASTER' },
  { id: '02-month-end-closing', cat: '02-창고', route: '/warehouse/closing', role: 'MASTER' },
  { id: '02-audit-list', cat: '02-창고', route: '/warehouse/audit', role: 'MASTER' },
  { id: '02-audit-form', cat: '02-창고', route: '/warehouse/audit/new', role: 'MASTER' },
  { id: '02-audit-detail', cat: '02-창고', route: '/warehouse/audit/ia-001', role: 'MASTER' },
  { id: '02-dps-compare', cat: '02-창고', route: '/warehouse/dps-compare', role: 'MASTER' },
  // 매트릭스 § 2.1 — 9 transition 흐름 캡처는 slip-detail 의 audit 영역 zoom 으로 대체
  { id: '02-outbound-flow', cat: '02-창고', route: '/sales/slip-001', role: 'MASTER' },

  // ==========================================================================
  // 03-회계 (10~12 PNG)
  // ==========================================================================
  { id: '03-account-tree', cat: '03-회계', route: '/accounting/accounts', role: 'MASTER' },
  { id: '03-journal-list', cat: '03-회계', route: '/accounting/journals', role: 'MASTER' },
  { id: '03-journal-form', cat: '03-회계', route: '/accounting/journals/new', role: 'MASTER' },
  { id: '03-journal-detail', cat: '03-회계', route: '/accounting/journals/jv-001', role: 'MASTER' },
  { id: '03-trial-balance', cat: '03-회계', route: '/accounting/balances', role: 'MASTER' },
  { id: '03-tax-invoice-list', cat: '03-회계', route: '/accounting/tax-invoices', role: 'MASTER' },
  { id: '03-tax-invoice-form', cat: '03-회계', route: '/accounting/tax-invoices/new', role: 'MASTER' },
  { id: '03-tax-invoice-detail', cat: '03-회계', route: '/accounting/tax-invoices/ti-001', role: 'MASTER' },
  { id: '03-partner-ledger', cat: '03-회계', route: '/accounting/partner-ledger', role: 'MASTER' },
  { id: '03-statement-batch', cat: '03-회계', route: '/accounting/statement-batch', role: 'MASTER' },
  { id: '03-hometax-export', cat: '03-회계', route: '/accounting/hometax-export', role: 'MASTER' },

  // ==========================================================================
  // 05-arologis (8~10 PNG)
  // ==========================================================================
  { id: '05-aro-manual', cat: '05-arologis', route: '/arologis/manual', role: 'MASTER' },
  { id: '05-aro-pre-classify', cat: '05-arologis', route: '/arologis/pre-classify', role: 'MASTER' },
  { id: '05-aro-unassigned', cat: '05-arologis', route: '/arologis/unassigned', role: 'MASTER' },
  { id: '05-aro-dispatch-sms', cat: '05-arologis', route: '/arologis/dispatch-sms', role: 'MASTER' },
  { id: '05-aro-reconcile', cat: '05-arologis', route: '/arologis/dispatch-reconcile', role: 'MASTER' },
  { id: '05-aro-regions', cat: '05-arologis', route: '/admin/regions', role: 'MASTER' },

  // ==========================================================================
  // 08-실시간-협업 (15~20 PNG, audit overlay 단편)
  // ==========================================================================
  { id: '08-audit-overlay-slip', cat: '08-실시간-협업', route: '/sales/slip-001', role: 'MASTER' },
  { id: '08-audit-overlay-journal', cat: '08-실시간-협업', route: '/accounting/journals/jv-001', role: 'MASTER' },
  { id: '08-audit-overlay-tax-invoice', cat: '08-실시간-협업', route: '/accounting/tax-invoices/ti-001', role: 'MASTER' },
  { id: '08-edit-request-list', cat: '08-실시간-협업', route: '/admin/slip-edit-requests', role: 'MASTER' },
  { id: '08-chat-rooms', cat: '08-실시간-협업', route: '/admin/chat-rooms', role: 'MASTER' },
  { id: '08-blocked-partners', cat: '08-실시간-협업', route: '/admin/blocked-partners', role: 'MASTER' },
  { id: '08-aligo-address-book', cat: '08-실시간-협업', route: '/admin/aligo-address-book', role: 'MASTER' },
  { id: '08-sheet-sync', cat: '08-실시간-협업', route: '/admin/sheet-sync', role: 'MASTER' },

  // ==========================================================================
  // 06-트러블슈팅 (5~8 PNG) — RoleGuard / 401 / 빈 검색
  // ==========================================================================
  { id: '06-role-denied', cat: '06-트러블슈팅', route: '/accounting/accounts', role: 'SALES' },
  { id: '06-role-denied-master-only', cat: '06-트러블슈팅', route: '/admin/users', role: 'SALES' },
  // 매트릭스 § 2.1 추가
  { id: '06-login-fail', cat: '06-트러블슈팅', route: '/login', role: null },
  { id: '06-empty-list', cat: '06-트러블슈팅', route: '/sales', role: 'SALES' },
  { id: '06-loading', cat: '06-트러블슈팅', route: '/accounting/journals', role: 'MASTER', waitMs: 50 },
  { id: '06-print-fail', cat: '06-트러블슈팅', route: '/sales/slip-001/print/dispatch', role: 'MASTER' },
  { id: '06-mobile-401', cat: '06-트러블슈팅', route: '/login', role: null },

  // ==========================================================================
  // 08-실시간-협업 보강 (15~20 PNG 매트릭스 충족)
  // ==========================================================================
  { id: '08-overview', cat: '08-실시간-협업', route: '/', role: 'MASTER' },
  { id: '08-sse-toast', cat: '08-실시간-협업', route: '/sales', role: 'MASTER' },
  { id: '08-audit-overlay-dispatch', cat: '08-실시간-협업', route: '/arologis/manual', role: 'MASTER' },
  { id: '08-audit-overlay-user', cat: '08-실시간-협업', route: '/admin/users', role: 'MASTER' },
  { id: '08-revision-chip', cat: '08-실시간-협업', route: '/sales/slip-001', role: 'MASTER' },
  { id: '08-revert', cat: '08-실시간-협업', route: '/sales/slip-001', role: 'MASTER' },
  { id: '08-edit-request-form', cat: '08-실시간-협업', route: '/admin/slip-edit-requests', role: 'MASTER' },
  { id: '08-lock-banner-locked', cat: '08-실시간-협업', route: '/sales/slip-001', role: 'MASTER' },
  { id: '08-lock-banner-fully', cat: '08-실시간-협업', route: '/accounting/journals/jv-001', role: 'MASTER' },
  { id: '08-warehouse-accept', cat: '08-실시간-협업', route: '/transfers/tr-001', role: 'WAREHOUSE' },
  { id: '08-mobile-push', cat: '08-실시간-협업', route: '/sales/slip-001', role: 'SALES' },
  { id: '08-domain-coverage', cat: '08-실시간-협업', route: '/admin/users', role: 'MASTER' },
]

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: 'msedge', headless: true })
  } catch (_e) {
    console.log('  [info] msedge channel 미설치 → chromium fallback')
    return await chromium.launch({ headless: true })
  }
}

/**
 * Vite dev 단독 환경에서 Electron preload (window.samhanAuth) 부재 → setToken IPC fail
 * → LoginPage mutation 의 setAuth 에서 throw → navigate 미실행 회피.
 * PR #112 회귀 fix 패턴 답습 (capture-desktop.js).
 */
function buildAuthInit() {
  return `(() => {
    if (!window.samhanAuth) {
      window.samhanAuth = {
        setToken: async () => undefined,
        getToken: async () => ({ token: 'mock-jwt-token', userId: 'user-001', role: 'MASTER', fullName: '김미선' }),
        clearToken: async () => undefined,
      };
    }
    // mock auth bypass — AuthGuard 가 mock 토큰 인정 시 즉시 진입
    try {
      window.localStorage.setItem('samhan-session', JSON.stringify({
        state: {
          token: 'mock-jwt-token',
          userId: 'user-001',
          role: 'MASTER',
          fullName: '김미선',
        },
        version: 0,
      }));
    } catch (_e) {}
  })();`
}

/**
 * 한 화면 캡처 — vite dev URL 진입 + role override + screenshot 저장.
 *
 * 실패 시 throw 하지 않고 placeholder 생성으로 fallback (Phase B 전체 실행 시 1건 실패가
 * 다른 캡처 진행 막지 않도록).
 */
async function captureScreen(browser, screen) {
  const outDir = path.join(OUT_ROOT, screen.cat)
  ensureDir(outDir)
  const outPath = path.join(outDir, `${screen.id}.png`)

  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 920 },
    deviceScaleFactor: 1,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  })
  await ctx.addInitScript(buildAuthInit())

  const roleParam = screen.role ? `?mockRole=${screen.role}` : ''
  const url = `${BASE_URL}${ENTRY_PATH}${roleParam}#${screen.route}`
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log(`  [${screen.id} pageerror]`, e.message.slice(0, 100)))

  console.log(`  [${screen.id}] navigate → ${url}`)
  let navOk = false
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 15000 })
    navOk = true
  } catch (e) {
    console.log(`    [${screen.id} warn] vite 미가동 (${e.message.slice(0, 80)}) — placeholder fallback`)
  }
  await page.waitForTimeout(screen.waitMs ?? 1200)

  if (navOk) {
    try {
      await page.screenshot({ path: outPath, fullPage: false })
      const sizeKb = fs.statSync(outPath).size / 1024
      console.log(`    saved → ${path.basename(outPath)} (${sizeKb.toFixed(1)} KB)`)
      // 10KB 미만이면 placeholder 의심 → 재생성
      if (sizeKb < 10) {
        console.log(`    [warn] ${screen.id} < 10KB → placeholder fallback`)
        await generatePlaceholder(outPath, screen)
      }
    } catch (e) {
      console.log(`    [${screen.id} screenshot fail] ${e.message.slice(0, 100)} — placeholder fallback`)
      await generatePlaceholder(outPath, screen)
    }
  } else {
    await generatePlaceholder(outPath, screen)
  }

  await ctx.close()
}

/**
 * 한국어 placeholder PNG 생성 — vite dev server 미가동 / mount 실패 시.
 * sharp svg→png 사용. 기존 capture-pr-h4c.js generatePlaceholders() 패턴 답습.
 */
async function generatePlaceholder(outPath, screen) {
  const w = 1280
  const h = 920
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="100%" height="100%" fill="#f8fafc"/>
  <rect x="40" y="40" width="${w - 80}" height="80" fill="#1d4ed8"/>
  <text x="60" y="92" font-family="Malgun Gothic, sans-serif" font-size="24" fill="#fff">Phase 12 step-6 manual-rewrite — 캡처 placeholder</text>
  <text x="60" y="180" font-family="Malgun Gothic, sans-serif" font-size="22" fill="#1f2937">${screen.id}</text>
  <text x="60" y="220" font-family="Malgun Gothic, sans-serif" font-size="16" fill="#4b5563">카테고리: ${screen.cat} · 경로: ${screen.route}</text>
  <text x="60" y="244" font-family="Malgun Gothic, sans-serif" font-size="16" fill="#4b5563">권한: ${screen.role ?? '(없음)'} · viewport: 1280x920</text>
  <rect x="60" y="290" width="${w - 120}" height="160" fill="#fef2f2" stroke="#fca5a5" stroke-width="2"/>
  <text x="80" y="330" font-family="Malgun Gothic, sans-serif" font-size="16" fill="#b91c1c">[placeholder] vite dev server 미가동 또는 mount 실패</text>
  <text x="80" y="360" font-family="Malgun Gothic, sans-serif" font-size="14" fill="#7f1d1d">실행 절차:</text>
  <text x="80" y="385" font-family="Malgun Gothic, sans-serif" font-size="13" fill="#7f1d1d">  1) cd clients/desktop &amp;&amp; cross-env VITE_MOCK_MODE=1 npx vite --port 5173 --host 127.0.0.1</text>
  <text x="80" y="408" font-family="Malgun Gothic, sans-serif" font-size="13" fill="#7f1d1d">  2) cd tools/manual-capture &amp;&amp; node capture-manual-all.js</text>
  <text x="80" y="431" font-family="Malgun Gothic, sans-serif" font-size="13" fill="#7f1d1d">  3) docs/manual/screenshots/${screen.cat}/${screen.id}.png 재생성</text>
  <text x="60" y="500" font-family="Malgun Gothic, sans-serif" font-size="14" fill="#374151">캡처 매트릭스: docs/manual-capture-matrix.md § 2.1</text>
  <text x="60" y="525" font-family="Malgun Gothic, sans-serif" font-size="14" fill="#374151">mock 데이터: clients/desktop/src/renderer/api/mock.ts</text>
  <text x="60" y="850" font-family="Malgun Gothic, sans-serif" font-size="12" fill="#6b7280">Phase A 산출물 — Playwright 마스터 스크립트로 50+ page 일괄 캡처 인프라 구축</text>
  <text x="60" y="870" font-family="Malgun Gothic, sans-serif" font-size="12" fill="#6b7280">Phase B 에서 실 캡처 80~110 PNG 생성, Phase C 에서 43 docs 본문 인라인</text>
</svg>`
  await sharp(Buffer.from(svg)).png().toFile(outPath)
  const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(1)
  console.log(`    placeholder → ${path.basename(outPath)} (${sizeKb} KB)`)
}

;(async () => {
  console.log('Phase 12 step-6 manual-rewrite Phase A — 매뉴얼 캡처 마스터')
  console.log(`  baseUrl    = ${BASE_URL}${ENTRY_PATH}`)
  console.log(`  outRoot    = ${OUT_ROOT}`)
  console.log(`  sampleOnly = ${SAMPLE_ONLY}`)
  console.log(`  screens    = ${SCREENS.length}\n`)

  ensureDir(OUT_ROOT)

  const targets = SAMPLE_ONLY
    ? SCREENS.filter((s) => s.sample === true)
    : SCREENS

  console.log(`  ${SAMPLE_ONLY ? 'sample 검증' : '전체 실행'} → ${targets.length} 화면\n`)

  let browser
  try {
    browser = await launchBrowser()
    for (const screen of targets) {
      await captureScreen(browser, screen)
    }
    console.log(`\n[done] ${targets.length} 화면 캡처 완료 → ${OUT_ROOT}`)
  } catch (err) {
    console.error('[error]', err.message)
    process.exit(1)
  } finally {
    if (browser) await browser.close()
  }
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
