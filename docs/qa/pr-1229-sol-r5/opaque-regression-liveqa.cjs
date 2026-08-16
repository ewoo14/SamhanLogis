const { chromium } = require('../../../qa/playwright/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto('http://127.0.0.1:25128/', { waitUntil: 'networkidle' });
    await page.locator('#bizGateInput').fill(process.env.QA_BIZ_NO);
    await page.locator('#btnBizQuery').click();
    await page.locator('#authPw1').waitFor({ state: 'visible' });
    await page.locator('#authPw1').fill(process.env.QA_PARTNER_ORDER_PASSWORD);
    await page.locator('#btnAuthAction').click();
    await page.locator('#btnEnterHome').waitFor({ state: 'visible' });
    await page.waitForFunction(() => Boolean(sessionStorage.getItem('samhan-partner-token')), null, { timeout: 10000 });
    const token = await page.evaluate(() => sessionStorage.getItem('samhan-partner-token'));
    if (!token) throw new Error('세션 토큰 누락');
    const result = await page.evaluate(async ({ auth, opaque }) => {
      const headers = { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json', 'X-Biz-Code': '1068689215' };
      async function draft(label) {
        const r = await fetch('http://127.0.0.1:25129/api/v1/partner-orders/drafts', {
          method: 'POST', headers, body: JSON.stringify({ label, payloadJson: JSON.stringify({ source: 'SOL-1229-R5' }) }),
        });
        return (await r.json()).data.draftId;
      }
      async function confirm(productId, label) {
        const draftId = await draft(label);
        const r = await fetch(`http://127.0.0.1:25129/api/v1/partner-orders/${encodeURIComponent(draftId)}/confirm`, {
          method: 'POST', headers,
          body: JSON.stringify({ lines: [{ productId, categoryKey: 'homemulti', quantity: 1, remark: label }] }),
        });
        return { status: r.status, body: await r.json() };
      }
      return {
        normalOpaque: await confirm(opaque, 'SOL opaque 정상'),
        numeric22: await confirm('1234567890123456789012', 'SOL numeric22 거부'),
      };
    }, { auth: token, opaque: process.env.QA_OPAQUE_PRODUCT_ID });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
})().catch(err => { console.error(err); process.exitCode = 1; });
