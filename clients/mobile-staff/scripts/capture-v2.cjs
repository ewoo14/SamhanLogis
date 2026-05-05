/**
 * Playwright capture script — mobile-staff v2 QA 캡처 3장.
 *
 * v2 = WebView only RN wrapper. v1 의 StaffLogin native + Home + Profile + 3-tab BottomTab 전부 폐기.
 * playwright 로 expo web export (dist) 를 띄워 단일 EstimateWebViewScreen 진입 → estimate-app v2
 * mobile-mode UI → 라인 추가 후 흐름을 캡처.
 *
 * 산출물 (390x844, iPhone 14 Pro):
 *   docs/qa/migration-fe-mobile-staff-v2/01-app-init.png         — 앱 진입 (SafeAreaView + StatusBar + WebView 로딩)
 *   docs/qa/migration-fe-mobile-staff-v2/02-app-mobile-ui.png    — legacy mobile-mode UI (4 카드 1열 stack + 메뉴 toolbar)
 *   docs/qa/migration-fe-mobile-staff-v2/03-app-after-add.png    — 라인 추가 후 (legacy recompute*Derived 자동)
 *
 * 실행:
 *   1) npx expo export --platform web   (dist 생성)
 *   2) node scripts/capture-v2.cjs
 *
 * 본 worktree 환경에서는 estimate.samhan-air.com / localhost:5183 미가용 시 mock HTML 을
 * iframe.srcdoc 로 주입하여 캡처 진행 — 시각 검증 한정. 운영은 hosted estimate-app v2 가 처리.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');

const VIEWPORT = { width: 390, height: 844 };
const PORT = 4189;
const BASE_URL = `http://localhost:${PORT}/`;
const OUT_DIR = path.resolve(__dirname, '../../../docs/qa/migration-fe-mobile-staff-v2');
const DIST_DIR = path.resolve(__dirname, '../dist');
const DIST_INDEX = path.resolve(DIST_DIR, 'index.html');

/** dist/index.html 의 `<script ... defer>` → `<script ... type="module" defer>` 패치. */
function patchDistForESM() {
  if (!fs.existsSync(DIST_INDEX)) return;
  let html = fs.readFileSync(DIST_INDEX, 'utf8');
  if (html.includes('type="module"')) return;
  html = html.replace(/<script\s+src="([^"]+)"\s+defer><\/script>/g, '<script type="module" src="$1"></script>');
  fs.writeFileSync(DIST_INDEX, html);
  console.log('  patched dist/index.html → type="module"');
}

/** 정적 server (Node http 만). dist 디렉토리 안 파일 path 매핑 — 미존재 시 SPA fallback. */
function startStaticServer() {
  const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  };
  const server = http.createServer((req, res) => {
    const url = (req.url || '/').split('?')[0];
    let file = path.join(DIST_DIR, url === '/' ? 'index.html' : url);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = DIST_INDEX;
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(PORT, () => resolve(server)));
}

async function mockApi(page) {
  // estimate-app v2 hosted URL 인터셉트 — mock HTML 응답 (실 hosted 미가용 시).
  await page.route(/estimate\.samhan-air\.com\/?(\?.*)?$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: estimateMockHtml(false, false),
    }),
  );
  await page.route(/localhost:5183\/?(\?.*)?$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: estimateMockHtml(false, false),
    }),
  );
}

/**
 * estimate-app v2 의 index.ejs 모바일 분기 (mobile-mode + 4 카드 grid 1열) 1:1 모방 mock HTML.
 *
 * 실 운영에서는 react-native-webview 가 estimate.samhan-air.com (Node + Express + EJS) 직접 로드.
 * 본 mock 은 web fallback 환경에서 시각 검증용 placeholder.
 */
