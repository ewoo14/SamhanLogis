/**
 * Phase 10 W10-3 — QA capture script.
 *
 * 3 HTML mockup → PNG screenshot (1180px wide, full page).
 *   1. 1-driver-dashboard-screen.html   → 1-driver-dashboard-screen.png
 *   2. 2-gps-permission-flow.html       → 2-gps-permission-flow.png
 *   3. 3-signature-capture.html         → 3-signature-capture.png
 *
 * 사용:
 *   node docs/qa/phase10-step-3-mobile-driver-tab/capture.cjs
 *
 * 가드:
 *   - 각 PNG > 10KB 의무 (PR #92 회고 가드).
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { resolveQaShotsDir } = require('../../../scripts/lib/qa-shots-dir.cjs');

const SRC_DIR = __dirname; // .html mockup 원본 — 읽기 전용, 항상 커밋된 디렉토리
// _local 격리(2026-07-27 하네스 흡수 H2 — 산출 PNG 는 SRC_DIR 와 분리해 기본 _local/ 로 쓴다).
const DIR = resolveQaShotsDir(SRC_DIR);
const FILES = [
  '1-driver-dashboard-screen',
  '2-gps-permission-flow',
  '3-signature-capture',
];

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  for (const name of FILES) {
    const html = path.join(SRC_DIR, `${name}.html`);
    const png = path.join(DIR, `${name}.png`);
    const url = 'file://' + html.replace(/\\/g, '/');
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.screenshot({ path: png, fullPage: true });
    const size = fs.statSync(png).size;
    console.log(`[OK] ${name}.png — ${(size / 1024).toFixed(1)} KB`);
    if (size < 10 * 1024) {
      console.error(`[FAIL] ${name}.png < 10KB — PR #92 가드 위반`);
      process.exit(1);
    }
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
