const { chromium } = require('C:/dev/SamhanLogis/clients/desktop/node_modules/@playwright/test');
const path = require('path');
const fs = require('fs');

const HERE = __dirname;
const targets = [
  '01-nts-emit-before-issued',
  '02-nts-emit-confirm-modal',
  '03-nts-emitted-etax-external-id',
  '04-role-guard-sales-403',
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
