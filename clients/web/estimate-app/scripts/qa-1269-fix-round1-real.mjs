import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveQaShotsDir } from '../../../../scripts/lib/qa-shots-dir.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = resolveQaShotsDir(path.resolve(here, '..', '..', '..', '..', 'docs', 'qa', '1269-fix-round1-real-qa'));
fs.mkdirSync(out, { recursive: true });
const base = process.env.QA_BASE_URL || 'http://localhost:5190';
const url = `${base}/?email=dev_master@samhan-air.com`;
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 240)));
const shot = async (name) => { const p = path.join(out, name); await page.screenshot({ path: p, fullPage: false }); return p; };
const visibleParts = async (id) => page.evaluate((sid) => Array.from(document.querySelectorAll(`tr.set-part-single[data-part-of="${CSS.escape(sid)}"]`)).filter((r) => r.style.display !== 'none').map((r) => ({ name: r.querySelector('.colD')?.textContent?.trim(), model: r.querySelector('.model')?.textContent?.trim(), price: r.querySelector('.price-input')?.value, qty: r.querySelector('.part-qty-single')?.value })), id);

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('#singleBody tr', { state: 'attached', timeout: 60000 });
  await page.waitForTimeout(2500);
  const auth = await page.evaluate(() => ({ authorized: USER_AUTH?.authorized ?? null, rows: document.querySelectorAll('#singleBody tr').length }));
  console.log('auth/initialRows=', JSON.stringify(auth));
  console.log('priceSources=', JSON.stringify(await page.evaluate(() => ({
    inc: Object.entries(PRICE_INC?.single || {}).filter(([k]) => /AR-EH05|AWR-WE13N|AWR-WG00N/.test(k)),
    parts: (SINGLE_PARTS || []).filter((p) => /AR-EH05|AWR-WE13N|AWR-WG00N/.test(p.model)).slice(0, 6).map((p) => ({ model: p.model, price: p.price, feat: p.feat, component_variant: p.component_variant })),
    mat: SINGLE_MAT
  }))));
  const sweep = await page.evaluate(() => {
    const kinds = ['INDOOR', 'OUTDOOR', 'PANEL', 'REMOTE', 'MATERIAL', 'ACCESSORY'];
    const classify = (p) => {
      const t = `${p.kind || ''} ${p.name || ''} ${p.feat || ''}`;
      if (/실내기/.test(t)) return 'INDOOR';
      if (/실외기/.test(t)) return 'OUTDOOR';
      if (/판넬|패널/.test(t)) return 'PANEL';
      if (/리모컨|리모콘/.test(t)) return 'REMOTE';
      if (/자재/.test(t)) return 'MATERIAL';
      return 'ACCESSORY';
    };
    return Object.fromEntries(kinds.map((kind) => {
      const rows = (SINGLE_PARTS || []).filter((p) => classify(p) === kind);
      const prices = rows.map((p) => componentDeliveryPrice_(p));
      return [kind, { rows: rows.length, nonThousand: prices.filter((v) => v % 1000 !== 0).length, min: prices.length ? Math.min(...prices) : null, max: prices.length ? Math.max(...prices) : null }];
    }));
  });
  console.log('sweep=', JSON.stringify(sweep));
  await page.evaluate(() => { if (typeof goSingle === 'function') goSingle(); });
  await page.waitForTimeout(900);
  const target = await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll('#singleBody tr[data-id]')).find((r) => r.querySelector('.model')?.textContent?.trim() === 'AC060CS6PBH1SY');
    if (!row) return { error: 'AC060 row not found' };
    const input = row.querySelector('.qty-input');
    input.value = '1'; input.dispatchEvent(new Event('change', { bubbles: true }));
    return { id: row.dataset.id, model: row.querySelector('.model')?.textContent?.trim(), header: row.querySelector('.price-input')?.value };
  });
  if (target.error) throw new Error(target.error);
  await page.waitForTimeout(700);
  const id = target.id;
  const open = await page.evaluate((sid) => { const row = document.querySelector(`#singleBody tr[data-id="${CSS.escape(sid)}"]`); row?.querySelector('.toggle-comp-single')?.click(); return { rows: document.querySelectorAll(`tr.set-part-single[data-part-of="${CSS.escape(sid)}"]`).length }; }, id);
  await page.waitForTimeout(500);
  const wireless = await visibleParts(id); const wirelessHeader = await page.locator(`#singleBody tr[data-id="${id}"] .price-input`).inputValue(); const wirelessShot = await shot('01-AC060-무선-상세.png');
  await page.evaluate(() => { const s = document.querySelector('#ss_remote'); if (s) { s.value = '유선리모컨'; s.dispatchEvent(new Event('change', { bubbles: true })); } });
  await page.waitForTimeout(900);
  const wired = await visibleParts(id); const wiredShot = await shot('02-AC060-유선-상세.png');
  const values = await page.evaluate((sid) => {
    const row = document.querySelector(`#singleBody tr[data-id="${CSS.escape(sid)}"]`);
    const rows = Array.from(document.querySelectorAll(`tr.set-part-single[data-part-of="${CSS.escape(sid)}"]`)).filter((r) => r.style.display !== 'none');
    const part = (rx) => rows.find((r) => rx.test(r.querySelector('.colD')?.textContent || ''))?.querySelector('.price-input')?.value || null;
    return { header: row?.querySelector('.price-input')?.value || null, indoor: part(/실내기/), outdoor: part(/실외기/), panel: part(/판넬|패널/), remote: part(/리모컨|리모콘/), rowCount: rows.length, model: row?.querySelector('.model')?.textContent?.trim() || null };
  }, id);
  console.log('wireless=', JSON.stringify({ header: wirelessHeader, rowCount: wireless.length, rows: wireless }));
  console.log('wired=', JSON.stringify({ rowCount: wired.length, rows: wired }));
  console.log('values=', JSON.stringify(values));
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ auth, target, open, wireless: { header: wirelessHeader, rows: wireless }, wired: { header: values.header, rows: wired }, values, screenshots: [wirelessShot, wiredShot] }, null, 2), 'utf8');
} finally {
  await browser.close();
}
