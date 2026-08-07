/**
 * SamhanLogis 운영자 매뉴얼 — desktop client (Electron renderer Vite dev server) 자동 캡처.
 *
 * 전제:
 *   1) infrastructure/scripts/start-local-full.ps1 으로 service 가동
 *   2) clients/desktop 에서 `npm run dev` 로 Electron + Vite dev server (5173) 가동
 *      (또는 `cross-env VITE_MOCK_MODE=1 npx vite` 으로 renderer-only mock 부팅)
 *
 * 동작:
 *   1) capture.config.json 에서 client === 'desktop' 인 screens 만 필터
 *   2) Playwright (msedge channel → chromium fallback) 으로 baseUrl 진입
 *   3) auth 가 명시되면 /login 화면에서 ID/PW 입력 + submit 후 화면으로 이동
 *   4) 각 화면별 url 진입 → defaults.desktop.waitMs 대기 → screenshot 저장
 *   5) annotations 의 selector 를 boundingBox 로 좌표 해석 → annotate.js 호출
 *
 * 산출:
 *   output/<id>.png            — 원본
 *   output/<id>.annotated.png  — 박스/화살표 합성
 *
 * data-testid 누락 시 selector 좌표 해석 실패 → 해당 annotation skip + warning.
 * 누락 testid 는 data-testid-required.md 백로그 참고.
 */
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const { addAnnotations } = require('./annotate');
const { resolveQaCredential } = require('../../scripts/lib/qa-credentials.cjs');

const CONFIG_PATH = path.resolve(__dirname, 'capture.config.json');
const OUT_DIR = path.resolve(__dirname, 'output');

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

/**
 * /login 화면에 진입하여 ID/PW 입력 + submit. 성공 시 router 가 / 로 이동할 때까지 대기.
 * data-testid='login-id-input' / 'login-password-input' / 'login-submit-button' 필요.
 */
async function performLogin(page, baseUrl, creds) {
  console.log(`  [auth] login as ${creds.loginId}`);
  await page.goto(`${baseUrl}/#/login`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(800);

  // data-testid 우선, 누락 시 input[name] / input[type] fallback.
  const idSelector = '[data-testid="login-id-input"], input[name="loginId"], input[type="text"]';
  const pwSelector = '[data-testid="login-password-input"], input[name="password"], input[type="password"]';
  const submitSelector = '[data-testid="login-submit-button"], button[type="submit"]';

  await page.fill(idSelector, creds.loginId);
    const password = creds.password ?? resolveQaCredential(creds.passwordEnv);
    await page.fill(pwSelector, password);

  // PR #111 회고 fix — mutation response + navigation 둘 다 대기.
  // 1) /auth/login 응답 (gateway 경유, status 200) 대기
  // 2) hash router 의 location.hash 가 '#/login' 에서 벗어날 때까지 대기 (navigate('/') 효과)
  const responsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/auth/login') && resp.status() < 400,
    { timeout: 10000 }
  ).catch(() => null);
  await page.click(submitSelector);
  await responsePromise;
  // window.samhanAuth IPC + zustand setAuth + react-router navigate 시간 여유.
  try {
    await page.waitForFunction(
      () => !window.location.hash.includes('/login'),
      { timeout: 8000 }
    );
  } catch (_e) {
    console.log('  [warn] login navigation timeout — 메인 진입 안 됨 (LoginPage 캡처 가능성)');
  }
  await page.waitForTimeout(800);  // 메인 화면 ready (사이드바 mount 등)
}

/**
 * Playwright 의 boundingBox 로 selector → {x, y, w, h} 좌표 해석.
 * 미발견 시 null 반환 (annotation skip).
 */
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

/**
 * 한 화면 캡처 + 어노테이션. screen 객체는 capture.config.json screens 항목.
 */
async function captureScreen(ctx, defaults, auth, screen) {
  const baseUrl = defaults.baseUrl;
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`  [pageerror:${screen.id}]`, e.message));

  // Vite dev 단독 환경에서 Electron preload (window.samhanAuth) 부재 → setToken IPC fail
  // → LoginPage mutation 의 setAuth 에서 throw → navigate 미실행 회피.
  // PR #112 회귀 fix — preload IPC stub 주입.
  await page.addInitScript(() => {
    if (!window.samhanAuth) {
      window.samhanAuth = {
        setToken: async () => undefined,
        getToken: async () => null,
        clearToken: async () => undefined,
      };
    }
  });

  try {
    if (screen.auth) {
      const creds = auth[screen.auth];
      if (!creds) {
        console.warn(`  [skip] ${screen.id}: auth.${screen.auth} 미정의 — capture.config.json auth 추가 필요`);
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

    // annotations selector → 좌표 해석.
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
  const defaults = config.defaults?.desktop || {};
  const auth = config.auth || {};
  const screens = (config.screens || []).filter((s) => s.client === 'desktop');

  if (screens.length === 0) {
    console.warn('[warn] desktop client screens 가 0개 — capture.config.json 확인');
    return;
  }

  console.log('SamhanLogis manual-capture (desktop)');
  console.log(`  baseUrl  = ${defaults.baseUrl}`);
  console.log(`  viewport = ${defaults.viewport.width}x${defaults.viewport.height}`);
  console.log(`  screens  = ${screens.length} 화면`);
  console.log(`  output   = ${OUT_DIR}\n`);

  const browser = await launchBrowser();
  try {
    const ctx = await browser.newContext({
      viewport: defaults.viewport,
      deviceScaleFactor: defaults.deviceScaleFactor || 1,
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
