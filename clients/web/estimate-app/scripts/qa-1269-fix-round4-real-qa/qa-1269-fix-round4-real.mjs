import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolveQaShotsDir } from '../../../../../scripts/lib/qa-shots-dir.mjs';

const require = createRequire(import.meta.url);
const { resolveQaCredential } = require('../../../../../scripts/lib/qa-credentials.cjs');
const here = path.dirname(fileURLToPath(import.meta.url));
const committedDir = path.resolve(here, '..', '..', '..', '..', '..', 'docs', 'qa', '1269-fix-round4-real-qa');
const out = resolveQaShotsDir(committedDir);
fs.mkdirSync(out, { recursive: true });
const base = process.env.QA_BASE_URL || 'http://localhost:5192';
const email = process.env.QA_EMAIL || 'dev_master@samhan-air.com';
resolveQaCredential('QA_DEV_DEFAULT_PASSWORD');
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
const visibleParts = async (id) => page.evaluate((sid) => Array.from(document.querySelectorAll(`tr.set-part-single[data-part-of="${CSS.escape(sid)}"]`)).filter((r) => r.style.display !== 'none').map((r) => ({ name: r.querySelector('.colD')?.textContent?.trim(), model: r.querySelector('.model')?.textContent?.trim(), price: r.querySelector('.price-input')?.value, qty: r.querySelector('.part-qty-single')?.value })), id);
const shot = async (name) => { const file = path.join(out, name); await page.evaluate(() => { document.body.classList.add('single-active'); document.body.classList.remove('no-active', 'orderInfo-active'); const card = document.getElementById('cardSingle'); if (card) { card.classList.remove('hidden'); card.style.display = 'flex'; card.style.visibility = 'visible'; } }); await page.locator('#cardSingle').screenshot({ path: file }); return file; };

try {
  await page.goto(`${base}/?email=${encodeURIComponent(email)}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('#singleBody tr', { state: 'attached', timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { if (typeof goSingle === 'function') goSingle(); });
  await page.waitForTimeout(800);
  const target = await page.evaluate(() => { const row = [...document.querySelectorAll('#singleBody tr[data-id]')].find((r) => r.querySelector('.model')?.textContent?.trim() === 'AC060BS4PBH7SY'); if (!row) return { error: '4way AC060 row not found' }; const input = row.querySelector('.qty-input'); input.value = '1'; input.dispatchEvent(new Event('change', { bubbles: true })); return { id: row.dataset.id }; });
  if (target.error) throw new Error(target.error);
  const id = target.id;
  await page.waitForTimeout(900);
  await page.evaluate((sid) => document.querySelector(`#singleBody tr[data-id="${CSS.escape(sid)}"] .toggle-comp-single`)?.click(), id);
  await page.waitForTimeout(700);
  const read = async () => ({ header: await page.locator(`#singleBody tr[data-id="${id}"] .price-input`).inputValue(), rows: await visibleParts(id) });
  const basic = await read(); basic.screenshot = await shot('01-AC060-4way-기본-세트상세.png');
  await page.evaluate(() => { const s = document.querySelector('#ss_panel'); s.value = '블랙판넬'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(1200);
  const black = await read(); black.screenshot = await shot('02-AC060-4way-블랙-세트상세.png');
  await page.evaluate(() => { const s = document.querySelector('#ss_panel'); s.value = ''; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(1200);
  const back = await read();
  const data = { target, basic, black, back, rows: { basic: basic.rows.length, black: black.rows.length, back: back.rows.length } };
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(data, null, 2), 'utf8');
  console.log(JSON.stringify(data, null, 2));
} finally { await browser.close(); }
