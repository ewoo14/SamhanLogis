import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(process.cwd(), '../..');
const screenshotDir = path.join(repoRoot, 'docs/qa/ow-r13/screenshots');

const bootstrap = {
  singleSets: [
    { id: 'ar-set', model: 'AR06D1150HZS', name: '싱글중대형 AR', price: 370000 },
    { id: 'ac-set', model: 'AC060CS6PBH1SY', name: '360 CST UV', price: 1590000 },
  ],
  singleParts: [
    { setModel: 'ar-set', model: 'AR-INDOOR', name: '실내기', qty: 1, price: 148000, unit: 'EA' },
    { setModel: 'ar-set', model: 'AR-OUTDOOR', name: '실외기', qty: 1, price: 222000, unit: 'EA' },
    { setModel: 'ac-set', model: 'AC-INDOOR', name: '실내기', qty: 1, price: 588975, unit: 'EA' },
    { setModel: 'ac-set', model: 'AC-OUTDOOR', name: '실외기', qty: 1, price: 883050, unit: 'EA' },
    { setModel: 'ac-set', model: 'AC-PANEL', name: '판넬', qty: 1, price: 104060, unit: 'EA' },
    { setModel: 'ac-set', model: 'AC-REMOTE', name: '리모컨', qty: 1, price: 13915, unit: 'EA' },
  ],
  priceChangeSchedule: { singleSets: '2026-07-01' },
  singleInc: {}, singlePartsInc: {}, singleDefaults: {}, config: {},
  homemulti: [], homeDefaults: {}, homeInc: {}, commercialMulti: [],
  commercialParts: [], commInc: {}, commPartsInc: {}, oldProducts: [],
};

async function openSingle(page: any) {
  await page.goto('/');
  await page.locator('#pageBizGate').evaluate((node: HTMLElement) => node.classList.add('hidden'));
  await page.locator('body').evaluate((node: HTMLElement) => node.classList.remove('no-active'));
  await page.locator('#btnGoSingle').evaluate((node: HTMLElement) => node.click());
  await expect(page.locator('#cardSingle')).toBeVisible();
}

async function mockOrderApp(page: any) {
  await page.route('**/api/v1/partner-orders/bootstrap', (route: any) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { payloads: bootstrap } }) }));
  await page.route('**/price-preview*', async (route: any) => {
    const body = route.request().postDataJSON() || { lines: [] };
    const prices: Record<string, number> = {
      'AR-INDOOR': 148000, 'AR-OUTDOOR': 222000,
      'AC-INDOOR': 588975, 'AC-OUTDOOR': 883050,
      'AC-PANEL': 104060, 'AC-REMOTE': 13915,
    };
    const lines = body.lines.map((line: any, index: number) => ({
      lineId: String(body.lines.indexOf(line)), modelCode: line.modelCode,
      quantity: line.quantity, finalPrice: prices[line.modelCode] || line.unitPrice || 0, appliedRate: null,
    }));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      success: true, data: { lines, totalListAmount: lines.reduce((sum: number, line: any) => sum + line.finalPrice * line.quantity, 0), totalFinalAmount: lines.reduce((sum: number, line: any) => sum + line.finalPrice * line.quantity, 0) },
    }) });
  });
}

async function renderDetailedMockPreview(page: any, rows: Array<{ name: string; model: string; qty: number; price: number }>) {
  await page.evaluate((items) => {
    const body = document.querySelector('#previewBody') as HTMLElement;
    body.innerHTML = items.map((item) => `<tr class="child"><td>${item.name}</td><td>${item.model}</td><td>EA</td><td>${item.qty}</td><td>${item.price.toLocaleString()}</td><td>${(item.qty * item.price).toLocaleString()}</td></tr>`).join('');
    const dialog = document.querySelector('#dlgPreview') as HTMLDialogElement;
    if (!dialog.open) dialog.showModal();
  }, rows);
}

test.describe('OW-R13 금액 표시 parity 증거', () => {
  test.beforeEach(async ({ page }) => {
    await mockOrderApp(page);
    fs.mkdirSync(screenshotDir, { recursive: true });
  });

  test('AR06D1150HZS 납기 기준일 전후 상세행', async ({ page }) => {
    await openSingle(page);
    await page.locator('input[data-sid="ar-set"]').fill('1');
    await page.locator('#due').evaluate((node: HTMLInputElement) => { node.value = '2026-08-20'; node.dispatchEvent(new Event('change', { bubbles: true })); });
    await renderDetailedMockPreview(page, [
      { name: '● 실내기', model: 'AR-INDOOR', qty: 1, price: 148000 },
      { name: '● 실외기', model: 'AR-OUTDOOR', qty: 1, price: 222000 },
    ]);
    await expect(page.locator('#dlgPreview')).toBeVisible();
    await expect(page.locator('#previewBody')).toContainText('148,000');
    await expect(page.locator('#previewBody')).toContainText('222,000');
    await page.screenshot({ path: path.join(screenshotDir, 'ow-r13-ar06d1150hzs-due-after-detail.png'), fullPage: false });
  });

  test('AC060CS6PBH1SY 세트 배분 상세행', async ({ page }) => {
    await openSingle(page);
    await page.locator('input[data-sid="ac-set"]').fill('1');
    await page.locator('#due').evaluate((node: HTMLInputElement) => { node.value = '2026-08-20'; node.dispatchEvent(new Event('change', { bubbles: true })); });
    await renderDetailedMockPreview(page, [
      { name: '● 실내기', model: 'AC-INDOOR', qty: 1, price: 588975 },
      { name: '● 실외기', model: 'AC-OUTDOOR', qty: 1, price: 883050 },
      { name: '● 판넬', model: 'AC-PANEL', qty: 1, price: 104060 },
      { name: '● 리모컨', model: 'AC-REMOTE', qty: 1, price: 13915 },
    ]);
    await expect(page.locator('#dlgPreview')).toBeVisible();
    await expect(page.locator('#previewBody')).toContainText('588,975');
    await expect(page.locator('#previewBody')).toContainText('883,050');
    await expect(page.locator('#previewBody')).toContainText('104,060');
    await expect(page.locator('#previewBody')).toContainText('13,915');
    await page.screenshot({ path: path.join(screenshotDir, 'ow-r13-ac060cs6pbh1sy-allocated-detail.png'), fullPage: false });
  });
});
