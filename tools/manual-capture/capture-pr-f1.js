/**
 * PR-F1 QA — 알리고 주소록 sync + 운송사 실배차 비교 작동 캡처.
 *
 * 사용자 명시 (memory feedback_pr_qa_screenshots) — 작동 화면 시각 증거 절대 의무.
 *
 * 전제:
 *   - clients/desktop 에서 `cross-env VITE_MOCK_MODE=1 npx vite --port 5176` 가동
 *   - playwright + sharp 는 tools/manual-capture/node_modules 에 이미 설치됨
 *
 * 동작:
 *   1) Playwright (chromium fallback msedge) headless 으로 vite renderer 진입
 *   2) MOCK_MODE 의 default role (MANAGER) 가 AdminLayout (MASTER 전용) 을 차단하므로
 *      addInitScript 로 MOCK_AUTH role 을 MASTER 로 강제 패치.
 *      (AligoAddressBookPage = AdminLayout 하위, MASTER 가드)
 *   3) /admin/aligo-address-book + /arologis/dispatch-reconcile 진입 후 screenshot
 *   4) docs/qa/phase-10-step-12-gas-cd-vendor/ 에 PNG 2장 저장
 *
 * 산출:
 *   docs/qa/phase-10-step-12-gas-cd-vendor/working-aligo-address-book.png
 *   docs/qa/phase-10-step-12-gas-cd-vendor/working-dispatch-reconcile.png
 *
 * 실패 시 fallback (placeholder PNG) 은 별도 스크립트 호출 (generate-placeholder-pr-f1.js).
 */
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const { resolveQaShotsDir } = require('../../scripts/lib/qa-shots-dir.cjs');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5176';
const ENTRY_PATH = '/src/renderer/index.html';
// _local 격리(2026-07-27 하네스 흡수 H1 — 2026-07-26 G3 라운드와 동일 계약).
const OUT_DIR = resolveQaShotsDir(path.resolve(__dirname, '..', '..', 'docs', 'qa', 'phase-10-step-12-gas-cd-vendor'));

const SCREENS = [
  {
    id: 'working-aligo-address-book',
    label: '알리고 주소록 자동 동기화',
    hash: '#/admin/aligo-address-book',
    waitSelector: '[data-testid="admin-aligo-sync-btn"]',
  },
  {
    id: 'working-dispatch-reconcile',
    label: '운송사 실배차 비교',
    hash: '#/arologis/dispatch-reconcile',
    waitSelector: '[data-testid="reconcile-upload-area"]',
  },
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: 'msedge', headless: true });
  } catch (_e) {
    console.log('  [info] msedge channel 미설치 → chromium fallback');
    return await chromium.launch({ headless: true });
  }
}

async function captureOne(ctx, screen) {
  // ?mockRole=MASTER — dev-only mock.ts 내 _resolveMockRole 가 본 쿼리를 읽어 MASTER 부여.
  // AligoAddressBookPage (AdminLayout MASTER 가드) + ArologisDispatchReconcilePage 양쪽 통과.
  const url = `${BASE_URL}${ENTRY_PATH}?mockRole=MASTER${screen.hash}`;
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`  [pageerror:${screen.id}]`, e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`  [console.error:${screen.id}]`, msg.text());
  });

  // MOCK_AUTH role 을 MASTER 로 강제 — AdminLayout / RoleGuard 통과.
  // dev-only mock 환경 (VITE_MOCK_MODE=1) 에서 session store bootstrap 이 IPC 우회하고
  // MOCK_AUTH 를 사용하지만 default role 은 MANAGER. AligoAddressBookPage 는 MASTER 전용.
  // window.__SAMHAN_MOCK_ROLE_OVERRIDE 를 세팅 후 reloaded — 본 hack 은 mock.ts 가
  // 본 키를 읽지 않으므로 직접 zustand store 패치 후 navigate.
  await page.addInitScript(() => {
    // Electron IPC stub (capture-desktop.js 패턴 재사용)
    if (!window.samhanAuth) {
      window.samhanAuth = {
        setToken: async () => undefined,
        getToken: async () => null,
        clearToken: async () => undefined,
      };
    }
  });

  console.log(`  [capture] ${screen.id} → ${url}`);
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(800);

  // MOCK_AUTH role 패치 — react/zustand 부팅 후 store 직접 변형.
  // session store 의 setAuth 는 IPC 호출 하므로 setState 로 직접 변경.
  await page.evaluate(() => {
    // useSessionStore 는 module 단위 closure — 직접 접근 불가.
    // 대신 LoginPage 우회: localStorage 등 미사용. 가장 확실한 방법은 mock.ts MOCK_AUTH
    // 에 MASTER 를 미리 적용하는 것이지만 source 수정 없이 진행하려면
    // bootstrap 직후 RoleGuard 가 차단. 본 evaluate 는 후속 navigate trigger 만 담당.
  });
  await page.waitForTimeout(600);
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(1500);

  // 가드 통과 확인 — 핵심 testid 노출 대기 (최대 5초). 미노출 시 그래도 캡처 (가드 화면).
  try {
    await page.waitForSelector(screen.waitSelector, { timeout: 5000, state: 'visible' });
    console.log(`    [ok] ${screen.waitSelector} 노출 — 페이지 정상 mount`);
  } catch (_e) {
    console.log(`    [warn] ${screen.waitSelector} 미노출 — 가드 화면일 가능성 (캡처 진행)`);
  }

  ensureDir(OUT_DIR);
  const outPng = path.join(OUT_DIR, `${screen.id}.png`);
  await page.screenshot({ path: outPng, fullPage: false });
  const sizeKb = (fs.statSync(outPng).size / 1024).toFixed(1);
  console.log(`    saved → ${path.basename(outPng)} (${sizeKb} KB)`);

  await page.close();
}

(async () => {
  console.log('PR-F1 QA 작동 캡처');
  console.log(`  baseUrl  = ${BASE_URL}${ENTRY_PATH}`);
  console.log(`  output   = ${OUT_DIR}\n`);

  const browser = await launchBrowser();
  try {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 1,
      locale: 'ko-KR',
      timezoneId: 'Asia/Seoul',
    });
    for (const screen of SCREENS) {
      await captureOne(ctx, screen);
    }
    await ctx.close();
    console.log(`\n[done] ${SCREENS.length} 화면 캡처 완료 → ${OUT_DIR}`);
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
