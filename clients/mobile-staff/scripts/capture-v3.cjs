/**
 * Playwright capture script — mobile-staff v3 QA 캡처 3장.
 *
 * v2 → v3 의 핵심 차이:
 *   - v2 의 `capture-v2.cjs` = expo web export(dist) + iframe.srcdoc mock HTML overlay (PR #65 회고)
 *     → 사용자 명시 불만 ("실제 견적서 아님, mock 화면").
 *   - v3 = mock HTML overlay 일체 폐기. PM 의 estimate-app v2 dev server (port 5183) 에 직접 진입,
 *     react-native-webview 환경 (iPhone UA + 390x844 viewport) 으로 가장.
 *
 * 사용자 첨부 캡처 1:1 매핑 (docs/qa/legacy-original/estimate/):
 *   01-staff-app-init.png       → Screenshot 19.54.05 (전표작성 거래처 form, mobile-mode default)
 *   02-staff-app-page-menu.png  → Screenshot 19.55.07 (▼ 페이지 메뉴 dropdown 13 메뉴 + 자동 로그아웃)
 *   03-staff-app-card-line.png  → Screenshot 19.55.29 (홈멀티 카테고리 라인 grid + 옵션·필터 sidebar)
 *
 * 산출물 (390x844, iPhone 14 Pro viewport):
 *   docs/qa/migration-fe-mobile-staff-v3/01-staff-app-init.png
 *   docs/qa/migration-fe-mobile-staff-v3/02-staff-app-page-menu.png
 *   docs/qa/migration-fe-mobile-staff-v3/03-staff-app-card-line.png
 *
 * 실행 (PM 의 estimate-app v2 dev server 가 port 5183 에서 가동 중이어야 함):
 *   curl http://localhost:5183/healthz   # 200 = 가동 중
 *   node scripts/capture-v3.cjs          # 캡처 진행
 *
 * 미가동 시:
 *   abort + 사용자 안내 (cd c:/dev/SamhanLogis/clients/web/estimate-app && node server.js).
 *   본 스크립트는 dev server 자동 시작 시도하지 않음 — port lock / DB seed 충돌 방지.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { resolveQaShotsDir } = require('../../../scripts/lib/qa-shots-dir.cjs');

const VIEWPORT = { width: 390, height: 844 };
const ESTIMATE_BASE = process.env.QA_ESTIMATE_BASE_URL || 'http://localhost:5183';
// _local 격리(2026-07-26 하네스 재수렴 라운드 G3).
const OUT_DIR = resolveQaShotsDir(path.resolve(__dirname, '../../../docs/qa/migration-fe-mobile-staff-v3'));

// react-native-webview 가 estimate-app 진입 시 보내는 user agent — App.tsx 의
// `applicationNameForUserAgent = ' SamhanStaffApp/0.2.0 (samhan-staff-v2-webview)'` 와 동일.
const STAFF_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ' +
  'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 ' +
  'Safari/604.1 SamhanStaffApp/0.2.0 (samhan-staff-v2-webview)';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * dev server healthz 확인. 미가동 시 false 리턴.
 */
function checkDevServer(baseUrl) {
  return new Promise((resolve) => {
    const req = http.get(baseUrl + '/healthz', { timeout: 2000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve(res.statusCode === 200 && body.includes('ok')));
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: 'msedge', headless: true });
  } catch (_e) {
    console.log('  [info] msedge channel 미설치 → chromium fallback');
    return await chromium.launch({ headless: true });
  }
}

async function snapshot(page, file) {
  const out = path.join(OUT_DIR, file);
  await page.screenshot({ path: out, fullPage: false });
  const sizeKb = (fs.statSync(out).size / 1024).toFixed(1);
  console.log(`  saved → ${file} (${sizeKb} KB)`);
}

/**
 * estimate-app v2 의 인증 게이트 (pageBizGate) 와 모바일 게이트 (mobileGate) 를 강제 닫음.
 * 실 운영에서는 checkUserAuth (Apps Script 1:1) 가 cookie 인증으로 자동 통과시키지만,
 * dev 환경에서는 게이트가 잠시 노출될 수 있으므로 캡처 직전 정리.
 */
async function dismissGates(page) {
  await page
    .evaluate(() => {
      const ids = ['pageBizGate', 'mobileGate'];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el) {
          el.classList.add('hidden');
          el.setAttribute('aria-hidden', 'true');
        }
      }
    })
    .catch(() => {});
}

/**
 * estimate-app v2 진입 — 모바일 viewport + iPhone UA 가 자동으로 mobile-mode 활성.
 * (index.ejs line 7187: `document.body.classList.toggle('mobile-mode', isMobile)`).
 */
