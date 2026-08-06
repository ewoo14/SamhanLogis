/** #1009 — 견적저장 버튼이 실제로 동작하는지·CSP 가 무엇을 막는지 확인 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5183';
const ENTRY = `${BASE}/?email=${encodeURIComponent('dev_master@samhan-air.com')}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });

const csp = [];
page.on('console', (m) => { if (/Content Security Policy/.test(m.text())) csp.push(m.text().slice(0, 120)); });

const resp = await page.goto(ENTRY, { waitUntil: 'domcontentloaded', timeout: 60000 });
console.log('CSP 헤더 =', resp.headers()['content-security-policy'] || '(없음)');
await page.waitForTimeout(4500);

// 404 원인
page.on('response', (r) => { if (r.status() === 404) console.log('404 →', r.url()); });

// 버튼이 어떤 방식으로 핸들러를 다는가
const info = await page.evaluate(() => ({
  saveAttr: document.getElementById('btnSaveSnapshot')?.getAttribute('onclick'),
  loadAttr: document.getElementById('btnLoadSnapshot')?.getAttribute('onclick'),
  hasSaveFn: typeof window.handleSaveSnapshot,
  hasGoFn: typeof window.goSnapshotPage,
}));
console.log('버튼 =', JSON.stringify(info));

// 실제 클릭이 함수를 부르는가 — 함수를 감싸서 확인
await page.evaluate(() => {
  window.__called = [];
  for (const fn of ['handleSaveSnapshot', 'goSnapshotPage']) {
    if (typeof window[fn] === 'function') {
      const orig = window[fn];
      window[fn] = function (...a) { window.__called.push(fn); return orig.apply(this, a); };
    }
  }
});

await page.click('#btnSaveSnapshot');
await page.waitForTimeout(3000);
console.log('클릭 후 호출된 함수 =', JSON.stringify(await page.evaluate(() => window.__called)));
console.log('CSP 위반 =', csp.length, csp.slice(0, 2).join(' | '));

// 직접 호출하면 되는가 (CSP 만의 문제인지 가르기)
const direct = await page.evaluate(async () => {
  try { await window.handleSaveSnapshot(); return 'ok'; } catch (e) { return 'throw: ' + String(e).slice(0, 200); }
});
console.log('직접 호출 =', direct);
await page.waitForTimeout(3000);

await browser.close();
