const { chromium } = require('../../../qa/playwright/node_modules/playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  let previewResponse = null;
  page.on('response', async res => {
    if (!res.url().includes('/price-preview')) return;
    let body = null;
    try { body = await res.json(); } catch {}
    previewResponse = { status: res.status(), body };
  });
  try {
    await page.goto('http://127.0.0.1:25128/', { waitUntil: 'networkidle' });
    await page.locator('#bizGateInput').fill(process.env.QA_BIZ_NO);
    await page.locator('#btnBizQuery').click();
    await page.locator('#authPw1').waitFor({ state: 'visible' });
    await page.locator('#authPw1').fill(process.env.QA_PARTNER_ORDER_PASSWORD);
    await page.locator('#btnAuthAction').click();
    await page.locator('#btnEnterHome').waitFor({ state: 'visible' });
    await page.waitForTimeout(5000);
    const no = page.getByRole('button', { name: '아니오', exact: true });
    if (await no.isVisible().catch(() => false)) await no.click();
    await page.locator('#btnEnterHome').click();
    const row = page.locator('#homeBody tr').filter({ hasText: 'AR-CH01' }).first();
    await row.locator('input').first().fill('1');
    await row.locator('input').first().dispatchEvent('change');
    await page.locator('#btnPreview').click();
    await page.locator('#dlgPreview').waitFor({ state: 'visible' });
    await page.waitForTimeout(1200);
    await page.locator('#dlgPreview .modal').screenshot({ path: path.join(__dirname, 'screenshots', '03-price-preview-503-fail-closed.png') });
    console.log(JSON.stringify({
      previewResponse,
      screenRows: await page.locator('#previewBody tr').count(),
      screenText: await page.locator('#dlgPreview').innerText(),
      proceedDisabled: await page.locator('#btnProceed').isDisabled(),
      catalogRowAfterFailure: await row.innerText(),
    }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(err => { console.error(err); process.exitCode = 1; });
