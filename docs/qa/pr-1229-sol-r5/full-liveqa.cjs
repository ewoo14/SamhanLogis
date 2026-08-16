const { chromium } = require('../../../qa/playwright/node_modules/playwright');
const path = require('path');

const BASE = 'http://127.0.0.1:25128/';
const OUT = path.join(__dirname, 'screenshots');

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
  if (await tutorialNo.isVisible().catch(() => false)) await tutorialNo.click();
  else {
    const tutorialSkip = page.getByRole('button', { name: '튜토리얼 스킵', exact: true });
    if (await tutorialSkip.isVisible().catch(() => false)) await tutorialSkip.click();
  }
  await page.locator('#btnEnterHome').click();
  await page.locator('#homeFilterText').waitFor({ state: 'visible', timeout: 10000 });
}

async function setQty(page, model, qty) {
  const row = page.locator('#homeBody tr').filter({ hasText: model }).first();
  await row.scrollIntoViewIfNeeded();
  const input = row.locator('input').first();
  await input.fill(String(qty));
  await input.dispatchEvent('change');
  await page.waitForTimeout(300);
  return row;
}

async function fillOrder(page, suffix) {
  await page.locator('#btnProceed').click();
  await page.locator('#pageOrderInfo').waitFor({ state: 'visible' });
  await page.locator('#addrBase').evaluate((e) => { e.value = '서울특별시 중구 세종대로 110'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#addrDetail').fill(`SOL 격리QA ${suffix}`);
  await page.locator('#sameAddr').check();
  await page.locator('#tel').fill('01012345678');
  const today = new Date();
  const due = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10);
  const payDue = new Date(today.getTime() + 14 * 86400000).toISOString().slice(0, 10);
  await page.locator('#due').fill(due);
  await page.locator('#payDue').fill(payDue);
  await page.locator('#memo').fill(`SOL #1229 격리 QA ${suffix}`);
  await page.locator('#memo').dispatchEvent('input');
  await page.locator('#btnSendOrder').waitFor({ state: 'visible' });
  if (await page.locator('#btnSendOrder').isDisabled()) throw new Error('전송목록 확인 비활성');
  await page.locator('#btnSendOrder').click();
  await page.locator('#dlgFinal').waitFor({ state: 'visible' });
}

async function runScenario(browser, scenario) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const api = [];
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));
  page.on('response', async res => {
    if (!res.url().includes('/api/')) return;
    if (!/price-preview|\/drafts|\/confirm/.test(res.url())) return;
    let body = null;
    try { body = await res.json(); } catch {}
    api.push({ status: res.status(), method: res.request().method(), url: res.url(), body });
  });
  try {
    await login(page);
    const rows = [];
    for (const item of scenario.items) rows.push(await setQty(page, item.model, item.qty));
    await page.locator('#btnPreview').click();
    await page.locator('#dlgPreview').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('#btnProceed').waitFor({ state: 'visible' });
    await page.waitForTimeout(800);
    if (await page.locator('#btnProceed').isDisabled()) throw new Error('미리보기 실패');
    const previewRows = await page.locator('#previewBody tr').count();
    const previewText = await page.locator('#dlgPreview').innerText();
    const catalogRows = [];
    for (let i = 0; i < rows.length; i++) catalogRows.push(await rows[i].innerText());
    await page.locator('#dlgPreview .modal').screenshot({ path: path.join(OUT, `${scenario.prefix}-preview.png`) });
    await page.locator('#dlgPreview').evaluate(d => d.close());
    for (const row of rows) await row.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(OUT, `${scenario.prefix}-catalog.png`), fullPage: false });
    await page.locator('#dlgPreview').evaluate(d => d.showModal());
    await fillOrder(page, scenario.prefix);
    const finalRows = await page.locator('#finalBody tr').count();
    const finalText = await page.locator('#dlgFinal').innerText();
    await page.locator('#dlgFinal .modal').screenshot({ path: path.join(OUT, `${scenario.prefix}-final.png`) });
    await page.locator('#btnFinalSend').click();
    await page.locator('#dlgProgress').waitFor({ state: 'visible' });
    await page.waitForFunction(() => /완료|실패|에러/.test(document.querySelector('#progressText')?.innerText || ''), null, { timeout: 30000 });
    const progressText = await page.locator('#progressText').innerText();
    await page.locator('#dlgProgress .modal').screenshot({ path: path.join(OUT, `${scenario.prefix}-result.png`) });
    console.log('SCENARIO', JSON.stringify({
      name: scenario.name,
      catalogRows,
      previewRows,
      previewText,
      finalRows,
      finalText,
      progressText,
      api,
      pageErrors,
      visibleUuidCount: ((await page.locator('body').innerText()).match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/ig) || []).length,
    }, null, 2));
  } finally {
    await page.close();
  }
}

(async () => {
  if (!process.env.QA_BIZ_NO || !process.env.QA_PARTNER_ORDER_PASSWORD) throw new Error('QA 자격 환경변수 누락');
  const browser = await chromium.launch({ headless: true });
  try {
    await runScenario(browser, { name: 'AR-CH01', prefix: '01-ar-ch01', items: [{ model: 'AR-CH01', qty: 1 }] });
    await runScenario(browser, { name: 'AJ060+AXJ', prefix: '02-pair', items: [{ model: 'AJ060MXHNBC1', qty: 1 }, { model: 'AXJ-YA2512N', qty: 1 }] });
  } finally {
    await browser.close();
  }
})().catch(err => { console.error(err); process.exitCode = 1; });
