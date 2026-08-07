/**
 * SamhanLogis 운영자 매뉴얼 — mobile-staff client (Expo web export) 자동 캡처.
 *
 * 전제:
 *   1) infrastructure/scripts/start-local-full.ps1 으로 service 가동
 *   2) clients/mobile-staff 에서 `npx expo start --web --port 8081` 으로 web export 가동
 *      (또는 estimate-app v2 dev server port 5183 사용 — capture.config.json baseUrl 변경)
 *
 * 동작:
 *   1) capture.config.json 에서 client === 'mobile' 인 screens 만 필터
 *   2) Playwright iPhone 14 Pro viewport (390x844, DPR 2) + iOS UA 로 진입
 *   3) auth 가 명시되면 mobile-staff 로그인 화면에서 ID/PW 입력 후 진입
 *   4) 각 화면 url 진입 → waitMs 대기 → screenshot
 *   5) annotations selector → boundingBox 해석 → annotate.js 호출
 *
 * 산출:
 *   output/<id>.png             — 원본 (390x844 @ 2x)
 *   output/<id>.annotated.png   — 박스/화살표 합성
 *
 * iOS UA 는 mobile-staff App.tsx 의 SamhanStaffApp UA 와 동일 — capture-v3.cjs 패턴 재사용.
 */
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const { addAnnotations } = require('./annotate');

const CONFIG_PATH = path.resolve(__dirname, 'capture.config.json');
const OUT_DIR = path.resolve(__dirname, 'output');

const STAFF_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ' +
  'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 ' +
  'Safari/604.1 SamhanStaffApp/0.2.0 (samhan-staff-v2-webview)';

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

async function performLogin(page, baseUrl, creds) {
  console.log(`  [auth] mobile login as ${creds.loginId}`);
  await page.goto(`${baseUrl}/`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(1500);
  // mobile-staff 로그인 화면의 testid (frontend backlog) 또는 generic input fallback.
  const idSelector = '[data-testid="mobile-login-id"], input[type="text"]';
  const pwSelector = '[data-testid="mobile-login-password"], input[type="password"]';
  const submitSelector = '[data-testid="mobile-login-submit"], button[type="submit"]';
  try {
    await page.fill(idSelector, creds.loginId);
    const password = creds.password ?? process.env[creds.passwordEnv];
    if (!password) throw new Error(`환경변수 ${creds.passwordEnv}가 필요합니다.`);
    await page.fill(pwSelector, password);
    await page.click(submitSelector);
    await page.waitForTimeout(2000);
  } catch (e) {
    console.warn(`  [warn] mobile login form 미발견 (${e.message}) — auth 없이 진행`);
  }
}

async function resolveSelector(page, selector) {
  try {
    const handle = await page.$(selector);
    if (!handle) return null;
    const box = await handle.boundingBox();
    if (!box) return null;
    return { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) };
  } catch (_e) {
    return null;
  }
}

async function captureScreen(ctx, defaults, auth, screen) {
  const baseUrl = defaults.baseUrl;
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`  [pageerror:${screen.id}]`, e.message));

  try {
    if (screen.auth) {
      const creds = auth[screen.auth];
      if (!creds) {
        console.warn(`  [skip] ${screen.id}: auth.${screen.auth} 미정의`);
        return;
      }
      await performLogin(page, baseUrl, creds);
    }

    const url = `${baseUrl}${screen.url}`;
    console.log(`  [capture] ${screen.id} → ${url}`);
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(defaults.waitMs);

    const outPng = path.join(OUT_DIR, `${screen.id}.png`);
    await page.screenshot({ path: outPng, fullPage: false });
    const sizeKb = (fs.statSync(outPng).size / 1024).toFixed(1);
    console.log(`    saved → ${path.basename(outPng)} (${sizeKb} KB)`);

    const resolved = [];
    for (const ann of screen.annotations || []) {
      if (ann.type === 'box') {
        if (ann.selector) {
          const rect = await resolveSelector(page, ann.selector);
          if (!rect) {
            console.warn(`    [warn] selector 미발견 → ${ann.selector} (label="${ann.label}") skip`);
            continue;
          }
          resolved.push({ type: 'box', ...rect, label: ann.label });
        } else if (typeof ann.x === 'number') {
          resolved.push({ type: 'box', x: ann.x, y: ann.y, w: ann.w, h: ann.h, label: ann.label });
        }
      } else if (ann.type === 'arrow') {
        resolved.push({ type: 'arrow', from: ann.from, to: ann.to, label: ann.label });
      }
    }

    if (resolved.length > 0) {
      const annotated = await addAnnotations(outPng, resolved);
      console.log(`    annotated → ${path.basename(annotated)} (${resolved.length}/${(screen.annotations || []).length} 표시)`);
    } else if ((screen.annotations || []).length > 0) {
      console.warn(`    [warn] 모든 annotation 미해석 — 원본만 산출`);
    }
  } finally {
    await page.close();
  }
}

(async () => {
  ensureDir(OUT_DIR);

  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`[abort] capture.config.json 미존재: ${CONFIG_PATH}`);
    process.exit(1);
  }
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const defaults = config.defaults?.mobile || {};
  const auth = config.auth || {};
  const screens = (config.screens || []).filter((s) => s.client === 'mobile');

  if (screens.length === 0) {
    console.warn('[warn] mobile client screens 가 0개 — capture.config.json 확인');
    console.warn('       (Stage 1 에서는 desktop 화면 2개만 정의 — mobile 화면은 Stage 2 추가 예정)');
    return;
  }

  console.log('SamhanLogis manual-capture (mobile-staff)');
  console.log(`  baseUrl  = ${defaults.baseUrl}`);
  console.log(`  viewport = ${defaults.viewport.width}x${defaults.viewport.height} @ DPR ${defaults.deviceScaleFactor}`);
  console.log(`  screens  = ${screens.length} 화면`);
  console.log(`  output   = ${OUT_DIR}\n`);

  const browser = await launchBrowser();
  try {
    const ctx = await browser.newContext({
      viewport: defaults.viewport,
      deviceScaleFactor: defaults.deviceScaleFactor || 2,
      userAgent: STAFF_USER_AGENT,
      locale: 'ko-KR',
      timezoneId: 'Asia/Seoul',
    });

    for (const screen of screens) {
      await captureScreen(ctx, defaults, auth, screen);
    }

    await ctx.close();
    console.log(`\n[done] ${screens.length} 화면 캡처 완료 → ${OUT_DIR}`);
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
