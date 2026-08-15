const { chromium } = require('../../../clients/web/estimate-app/node_modules/playwright');
const path = require('node:path');

const estimateUrl = process.env.QA_ESTIMATE_URL;
if (!estimateUrl) throw new Error('QA_ESTIMATE_URL required');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const rpc = [];
    page.on('response', async (response) => {
      if (!response.url().includes('/rpc/getQuoteHistory')) return;
      let body = '';
      try { body = await response.text(); } catch (_) {}
      rpc.push({ status: response.status(), body });
    });
    await page.goto(estimateUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => typeof window.goSnapshotPage === 'function', null, { timeout: 60000 });
    await page.locator('#btnLoadSnapshot').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('#btnLoadSnapshot').click();
    await page.waitForFunction(() => {
      const text = document.getElementById('snapshotTableBody')?.innerText || '';
      return !text.includes('불러오는 중입니다');
    }, null, { timeout: 30000 });
    const state = await page.evaluate(() => ({
      pageVisible: getComputedStyle(document.getElementById('divSnapshotPage')).display,
      tableText: document.getElementById('snapshotTableBody')?.innerText || '',
      viewButtonCount: document.querySelectorAll('#snapshotTableBody button').length,
      startDate: document.getElementById('snapStart')?.value || '',
      endDate: document.getElementById('snapEnd')?.value || '',
    }));
    await page.screenshot({
      path: path.join(__dirname, '02-estimate-snapshot-empty-real-qa.png'),
      fullPage: false,
    });
    console.log(`PLAYWRIGHT_VERSION=${require('../../../clients/web/estimate-app/node_modules/playwright/package.json').version}`);
    console.log(`SNAPSHOT_STATE=${JSON.stringify(state)}`);
    console.log(`SNAPSHOT_RPC=${JSON.stringify(rpc)}`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
