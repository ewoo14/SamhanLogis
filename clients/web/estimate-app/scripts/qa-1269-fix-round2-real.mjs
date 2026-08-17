import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolveQaShotsDir } from '../../../../scripts/lib/qa-shots-dir.mjs';

const require = createRequire(import.meta.url);
const { resolveQaCredential } = require('../../../../scripts/lib/qa-credentials.cjs');
const here = path.dirname(fileURLToPath(import.meta.url));
const committedDir = path.resolve(here, '..', '..', '..', '..', 'docs', 'qa', '1269-fix-round2-real-qa');
const out = resolveQaShotsDir(committedDir);
fs.mkdirSync(out, { recursive: true });
const base = process.env.QA_BASE_URL || 'http://localhost:5183';
const email = process.env.QA_EMAIL || 'dev_master@samhan-air.com';
resolveQaCredential();
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
const shot = async (name) => { const p = path.join(out, name); await page.screenshot({ path: p, fullPage: false }); return p; };
const visibleParts = async (id) => page.evaluate((sid) => Array.from(document.querySelectorAll(`tr.set-part-single[data-part-of="${CSS.escape(sid)}"]`)).filter((r) => r.style.display !== 'none').map((r) => ({ name: r.querySelector('.colD')?.textContent?.trim(), model: r.querySelector('.model')?.textContent?.trim(), price: r.querySelector('.price-input')?.value, qty: r.querySelector('.part-qty-single')?.value })), id);
try {
  await page.goto(`${base}/?email=${encodeURIComponent(email)}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('#singleBody tr', { state: 'attached', timeout: 60000 });
  await page.waitForTimeout(3000);
  const auth = await page.evaluate(() => ({ authorized: USER_AUTH?.authorized ?? null, rows: document.querySelectorAll('#singleBody tr').length }));
  const sweep = await page.evaluate(() => {
    const classify = (p) => { const t = `${p.kind || ''} ${p.name || ''} ${p.feat || ''}`; if (/실내기/.test(t)) return 'INDOOR'; if (/실외기/.test(t)) return 'OUTDOOR'; if (/판넬|패널/.test(t)) return 'PANEL'; if (/리모컨|리모콘/.test(t)) return 'REMOTE'; if (/자재/.test(t)) return 'MATERIAL'; return 'ACCESSORY'; };
    const delivery = { 'AR-EH05': 16000, 'AWR-WE13N': 56000, 'AWR-WG00N': 91000, 'PC6NUNK1NW': 128000, 'PC6NUDK1NW': 128000, 'PC6NBNK1NW': 188000, 'PC6NBDK1NW': 188000, 'PC6EUCK1NW': 678000, 'PC6NUCK1NW': 678000, 'PC6EUXK1NW': 188000, 'PC6NUXK1NW': 188000 };
    const result = {};
    for (const kind of ['INDOOR', 'OUTDOOR', 'PANEL', 'REMOTE', 'MATERIAL', 'ACCESSORY']) {
      const rows = (SINGLE_PARTS || []).filter((p) => classify(p) === kind);
      const prices = rows.map((p) => Number(delivery[p.model] || p.price || 0));
      result[kind] = { rows: rows.length, deliveryPrices: prices.filter((v) => v > 0).length, nonThousand: prices.filter((v) => v % 1000 !== 0).length };
    }
    return result;
  });
  await page.evaluate(() => { if (typeof goSingle === 'function') goSingle(); else document.querySelector('#btnGoSingle, [data-target="single"]')?.click(); });
  await page.waitForTimeout(1200);
  const target = await page.evaluate(() => { const row = [...document.querySelectorAll('#singleBody tr[data-id]')].find((r) => r.querySelector('.model')?.textContent?.trim() === 'AC060CS6PBH1SY'); if (!row) return { error: 'AC060 row not found' }; const input = row.querySelector('.qty-input'); input.value = '1'; input.dispatchEvent(new Event('change', { bubbles: true })); return { id: row.dataset.id }; });
  if (target.error) throw new Error(target.error);
  await page.waitForTimeout(1000);
  const id = target.id;
  await page.evaluate((sid) => document.querySelector(`#singleBody tr[data-id="${CSS.escape(sid)}"] .toggle-comp-single`)?.click(), id);
  await page.waitForTimeout(700);
  const wireless = { rows: await visibleParts(id), screenshot: await shot('01-AC060-무선-세트상세.png') };
  wireless.header = await page.locator(`#singleBody tr[data-id="${id}"] .price-input`).inputValue();
  await page.evaluate(() => { const s = document.querySelector('#ss_remote'); s.value = '유선리모컨'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(1200);
  const wired = { rows: await visibleParts(id), screenshot: await shot('02-AC060-유선-세트상세.png') };
  wired.header = await page.locator(`#singleBody tr[data-id="${id}"] .price-input`).inputValue();
  await page.evaluate(() => { const s = document.querySelector('#ss_remote'); s.value = ''; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(1200);
  const wirelessBack = { rows: await visibleParts(id), header: await page.locator(`#singleBody tr[data-id="${id}"] .price-input`).inputValue() };
  const values = { auth, target, wireless, wired, wirelessBack, sweep };
  console.log(JSON.stringify(values, null, 2));
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(values, null, 2), 'utf8');
} finally { await browser.close(); }
