/**
 * #1041 복수 라인 입고 라이브QA — 실서버 GUI 캡처.
 *
 * 전제:
 *   - Docker 스택 가동 (브랜치 이미지 inventory-service · slip-service)
 *   - desktop 웹 렌더러 `npx vite --config vite.web.config.ts --port 5273`
 *
 * 캡처:
 *   01-login.png          — 로그인
 *   02-stock-balance.png  — 재고 현황 화면
 *   03-inbound-lots.png   — 🚨 방금 입고한 전표의 라인별 재고 (2 + 3 = 5)
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', '..', '..', '..', 'docs', 'qa', '1041-inbound-lines-real-qa');
fs.mkdirSync(OUT, { recursive: true });

const APP = process.env.QA_APP_URL || 'http://localhost:5273';
const API = process.env.QA_API_URL || 'http://localhost:8080';
const ID = process.env.QA_LOGIN_ID || 'dev_master';
const PW = process.env.QA_PASSWORD || 'dev_p05_pass!';

const log = [];
const rec = (s, d) => { const l = `[${s}] ${d}`; log.push(l); console.log(l); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
page.on('pageerror', (e) => rec('pageerror', String(e).slice(0, 160)));

const shot = async (f) => { await page.screenshot({ path: path.join(OUT, f), fullPage: true }); rec('shot', f); };

// 로그인 토큰을 주입한다 (실 auth-service 호출).
const login = await page.request.post(`${API}/api/auth/login`, { data: { loginId: ID, password: PW } });
rec('로그인', `HTTP ${login.status()}`);
const body = await login.json();
const token = body?.data?.token;
rec('토큰', token ? `발급됨 (${String(body.data.role)})` : '없음');

await page.goto(APP, { waitUntil: 'domcontentloaded' });
await page.evaluate(([t, b]) => {
  localStorage.setItem('samhan.auth.token', t);
  localStorage.setItem('samhan.auth.user', JSON.stringify(b.data));
  localStorage.setItem('token', t);
}, [token, body]);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await shot('01-login.png');

await page.goto(`${APP}/inventory/stock-balance`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
await shot('02-stock-balance.png');

// 창고 필터는 건드리지 않고 전체로 조회한다 (React controlled select 오조작 방지).

await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === '조회');
  if (b) b.click();
});
await page.waitForTimeout(4000);
await shot('03-inbound-lots.png');

const rows = await page.evaluate(() => {
  const trs = [...document.querySelectorAll('tbody tr')];
  return trs.map((t) => (t.innerText || '').replace(/\s+/g, ' ').trim())
            .filter((t) => /AJ030RXH4BC1|3HP/.test(t)).slice(0, 5);
});
rec('대상 품목 행', rows.length ? rows.join(' || ') : '(없음)');

const txt = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 400));
rec('화면', txt);

fs.writeFileSync(path.join(OUT, 'qa-log.txt'), log.join('\n') + '\n', 'utf8');
console.log('\n=== 캡처 ===\n' + OUT);
await browser.close();