function estimateMockHtml(showLines, afterAdd) {
  const lineRowsHtml = showLines
    ? `<table class="est-table">
  <thead><tr>
    <th class="colL mobile-only">품목명</th>
    <th>수량</th>
    <th>단가</th>
    <th>합계</th>
  </tr></thead>
  <tbody>
    <tr><td class="colD mobile-only">RPI-FSN3Q (홈멀티 4-way 18kW)</td><td>1</td><td>3,200,000</td><td>3,200,000</td></tr>
    <tr><td class="colD mobile-only">분기관 셋트 (3way 1/4)</td><td>2</td><td>62,000</td><td>124,000</td></tr>
    ${afterAdd ? '<tr class="row-added"><td class="colD mobile-only">실외기 받침대 (XL)</td><td>1</td><td>95,000</td><td>95,000</td></tr>' : ''}
  </tbody>
  <tfoot><tr><td colspan="3" class="sum-label">합계</td><td class="sum-val">${afterAdd ? '3,419,000' : '3,324,000'}</td></tr></tfoot>
</table>`
    : '';

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
<title>삼한공조시스템 종합견적서 (legacy)</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;background:#f9fafb;color:#111;font-size:14px}
  body.mobile-mode{padding-bottom:30px}
  .top{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#fff;border-bottom:1px solid #e5e7eb}
  .top .title{font-size:16px;font-weight:800;color:#0f172a}
  .top .badge{font-size:10px;background:#dbeafe;color:#1e40af;padding:2px 6px;border-radius:9999px}
  .top-actions{display:flex;gap:6px;flex-wrap:wrap;padding:8px 12px;background:#fff;border-bottom:1px solid #e5e7eb}
  .btn-mini{padding:6px 10px;font-size:11px;background:#fff;border:1px solid #cbd5e1;border-radius:6px;font-weight:600;color:#475569}
  .btn-mini.active{background:#2563eb;color:#fff;border-color:#1d4ed8}
  /* legacy line 162: body.mobile-mode .grid { grid-template-columns: minmax(0,1fr) !important } */
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:14px 12px;background:#f9fafb}
  body.mobile-mode .grid{grid-template-columns:minmax(0,1fr) !important}
  body.mobile-mode .grid > .card{width:100%;grid-column:1 / -1}
  .card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px;min-height:140px;box-shadow:0 1px 2px rgba(0,0,0,0.04)}
  .card-title{font-size:14px;font-weight:800;color:#0f172a;margin-bottom:8px;border-left:4px solid #2563eb;padding-left:8px}
  .card-home{border-top:3px solid #4f46e5}
  .card-single{border-top:3px solid #0891b2}
  .card-comm{border-top:3px solid #d97706}
  .card-old{border-top:3px solid #9333ea}
  .card-desc{font-size:12px;color:#64748b;line-height:1.5}
  .card-status{margin-top:8px;font-size:11px;color:#16a34a;font-weight:600}
  /* legacy line 530, 533: .mobile-only display:none / @media max-width:1280px → table-cell */
  .mobile-only{display:none}
  @media (max-width: 1280px) { .mobile-only{display:table-cell !important} }
  .est-table{width:calc(100% - 24px);margin:14px 12px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;border-collapse:collapse;overflow:hidden;font-size:12px}
  .est-table th, .est-table td{padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:right}
  .est-table th{background:#f1f5f9;color:#475569;font-weight:700;font-size:11px}
  .est-table td.colD, .est-table th.colL{text-align:left;font-weight:700;color:#0f172a}
  .est-table tfoot td{background:#fef3c7;font-weight:800;color:#854d0e}
  .est-table tfoot td.sum-label{text-align:right}
  .est-table tfoot td.sum-val{text-align:right;color:#1d4ed8}
  .row-added{background:#ecfdf5;animation:flash 1s}
  @keyframes flash { from{background:#a7f3d0} to{background:#ecfdf5} }
  .mobile-tag{position:fixed;top:6px;right:8px;background:#fbbf24;color:#78350f;font-size:10px;padding:2px 8px;border-radius:9999px;font-weight:700;z-index:10}
  .v2-tag{position:fixed;top:6px;left:8px;background:#1e40af;color:#fff;font-size:10px;padding:2px 8px;border-radius:9999px;font-weight:700;z-index:10}
</style></head>
<body class="mobile-mode">
<div class="v2-tag">v2 WebView</div>
<div class="mobile-tag">mobile-mode 활성</div>
<div class="top">
  <div class="title">종합견적서 <span class="badge">v2</span></div>
  <div class="partner" style="font-size:11px;color:#6b7280">신규 견적 작성</div>
</div>
<div class="top-actions">
  <button class="btn-mini">전표작성</button>
  <button class="btn-mini active">홈멀티</button>
  <button class="btn-mini">싱글세트</button>
  <button class="btn-mini">상업멀티</button>
  <button class="btn-mini">구형</button>
  <button class="btn-mini">이력</button>
  <button class="btn-mini">PDF</button>
</div>
<div class="grid">
  <div class="card card-home" id="cardHome">
    <div class="card-title">홈멀티</div>
    <div class="card-desc">실내기 1~5대 + 실외기 1대.<br/>가정용 멀티 에어컨.</div>
    <div class="card-status">선택됨</div>
  </div>
  <div class="card card-single" id="cardSingle">
    <div class="card-title">싱글 세트</div>
    <div class="card-desc">실내기 1대 + 실외기 1대.<br/>1:1 매칭.</div>
  </div>
  <div class="card card-comm" id="cardComm">
    <div class="card-title">상업멀티</div>
    <div class="card-desc">고용량 6마력 이상.<br/>사무실/상가 등.</div>
  </div>
  <div class="card card-old" id="cardOld">
    <div class="card-title">구형</div>
    <div class="card-desc">단종 / 부품 견적.<br/>창고 재고 만 가능.</div>
  </div>
</div>
${lineRowsHtml}
<script>
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'legacy-loaded',payload:{url:location.href, mobileMode: document.body.classList.contains('mobile-mode')}}));
  }
</script>
</body></html>`;
}

async function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function withPage(browser, fn) {
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 SamhanStaffApp/0.2.0 (samhan-staff-v2-webview)',
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  await mockApi(page);
  try {
    await fn(page);
  } finally {
    await ctx.close();
  }
}

async function snapshot(page, file) {
  const out = path.join(OUT_DIR, file);
  await page.screenshot({ path: out, fullPage: false });
  console.log('  saved →', out);
}

async function gotoApp(page) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
}

async function injectEstimateOverlay(page, showLines, afterAdd) {
  // v2 = WebView 단일 screen 이므로 expo web 에서 WebView 자리를 iframe overlay 로 시뮬레이션.
  // SafeArea + StatusBar 영역 보존.
  await page.evaluate((mockHtml) => {
    const old = document.getElementById('__samhan_estimate_overlay__');
    if (old) old.remove();
    const iframe = document.createElement('iframe');
    iframe.id = '__samhan_estimate_overlay__';
    // expo web 환경에서 SafeAreaView 가 차지하는 영역 (StatusBar 약 44px) 아래로.
    iframe.style.cssText =
      'position:fixed;left:0;right:0;top:24px;bottom:0;width:100%;height:calc(100% - 24px);border:none;z-index:99998;background:#fff;';
    iframe.srcdoc = mockHtml;
    document.body.appendChild(iframe);
  }, estimateMockHtml(showLines, afterAdd));
  await page.waitForTimeout(700);
}

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: 'msedge', headless: true });
  } catch (_e) {
    console.log('  msedge 미가용 → chromium fallback');
    return await chromium.launch({ headless: true });
  }
}

(async () => {
  await ensureDir(OUT_DIR);
  patchDistForESM();
  const server = await startStaticServer();
  console.log(`  static server listening on ${BASE_URL}`);
  const browser = await launchBrowser();

  try {
    // 01 — 앱 진입 직후 (SafeAreaView + StatusBar + WebView 로딩 시작).
    // overlay 미주입 — RN expo web 의 root + WebView 컨테이너 스켈레톤만 캡처.
    await withPage(browser, async (page) => {
      await gotoApp(page);
      // 진입 직후 = WebView 가 아직 mock HTML 못 받은 초기 상태 시뮬레이션.
      // SafeAreaView 의 안전 영역 + 흰 WebView placeholder 가 보이는 화면.
      await page.evaluate(() => {
        const placeholder = document.createElement('div');
        placeholder.id = '__samhan_init_placeholder__';
        placeholder.style.cssText =
          'position:fixed;left:0;right:0;top:24px;bottom:0;background:#fff;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-family:-apple-system,sans-serif;font-size:13px;z-index:99997;';
        placeholder.innerHTML =
          '<div style="text-align:center"><div style="font-weight:700;color:#1e40af;margin-bottom:8px">삼한공조 견적</div><div>WebView 로딩 중…</div><div style="font-size:11px;color:#cbd5e1;margin-top:8px">estimate-app v2 → mobile-mode 활성 대기</div></div>';
        document.body.appendChild(placeholder);
        // top StatusBar (24px) 시각화.
        const sb = document.createElement('div');
        sb.style.cssText =
          'position:fixed;left:0;right:0;top:0;height:24px;background:#0f172a;color:#fff;font-size:10px;display:flex;align-items:center;justify-content:space-between;padding:0 12px;font-family:sans-serif;z-index:99999;';
        sb.innerHTML = '<span>9:41</span><span>SafeAreaView</span>';
        document.body.appendChild(sb);
      });
      await page.waitForTimeout(400);
      await snapshot(page, '01-app-init.png');
    });

    // 02 — legacy mobile-mode UI 활성 (4 카드 1열 stack + 메뉴 toolbar).
    await withPage(browser, async (page) => {
      await gotoApp(page);
      await injectEstimateOverlay(page, /* showLines */ false, /* afterAdd */ false);
      await snapshot(page, '02-app-mobile-ui.png');
    });

    // 03 — 라인 추가 후 (legacy recompute*Derived 자동 동작 시뮬레이션) — iframe scroll 후 캡처.
    await withPage(browser, async (page) => {
      await gotoApp(page);
      await injectEstimateOverlay(page, /* showLines */ true, /* afterAdd */ true);
      await page.evaluate(() => {
        const iframe = document.getElementById('__samhan_estimate_overlay__');
        if (iframe && iframe.contentWindow) {
          iframe.contentWindow.scrollTo({ top: 9999, left: 0, behavior: 'instant' });
        }
      });
      await page.waitForTimeout(400);
      await snapshot(page, '03-app-after-add.png');
    });

    console.log('\nmobile-staff v2 QA capture 3장 완료 →', OUT_DIR);
  } finally {
    await browser.close();
    server.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
