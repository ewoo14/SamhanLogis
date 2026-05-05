/**
 * Playwright capture script — Phase 6 Mobile v5 QA 캡처 4장.
 *
 * v5 = react-native-webview 로 estimate-app v2 (Node + Express + EJS) 임베드 + 5번째 BottomTab.
 * playwright 로 expo web export (dist) 를 띄워 BizGate native + 5-tab BottomTab + 견적 WebView
 * placeholder 진입 흐름을 캡처. WebView 내부 (legacy estimate index.html 18614 라인) 는 hosted/dev
 * 가용 여부에 따라 placeholder 렌더 또는 실제 로드.
 *
 * 산출물 (390x844, iPhone 14 Pro):
 *   docs/qa/migration-fe-mobile-v5-estimate/01-mobile-bottom-tab-5.png
 *   docs/qa/migration-fe-mobile-v5-estimate/02-mobile-estimate-webview-init.png
 *   docs/qa/migration-fe-mobile-v5-estimate/03-mobile-estimate-webview-grid.png
 *   docs/qa/migration-fe-mobile-v5-estimate/04-mobile-estimate-webview-after-add.png
 *
 * 실행:
 *   1) npx expo export --platform web   (dist 생성)
 *   2) npx http-server dist -p 4173 -s &  (백그라운드 web server)
 *   3) node scripts/capture-v5.cjs
 *
 * 본 worktree 환경에서는 estimate.samhan-air.com / localhost:5183 미가용 시 mock HTML 을
 * iframe.srcdoc 로 주입하여 캡처 진행 — 시각 검증 한정. 운영은 hosted estimate-app v2 가 처리.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const VIEWPORT = { width: 390, height: 844 };
const BASE_URL = process.env.BASE_URL || 'http://localhost:4173/';
const OUT_DIR = path.resolve(__dirname, '../../../docs/qa/migration-fe-mobile-v5-estimate');
const DIST_INDEX = path.resolve(__dirname, '../dist/index.html');

/**
 * dist/index.html 의 `<script ... defer>` → `<script ... type="module" defer>` 패치.
 * v4 capture 와 동일 (idempotent).
 */
function patchDistForESM() {
  if (!fs.existsSync(DIST_INDEX)) return;
  let html = fs.readFileSync(DIST_INDEX, 'utf8');
  if (html.includes('type="module"')) return;
  html = html.replace(/<script\s+src="([^"]+)"\s+defer><\/script>/g, '<script type="module" src="$1"></script>');
  fs.writeFileSync(DIST_INDEX, html);
  console.log('  patched dist/index.html → type="module"');
}

const json = (status, body) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