async function gotoEstimateApp(page) {
  console.log(`  [info] navigating ${ESTIMATE_BASE}/`);
  await page.goto(`${ESTIMATE_BASE}/`, { waitUntil: 'load', timeout: 60000 });
  // legacy estimate 의 init / 인증 / mobile-mode toggle 안정화 대기.
  await page.waitForTimeout(2500);
  await dismissGates(page);
  await page.waitForTimeout(400);
  // mobile-mode 강제 (안전망 — viewport <1280 이지만 일부 init race 보정).
  await page
    .evaluate(() => {
      document.body.classList.add('mobile-mode');
    })
    .catch(() => {});
}

(async () => {
  ensureDir(OUT_DIR);

  console.log('mobile-staff v3 — 실 dev server 캡처 시작');
  console.log(`  estimate-app v2 base = ${ESTIMATE_BASE}`);

  const alive = await checkDevServer(ESTIMATE_BASE);
  if (!alive) {
    console.error(
      `\n[abort] estimate-app v2 dev server 미가동: ${ESTIMATE_BASE}/healthz 응답 없음.\n` +
        `        먼저 다음 명령으로 dev server 를 시작하세요:\n` +
        `        cd c:/dev/SamhanLogis/clients/web/estimate-app && node server.js\n` +
        `        (또는 npm run dev)`,
    );
    process.exit(2);
  }
  console.log('  [ok] dev server alive (healthz 200)');

  const browser = await launchBrowser();

  try {
    const ctx = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 2,
      userAgent: STAFF_USER_AGENT,
      locale: 'ko-KR',
      timezoneId: 'Asia/Seoul',
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

    // -------- 01 — 진입 직후: 전표작성 거래처 form (mobile-mode default) --------
    // 사용자 첨부: Screenshot 19.54.05.JPG (거래처/대표자/대표번호/사업자주소/거래처분류/특이사항/출고일/출고창고)
    await gotoEstimateApp(page);
    // estimate-app v2 default = `body.no-active` (게이트 통과 후 전표작성 form 자동 노출).
    // 모바일 default 는 전표작성 카드 (#cardOrderInfo) 가 메인 — orderInfo-active 강제.
    await page.evaluate(() => {
      const btn = document.getElementById('btnGoOrderInfo');
      if (btn) btn.click();
    });
    await page.waitForTimeout(1000);
    await snapshot(page, '01-staff-app-init.png');

    // -------- 02 — ▼ 페이지 메뉴 dropdown 활성 (13 메뉴 + 자동 로그아웃) --------
    // 사용자 첨부: Screenshot 19.55.07.JPG (전표작성/홈멀티/싱글중대형/상업멀티/구형/견적서(기본)/세트상세/
    //                                       전표업로드목록/장비스펙/발송내역/견적저장/저장내역/다크모드 + 자동 로그아웃)
    // estimate-app v2 의 #handleTop click → toggleDrawer('top') → #drawerTop active.
    // drawerTop 안 #mobileTopContent 가 .top-actions (메뉴 버튼들) 을 동적으로 받음 (relocateUI).
    await page.evaluate(() => {
      // toggleDrawer('top') 직접 호출 — handleTop click 보다 결정적.
      if (typeof toggleDrawer === 'function') {
        toggleDrawer('top');
      } else {
        const drawer = document.getElementById('drawerTop');
        if (drawer) drawer.classList.add('active');
      }
    });
    await page.waitForTimeout(800);
    await snapshot(page, '02-staff-app-page-menu.png');

    // -------- 03 — 홈멀티 카테고리 라인 grid (옵션·필터 sidebar) --------
    // 사용자 첨부: Screenshot 19.55.29.JPG (▼ 페이지 메뉴 + 품목명/모델명/수량/납품가 헤더 + + 추가 버튼 +
    //                                      좌측 '옵션' tab + 우측 '필터' tab + 하단 검색/조합비/초기화)
    // 메뉴에서 '홈멀티' click → enterMobile('home') → home-active body class.
    await page.evaluate(() => {
      // drawer 닫고 홈멀티 진입.
      if (typeof toggleDrawer === 'function') {
        toggleDrawer('top');
      } else {
        const drawer = document.getElementById('drawerTop');
        if (drawer) drawer.classList.remove('active');
      }
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const btn = document.getElementById('btnGoHome');
      if (btn) btn.click();
    });
    await page.waitForTimeout(1200);
    // 안전망 — home-active body class 강제.
    await page.evaluate(() => {
      document.body.classList.remove(
        'no-active',
        'orderInfo-active',
        'single-active',
        'comm-active',
        'old-active',
        'preview-active',
        'final-active',
      );
      document.body.classList.add('mobile-mode', 'home-active');
    });
    await page.waitForTimeout(400);
    await snapshot(page, '03-staff-app-card-line.png');

    await ctx.close();
    console.log('\nmobile-staff v3 QA capture 3장 완료 →', OUT_DIR);
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
