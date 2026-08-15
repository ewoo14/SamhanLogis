const { chromium } = require('../../../clients/web/estimate-app/node_modules/playwright');
const path = require('node:path');

const orderUrl = process.env.QA_ORDER_URL;
const estimateUrl = process.env.QA_ESTIMATE_URL;
const screenshotDir = __dirname;
const secretValues = [
  process.env.QA_SECRET_1,
  process.env.QA_SECRET_2,
  process.env.QA_SECRET_3,
].filter(Boolean);

if (!orderUrl || !estimateUrl) throw new Error('QA_ORDER_URL / QA_ESTIMATE_URL required');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const addressResponses = [];
    page.on('response', async (response) => {
      if (!response.url().includes('/address-search')) return;
      let body = '';
      try { body = await response.text(); } catch (_) {}
      addressResponses.push({ method: response.request().method(), status: response.status(), body });
    });

    await page.goto(orderUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(500);
    const state = await page.evaluate(() => {
      const display = (id) => {
        const node = document.getElementById(id);
        return node ? getComputedStyle(node).display : 'missing';
      };
      return {
        title: document.title,
        bizGateVisible: Boolean(document.getElementById('pageBizGate'))
          && getComputedStyle(document.getElementById('pageBizGate')).display !== 'none',
        shipNaverDisplay: display('btnAddrShipNaver'),
        auditNaverDisplay: display('btnAddrAuditNaver'),
        shipKakaoDisplay: display('btnAddrShipKakao'),
        auditKakaoDisplay: display('btnAddrAuditKakao'),
        kakaoRuntime: typeof window.kakao !== 'undefined' && typeof window.kakao.Postcode === 'function',
      };
    });
    await page.screenshot({
      path: path.join(screenshotDir, '01-order-entry-naver-hidden-real-qa.png'),
      fullPage: false,
    });

    const status = await page.request.get(`${estimateUrl}/address-search/status`, {
      headers: { Origin: orderUrl.replace(/\/$/, '') },
    });
    const statusBody = await status.text();
    const search = await page.request.post(`${estimateUrl}/address-search`, {
      headers: { Origin: orderUrl.replace(/\/$/, '') },
      data: { query: '삼성서울병원' },
    });
    const searchBody = await search.text();
    const observedBodies = [statusBody, searchBody, ...addressResponses.map((item) => item.body)];
    const secretMatches = secretValues.reduce(
      (count, secret) => count + observedBodies.filter((body) => body.includes(secret)).length,
      0,
    );

    console.log(`PLAYWRIGHT_VERSION=${require('../../../clients/web/estimate-app/node_modules/playwright/package.json').version}`);
    console.log(`ORDER_STATE=${JSON.stringify(state)}`);
    console.log(`AUTO_ADDRESS_RESPONSES=${JSON.stringify(addressResponses)}`);
    console.log(`STATUS_HTTP=${status.status()} BODY=${statusBody}`);
    console.log(`SEARCH_HTTP=${search.status()} BODY=${searchBody}`);
    console.log(`ADDRESS_RESPONSE_SECRET_MATCHES=${secretMatches}`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
