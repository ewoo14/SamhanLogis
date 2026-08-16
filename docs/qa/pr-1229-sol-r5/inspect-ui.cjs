const { chromium } = require('../../../qa/playwright/node_modules/playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
    page.on('console', msg => console.log('CONSOLE', msg.type(), msg.text()));
    page.on('pageerror', err => console.log('PAGEERROR', err.message));
    page.on('response', res => {
      if (res.url().includes('/api/')) console.log('HTTP', res.status(), res.request().method(), res.url());
    });
    await page.goto('http://127.0.0.1:25128/', { waitUntil: 'networkidle', timeout: 30000 });
    if (process.env.QA_BIZ_NO && process.env.QA_PARTNER_ORDER_PASSWORD) {
      await page.locator('#bizGateInput').fill(process.env.QA_BIZ_NO);
      await page.locator('#btnBizQuery').click();
      await page.waitForTimeout(7500);
      console.log('AFTER_BIZ_BODY', (await page.locator('body').innerText()).slice(0, 5000));
      console.log('AFTER_BIZ_INPUTS', await page.locator('input').evaluateAll(nodes => nodes.map(n => ({id:n.id,type:n.type,placeholder:n.placeholder,hidden:n.offsetParent===null})).filter(x => !x.hidden)));
      console.log('AFTER_BIZ_BUTTONS', await page.locator('button').evaluateAll(nodes => nodes.map(n => ({id:n.id,text:n.innerText.trim(),hidden:n.offsetParent===null})).filter(x => !x.hidden)));
      await page.locator('#authPw1').fill(process.env.QA_PARTNER_ORDER_PASSWORD);
      await page.locator('#btnAuthAction').click();
      await page.waitForTimeout(10000);
      const tutorialNo = page.getByRole('button', { name: '아니오', exact: true });
      if (await tutorialNo.isVisible().catch(() => false)) {
        await tutorialNo.click();
        await page.waitForTimeout(1000);
      }
      await page.locator('#btnEnterHome').click();
      await page.waitForTimeout(2500);
      console.log('AFTER_LOGIN_BODY', (await page.locator('body').innerText()).slice(0, 12000));
      console.log('AFTER_LOGIN_INPUTS', await page.locator('input').evaluateAll(nodes => nodes.map(n => ({id:n.id,placeholder:n.placeholder,value:n.type === 'password' ? '[비공개]' : n.value,hidden:n.offsetParent===null})).filter(x => !x.hidden).slice(0,80)));
      console.log('AFTER_LOGIN_BUTTONS', await page.locator('button').evaluateAll(nodes => nodes.map(n => ({id:n.id,text:n.innerText.trim(),hidden:n.offsetParent===null})).filter(x => !x.hidden).slice(0,120)));
    }
    await page.screenshot({ path: path.join(__dirname, 'screenshots', '00-initial.png'), fullPage: true });
    console.log('TITLE', await page.title());
    console.log('BODY', (await page.locator('body').innerText()).slice(0, 12000));
    console.log('INPUTS', await page.locator('input').evaluateAll(nodes => nodes.map(n => ({id:n.id,name:n.name,type:n.type,placeholder:n.placeholder,value:n.type === 'password' ? '[비공개]' : n.value,hidden:n.offsetParent===null})).filter(x => !x.hidden)));
    console.log('BUTTONS', await page.locator('button').evaluateAll(nodes => nodes.map(n => ({id:n.id,text:n.innerText.trim(),hidden:n.offsetParent===null})).filter(x => !x.hidden)));
  } finally {
    await browser.close();
  }
})().catch(err => { console.error(err); process.exitCode = 1; });
