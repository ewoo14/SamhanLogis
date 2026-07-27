import { resolveQaShotsDir } from '../support/qa-screenshot-dir.mjs'
// PR #798 라이브 QA 추가검증 — Design/FE Low 지적 (a) 모바일 좁은폭에서 10px 마커 가독성.
// 기본 캡처(after-set-marker-mobile.png)는 카드 전체 뷰라 마커가 작게 나와 판독이 어려움 —
// SET 행의 mobile-only 이름셀만 확대 캡처(2x 스케일)로 가독성 판정.
import { chromium } from '@playwright/test';

const OUT = resolveQaShotsDir(process.env.QA_OUT || 'C:/dev/Samhan-Public/docs/qa/e782-part3-marker');
const URL = process.env.QA_URL || 'http://localhost:5198/';
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

async function main() {
  const browser = await chromium.launch({ headless: true });
  // deviceScaleFactor 2x — 10px 마커 실제 픽셀 가독성 확대 확인용.
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await login(page);
  await page.click('#btnEnterComm');
  await page.waitForTimeout(900);
  await page.fill(`#commBody .qty-input[data-model="${SET_MODEL}"]`, '3');
  await page.waitForTimeout(600);

  const row = page.locator(`#commBody tr[data-set-model="${SET_MODEL}"]`);
  await row.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  // 화면 좌측 고정(position:fixed;top:80px~160px) #handleLeft 사이드드로어 핸들(#798 무관 기존 UI)과
  // 우연히 겹치는 스크롤 위치를 피하기 위해 추가로 아래로 스크롤(마커 자체 판독 순수 확인 목적).
  await page.evaluate(() => {
    const scroller = document.querySelector('#cardComm .table-wrap') || document.querySelector('#cardComm');
    if (scroller) scroller.scrollTop += 220;
    else window.scrollBy(0, 220);
  });
  await page.waitForTimeout(300);

  // 행 전체(모델명·수량 포함)를 잘라 맥락과 함께 확대.
  await row.screenshot({ path: `${OUT}/mobile-closeup-set-row-2x.png` });
  console.log('saved mobile-closeup-set-row-2x');

  // 이름셀만 초근접.
  await row.locator('td.colD.mobile-only').screenshot({ path: `${OUT}/mobile-closeup-name-cell-2x.png` });
  console.log('saved mobile-closeup-name-cell-2x');

  const info = await page.evaluate((sel) => {
    const r = document.querySelector(sel);
    const cell = r.querySelector('td.colD.mobile-only');
    const before = getComputedStyle(cell, '::before');
    return { fontSize: before.fontSize, color: before.color, cellFontSize: getComputedStyle(cell).fontSize };
  }, `#commBody tr[data-set-model="${SET_MODEL}"]`);
  console.log('marker computed style(mobile):', JSON.stringify(info));

  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
