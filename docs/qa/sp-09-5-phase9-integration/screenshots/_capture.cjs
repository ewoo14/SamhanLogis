// Playwright 브라우저 경로 (ms-playwright 시스템 캐시)
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH ||
  (process.env.LOCALAPPDATA
    ? require('path').join(process.env.LOCALAPPDATA, 'ms-playwright')
    : 'C:\\Users\\user\\AppData\\Local\\ms-playwright');
const { chromium } = require('C:/dev/SamhanLogis/clients/desktop/node_modules/@playwright/test');
const path = require('path');
const fs = require('fs');

const HERE = __dirname;
const targets = [
  '01-vendor-dashboard',
  '02-vendor-placeholder-errors',
  '03-vendor-permission-matrix',
  '04-phase-11-cutover-flow',
];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  for (const slug of targets) {
    const html = path.join(HERE, `${slug}.html`);
    const png = path.join(HERE, `${slug}.png`);
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
