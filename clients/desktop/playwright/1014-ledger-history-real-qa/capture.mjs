/**
 * #1014 원장 자동저장·이력 라이브QA — 실서버 GUI 캡처.
 *
 * 전제:
 *   - Docker 스택 가동 (accounting-service = t1014 브랜치 이미지)
 *   - desktop 웹 렌더러 `npx vite --config vite.web.config.ts --port 5274`
 *
 * 캡처:
 *   01-login.png       — 로그인 (MASTER)
 *   02-ledger.png      — 거래처 원장 화면
 *   03-query.png       — 조회 결과
 *   04-history.png     — 🚨 이력 조회 (직전 결함: 화면에서 도달 불가였다)
 *   05-restore.png     — 🚨 복원
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', '..', '..', '..', 'docs', 'qa', '1014-ledger-history-real-qa');
fs.mkdirSync(OUT, { recursive: true });

const APP = process.env.QA_APP_URL || 'http://localhost:5274';
const API = process.env.QA_API_URL || 'http://localhost:8080';
const ID = process.env.QA_LOGIN_ID || 'dev_master';
const PW = process.env.QA_PASSWORD || 'dev_p05_pass!';
const PARTNER = process.env.QA_PARTNER || 'P0-6-C001';

const log = [];
const rec = (s, d) => { const l = `[${s}] ${d}`; log.push(l); console.log(l); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
page.on('pageerror', (e) => rec('pageerror', String(e).slice(0, 160)));

const net = [];
page.on('response', (r) => {
  const u = r.url();
  if (/ledger|snapshot|history/i.test(u)) net.push(`${r.request().method()} ${u.replace(API, '')} → ${r.status()}`);
});

const shot = async (f) => { await page.screenshot({ path: path.join(OUT, f), fullPage: true }); rec('shot', f); };

const login = await page.request.post(`${API}/api/auth/login`, { data: { loginId: ID, password: PW } });
const body = await login.json();
const token = body?.data?.token;
rec('로그인', `HTTP ${login.status()} · ${body?.data?.role}`);

await page.goto(APP, { waitUntil: 'domcontentloaded' });
await page.evaluate(([t, b]) => {
  localStorage.setItem('samhan.auth.token', t);
  localStorage.setItem('samhan.auth.user', JSON.stringify(b.data));
  localStorage.setItem('token', t);
}, [token, body]);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await shot('01-login.png');

await page.goto(`${APP}/accounting/partner-ledger`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
await shot('02-ledger.png');

// 분개 데이터가 있는 기간(2026-07)으로 조회한다. 거래처는 비워서 전체를 본다.
const set = await page.evaluate(() => {
  const dates = [...document.querySelectorAll('input[type=date]')].filter((e) => e.offsetParent !== null);
  if (dates.length < 2) return null;
  const put = (el, v) => {
    const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
    d.set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  put(dates[0], '2026-07-01');
  put(dates[1], '2026-07-31');
  return `${dates[0].value} ~ ${dates[1].value}`;
});
rec('기간 설정', set || '(날짜칸 없음)');
await page.waitForTimeout(1200);

await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === '조회');
  if (b) b.click();
});
await page.waitForTimeout(5000);
await shot('03-query.png');

// Step 1 집계에서 거래처 row 를 클릭해 Step 2 원장을 활성화한다.
const picked = await page.evaluate(() => {
  const tr = [...document.querySelectorAll('tbody tr')].find((t) => (t.innerText || '').trim().length > 3);
  if (!tr) return null;
  tr.click();
  return (tr.innerText || '').replace(/\s+/g, ' ').slice(0, 80);
});
rec('거래처 row 클릭', picked || '(집계 행 없음)');
await page.waitForTimeout(5000);
await shot('03b-ledger-selected.png');

// 🚨 이력 — 직전 결함은 "API 는 있는데 화면에서 도달 불가" 였다.
const histSection = await page.evaluate(() => {
  const el = document.querySelector('[data-testid="partner-ledger-history"]');
  return el ? (el.innerText || '').replace(/\s+/g, ' ').slice(0, 300) : null;
});
rec('이력 섹션', histSection ? `✅ 렌더됨 — ${histSection}` : '❌ partner-ledger-history 미렌더');
await page.waitForTimeout(4000);
await shot('04-history.png');

const histText = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 500));
rec('이력 화면', histText);

const restore = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')]
    .filter((x) => x.offsetParent !== null)
    .find((x) => /복원|불러오기/.test(x.textContent || ''));
  if (!b) return null;
  b.click();
  return (b.textContent || '').trim();
});
rec('복원 버튼', restore || '(없음)');
await page.waitForTimeout(3500);
await shot('05-restore.png');

rec('네트워크', net.length ? net.join('\n            ') : '(없음)');

fs.writeFileSync(path.join(OUT, 'qa-log.txt'), log.join('\n') + '\n', 'utf8');
console.log('\n=== 캡처 ===\n' + OUT);
await browser.close();
