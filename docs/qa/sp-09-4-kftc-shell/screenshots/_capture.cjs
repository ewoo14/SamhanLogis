// Playwright 브라우저 경로 (ms-playwright 시스템 캐시)
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH ||
  (process.env.LOCALAPPDATA
    ? require('path').join(process.env.LOCALAPPDATA, 'ms-playwright')
    : 'C:\\Users\\user\\AppData\\Local\\ms-playwright');
const { chromium } = require('C:/dev/SamhanLogis/clients/desktop/node_modules/@playwright/test');
const path = require('path');
const fs = require('fs');
const { resolveQaShotsDir } = require('../../../../scripts/lib/qa-shots-dir.cjs');

const HERE = __dirname; // .html 픽스처 원본 — 읽기 전용, 항상 커밋된 디렉토리
// _local 격리(2026-07-27 하네스 흡수 H2 — 산출 PNG 는 HERE 와 분리해 기본 _local/ 로 쓴다).
const OUT_DIR = resolveQaShotsDir(HERE);
const targets = [
  '01-deposit-fetch-form',
  '02-deposit-match-result-success',
  '03-deposit-match-detail',
  '04-deposit-fetch-failure',
];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  for (const slug of targets) {
    const html = path.join(HERE, `${slug}.html`);
    const png = path.join(OUT_DIR, `${slug}.png`);
    if (!fs.existsSync(html)) { console.error('missing', html); continue; }
    const url = 'file:///' + html.replace(/\\/g, '/');
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await page.screenshot({ path: png, fullPage: true });
    const sz = fs.statSync(png).size;
    console.log(`${slug}.png · ${(sz/1024).toFixed(1)} KB`);
  }
  await browser.close();
})();
