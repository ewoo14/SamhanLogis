import { resolveQaShotsDir } from '../support/qa-screenshot-dir.mjs'
import { chromium } from '@playwright/test';
const OUT = resolveQaShotsDir('C:/dev/Samhan-Public/docs/qa/e782-part3-marker');
const URL = 'http://localhost:5198/';
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

// WITH marker(#798 현재 상태) — 첫 행 좌상단 크롭(옵션 핸들 겹침 구간).
await page.screenshot({ path: `${OUT}/mobile-handle-overlap-WITH-marker.png`, clip: { x: 0, y: 55, width: 200, height: 90 } });

// 마커 무력화(neutralize) — 핸들 유무 관계없이 "마커가 없었다면" 동일 지점이 어떻게 보였을지 비교.
await page.addStyleTag({ content: `.est-table tbody tr[data-is-set="1"]:not(.set-part) td.colD::before{content:"" !important; margin-right:0 !important; padding:0 !important; border:none !important;}` });
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/mobile-handle-overlap-WITHOUT-marker-baseline.png`, clip: { x: 0, y: 55, width: 200, height: 90 } });

console.log('saved both comparison crops');
await b.close();
