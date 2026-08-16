const { chromium } = require('../../../qa/playwright/node_modules/playwright');
const path = require('path');
const { resolveQaShotsDir } = require('../../../scripts/lib/qa-shots-dir.cjs');

const BASE = 'http://127.0.0.1:25128/';
const OUT = resolveQaShotsDir(__dirname);

async function visibleSummary(page, label) {
  console.log(label + '_BODY', (await page.locator('body').innerText()).slice(0, 15000));
  console.log(label + '_INPUTS', await page.locator('input,textarea,select').evaluateAll(nodes => nodes
    .filter(n => n.offsetParent !== null)
    .map(n => ({ tag:n.tagName, id:n.id, name:n.name, type:n.type, placeholder:n.placeholder, value:n.type === 'password' ? '[비공개]' : n.value }))));
  console.log(label + '_BUTTONS', await page.locator('button').evaluateAll(nodes => nodes
    .filter(n => n.offsetParent !== null)
    .map(n => ({ id:n.id, text:n.innerText.trim(), disabled:n.disabled }))));
}

async function login(page) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('#bizGateInput').fill(process.env.QA_BIZ_NO);
  await page.locator('#btnBizQuery').click();
  await page.locator('#authPw1').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('#authPw1').fill(process.env.QA_PARTNER_ORDER_PASSWORD);
  await page.locator('#btnAuthAction').click();
  await page.locator('#btnEnterHome').waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(5000);
  const tutorialNo = page.getByRole('button', { name: '아니오', exact: true });
  if (await tutorialNo.isVisible().catch(() => false)) {
    await tutorialNo.click();
  }
  await page.waitForTimeout(1000);
  await page.locator('#btnEnterHome').click();
  await page.locator('#homeFilterText').waitFor({ state: 'visible', timeout: 10000 });
}

async function setQty(page, model, qty) {
  const row = page.locator('tr').filter({ hasText: model }).first();
  await row.scrollIntoViewIfNeeded();
  const input = row.locator('input').first();
  await input.fill(String(qty));
  await input.dispatchEvent('change');
  await page.waitForTimeout(500);
  return row;
}

(async () => {
  if (!process.env.QA_BIZ_NO || !process.env.QA_PARTNER_ORDER_PASSWORD) throw new Error('QA 자격 환경변수 누락');
  const browser = await chromium.launch({ headless: true });
  const observations = { responses: [], pageErrors: [] };
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
    page.on('pageerror', err => observations.pageErrors.push(err.message));
    page.on('response', async res => {
      if (!res.url().includes('/api/')) return;
      const entry = { status: res.status(), method: res.request().method(), url: res.url(), body: null };
      if (res.url().includes('price-preview') || res.url().includes('/confirm') || res.url().includes('/drafts')) {
        try { entry.body = await res.json(); } catch {}
      }
      observations.responses.push(entry);
      console.log('HTTP', entry.status, entry.method, entry.url);
    });
    await login(page);
    const arRow = await setQty(page, 'AR-CH01', 1);
    console.log('AR_ROW_BEFORE', await arRow.innerText());
    await page.locator('#btnPreview').click();
    await page.locator('#dlgPreview').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(1000);
    console.log('AR_ROW_AFTER', await arRow.innerText());
    console.log('PREVIEW_ROWS', await page.locator('#previewBody tr').count());
    console.log('PREVIEW_TEXT', await page.locator('#dlgPreview').innerText());
    await page.screenshot({ path: path.join(OUT, '01-ar-ch01-preview.png'), fullPage: true });
    await visibleSummary(page, 'PREVIEW');
    console.log('OBSERVATIONS', JSON.stringify(observations, null, 2));
  } finally {
    await browser.close();
  }
})().catch(err => { console.error(err); process.exitCode = 1; });
