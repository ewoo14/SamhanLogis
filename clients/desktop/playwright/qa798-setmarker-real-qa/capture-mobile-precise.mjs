import { resolveQaShotsDir } from '../support/qa-screenshot-dir.mjs'
import { chromium } from '@playwright/test';
const OUT = resolveQaShotsDir('../../docs/qa/e782-part3-marker');
const URL = 'http://localhost:5198/';
const SET_MODEL = 'QA797-SET-01';
async function login(page) {
  await page.goto(URL, { waitUntil: 'load', timeout: 20000 });
  await page.waitForTimeout(1000);
  await page.fill('#bizGateInput', '2118712345');
  await page.click('#btnBizQuery');
  await page.waitForTimeout(1200);
  await page.fill('#authPw1', '1234');
  await page.click('#btnAuthAction');
  await page.waitForTimeout(4500);
  const gateModal = page.locator('#gateImageModal');
  if (await gateModal.isVisible().catch(() => false)) { await page.click('#btnImgClose').catch(() => {}); await page.waitForTimeout(500); }
  const tutBox = page.locator('#tutBox');
  if (await tutBox.isVisible().catch(() => false)) {
    const skipBtn = page.locator('button:has-text("튜토리얼 스킵")');
    if (await skipBtn.isVisible().catch(() => false)) { await skipBtn.click(); await page.waitForTimeout(500); }
  }
  await page.evaluate(() => document.querySelectorAll('.tut-blocker').forEach((el) => el.remove()));
}
const b = await chromium.launch({ headless: true });
const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
await login(page);
await page.click('#btnEnterComm');
await page.waitForTimeout(900);

// 1) 실사용 상태 그대로(핸들 포함) 뷰포트 전체 스크린샷 — 겹침 여부 있는 그대로 정직하게 기록.
await page.screenshot({ path: `${OUT}/mobile-real-viewport-asis-with-handle.png` });
console.log('saved mobile-real-viewport-asis-with-handle');

const rowRect = await page.evaluate((sel) => document.querySelector(sel).getBoundingClientRect(), `#commBody tr[data-set-model="${SET_MODEL}"]`);
console.log('rowRect:', JSON.stringify(rowRect));

// 2) #handleLeft 클릭 → 드로어 토글 실측(닫히거나 다른 상태로 전환되는지 실사용 상호작용으로 확인).
await page.click('#handleLeft').catch((e) => console.log('handleLeft click err', e.message));
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/mobile-after-handle-click.png` });
console.log('saved mobile-after-handle-click (drawer 상태 실측)');
// 드로어 닫기(있다면) 시도 후 원상태 확인차 재클릭.
const drawerVisible = await page.evaluate(() => {
  const d = document.querySelector('.mobile-drawer-side, .mobile-drawer');
  return d ? getComputedStyle(d).display : null;
});
console.log('drawer display after click:', drawerVisible);

await b.close();
