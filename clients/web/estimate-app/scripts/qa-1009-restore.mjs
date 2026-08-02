/** #1009 — 저장내역의 복원 버튼이 실제로 restoreSnapshot 을 부르는지 확인 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5183';
const ENTRY = `${BASE}/?email=${encodeURIComponent('dev_master@samhan-air.com')}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
const csp = [];
page.on('console', (m) => { if (/Content Security Policy/.test(m.text())) csp.push(m.text().slice(0, 110)); });
page.on('dialog', async (d) => { await d.accept(); });

await page.goto(ENTRY, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(4500);

// 저장내역 열기
await page.evaluate(() => document.getElementById('btnLoadSnapshot').click());
await page.waitForTimeout(4000);

// 복원 함수를 감싸 호출 여부를 관측
await page.evaluate(() => {
  window.__restoreCalled = 0;
  if (typeof window.restoreSnapshot === 'function') {
    const orig = window.restoreSnapshot;
    window.restoreSnapshot = function (...a) { window.__restoreCalled++; return orig.apply(this, a); };
  }
});

const btn = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === '복원');
  return b ? { has: true, onclick: b.getAttribute('onclick') } : { has: false };
});
console.log('복원 버튼 =', JSON.stringify(btn));

if (btn.has) {
  await page.click('button:has-text("복원")').catch(() => {});
  await page.waitForTimeout(2500);
}

const r = await page.evaluate(() => ({
  called: window.__restoreCalled,
  editingId: window.editingSnapshotId ? '설정됨' : 'null',
}));
console.log('클릭 후 restoreSnapshot 호출 =', r.called, '· editingSnapshotId =', r.editingId);
console.log('CSP 위반 =', csp.length, csp[0] || '');

await browser.close();