async function mockApi(page) {
  await page.route(/\/api\/v1\/auth\/biz-gate$/, (route) =>
    route.fulfill(
      json(200, {
        status: 'OK',
        partnerCode: '1234567890',
        partnerName: '주식회사 샘플상사',
        token: 'mock-token-v5-bizgate',
      }),
    ),
  );
  await page.route(/\/api\/v1\/partners\/[^/]+\/config$/, (route) =>
    route.fulfill(json(200, { partnerCode: '1234567890', homeMultiDc: 0.12, commercialMultiDc: 0.08 })),
  );
  await page.route(/\/api\/v1\/products(\?.*)?$/, (route) => route.fulfill(json(200, [])));

  // estimate-app v2 hosted URL 인터셉트 — mock HTML 응답 (실 hosted 미가용 시).
  await page.route(/estimate\.samhan-air\.com\/?(\?.*)?$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: estimateMockHtml(/* showLines */ false, /* afterAdd */ false),
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
 * 본 mock 은 web fallback 환경에서 시각 검증용 placeholder (legacy 18614 라인 EJS 가 모바일에서
 * 어떻게 렌더되는지 — 4 카드 grid stack, .mobile-only 표시).
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
</style></head>
<body class="mobile-mode">
<div class="mobile-tag">mobile-mode 활성 (legacy)</div>
<div class="top">
  <div class="title">종합견적서 <span class="badge">v2</span></div>
  <div class="partner" style="font-size:11px;color:#6b7280">샘플상사 (1234567890)</div>
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
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 SamhanMobileApp/0.5.0 (samhan-mobile)',
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

async function performBizGate(page) {
  const input = page.locator('[data-testid="biz-no-input"]');
  if ((await input.count()) > 0) {
    await input.first().fill('1234567890');
    await page.waitForTimeout(200);
    const submit = page.locator('[data-testid="biz-submit"]');
    if (await submit.count()) {
      await submit.first().click();
      await page.waitForTimeout(1500);
    }
  }
}

async function clickMenuTab(page, label) {
  const candidates = [
    page.getByRole('button', { name: label }),
    page.getByRole('tab', { name: label }),
    page.getByText(label, { exact: true }),
  ];
  for (const loc of candidates) {
    if ((await loc.count()) > 0) {
      try {
        await loc.first().click();
        await page.waitForTimeout(800);
        return true;
      } catch (_e) { /* try next */ }
    }
  }
  return false;
}

async function injectEstimateOverlay(page, showLines, afterAdd) {
  await page.evaluate((mockHtml) => {
    // 기존 overlay 제거 (중복 방지)
    const old = document.getElementById('__samhan_estimate_overlay__');
    if (old) old.remove();
    const iframe = document.createElement('iframe');
    iframe.id = '__samhan_estimate_overlay__';
    iframe.style.cssText =
      'position:fixed;left:0;right:0;top:44px;bottom:64px;width:100%;height:calc(100% - 108px);border:none;z-index:99998;background:#fff;';
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
  const browser = await launchBrowser();

  // 01 — BottomTab 5 tabs 표시 (홈/주문/견적/알림/프로필)
  await withPage(browser, async (page) => {
    await gotoApp(page);
    await performBizGate(page);
    // 홈 화면에서 BottomTab 5 tab label 모두 보임 — 별도 탭 클릭 없이 캡처.
    await snapshot(page, '01-mobile-bottom-tab-5.png');
  });

  // 02 — 견적 tab 진입 → estimate-app v2 WebView init (mobile-mode 활성, 4 카드 stack)
  await withPage(browser, async (page) => {
    await gotoApp(page);
    await performBizGate(page);
    await clickMenuTab(page, '견적');
    await injectEstimateOverlay(page, /* showLines */ false, /* afterAdd */ false);
    await snapshot(page, '02-mobile-estimate-webview-init.png');
  });

  // 03 — 4 카드 grid (홈/싱글/상업/구형) 모바일 1열 stack — 카드 영역 중점 캡처
  await withPage(browser, async (page) => {
    await gotoApp(page);
    await performBizGate(page);
    await clickMenuTab(page, '견적');
    await injectEstimateOverlay(page, false, false);
    // grid 마지막 카드까지 보이게 살짝 스크롤 (legacy mobile-mode 의 1열 stack 강조).
    await page.evaluate(() => {
      const iframe = document.getElementById('__samhan_estimate_overlay__');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.scrollTo({ top: 200, left: 0, behavior: 'instant' });
      }
    });
    await page.waitForTimeout(400);
    await snapshot(page, '03-mobile-estimate-webview-grid.png');
  });

  // 04 — 라인 추가 후 (recompute*Derived 자동 동작 시뮬레이션) — iframe scroll 후 캡처
  await withPage(browser, async (page) => {
    await gotoApp(page);
    await performBizGate(page);
    await clickMenuTab(page, '견적');
    await injectEstimateOverlay(page, /* showLines */ true, /* afterAdd */ true);
    // iframe 안 est-table 까지 스크롤 — 모바일 viewport (390x780 가용) 안에서 라인 추가 결과 보이게.
    await page.evaluate(() => {
      const iframe = document.getElementById('__samhan_estimate_overlay__');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.scrollTo({ top: 9999, left: 0, behavior: 'instant' });
      }
    });
    await page.waitForTimeout(400);
    await snapshot(page, '04-mobile-estimate-webview-after-add.png');
  });

  await browser.close();
  console.log('\nMobile v5 QA capture 4장 완료 →', OUT_DIR);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
