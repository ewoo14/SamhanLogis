import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolveQaShotsDir } from '../../../../scripts/lib/qa-shots-dir.mjs';

const require = createRequire(import.meta.url);
const { resolveQaCredential } = require('../../../../scripts/lib/qa-credentials.cjs');
const here = path.dirname(fileURLToPath(import.meta.url));
const committedDir = path.resolve(here, '..', '..', '..', '..', 'docs', 'qa', '1269-fix-round3-real-qa');
const out = resolveQaShotsDir(committedDir);
fs.mkdirSync(out, { recursive: true });
const base = process.env.QA_BASE_URL || 'http://localhost:5183';
const email = process.env.QA_EMAIL || 'dev_master@samhan-air.com';
resolveQaCredential();
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
const shot = async (name) => { const p = path.join(out, name); await page.evaluate(() => { document.body.classList.add('single-active'); document.body.classList.remove('no-active', 'orderInfo-active'); const card = document.getElementById('cardSingle'); if (card) { card.classList.remove('hidden'); card.style.display = 'flex'; card.style.visibility = 'visible'; } }); await page.locator('#cardSingle').screenshot({ path: p }); return p; };
const visibleParts = async (id) => page.evaluate((sid) => Array.from(document.querySelectorAll(`tr.set-part-single[data-part-of="${CSS.escape(sid)}"]`)).filter((r) => r.style.display !== 'none').map((r) => ({ name: r.querySelector('.colD')?.textContent?.trim(), model: r.querySelector('.model')?.textContent?.trim(), price: r.querySelector('.price-input')?.value, qty: r.querySelector('.part-qty-single')?.value })), id);

try {
  await page.goto(`${base}/?email=${encodeURIComponent(email)}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('#singleBody tr', { state: 'attached', timeout: 60000 });
  await page.waitForTimeout(2500);
  const auth = await page.evaluate(() => ({ authorized: USER_AUTH?.authorized ?? null, rows: document.querySelectorAll('#singleBody tr').length }));
  const sweep = await page.evaluate(() => {
    const kinds = ['INDOOR', 'OUTDOOR', 'PANEL', 'REMOTE', 'MATERIAL', 'ACCESSORY'];
    const classify = (p) => { const t = `${p.kind || ''} ${p.name || ''} ${p.feat || ''}`; if (/실내기/.test(t)) return 'INDOOR'; if (/실외기/.test(t)) return 'OUTDOOR'; if (/판넬|패널/.test(t)) return 'PANEL'; if (/리모컨|리모콘/.test(t)) return 'REMOTE'; if (/자재/.test(t)) return 'MATERIAL'; return 'ACCESSORY'; };
    const states = ['', '판넬제외', '블랙판넬', '승강판넬', '공청판넬', '유선리모컨', '컬러유선리모컨', '자재포함', '원형', '사각', '기본복귀'];
    const panel = document.getElementById('ss_panel');
    const remote = document.getElementById('ss_remote');
    const mat = document.getElementById('ss_mat');
    const shape = document.getElementById('ss_p360');
    const sets = (SINGLE_SETS || []).filter((s) => partsForSetStrict_(s).length);
    const result = Object.fromEntries(kinds.map((kind) => [kind, { activeRows: 0, nonThousand: 0, examples: [] }]));
    for (const state of states) {
      if (panel) panel.value = /판넬|제외/.test(state) ? state : '';
      if (remote) remote.value = /리모컨/.test(state) ? state : '';
      if (mat) mat.value = state === '자재포함' ? '포함' : '별도';
      if (shape) shape.value = state === '사각' ? '사각' : '원형';
      for (const s of sets) {
        const parts = explodeSetParts(s, 1, calcSetUnitPrice(s));
        for (const p of parts) { const kind = classify(p); result[kind].activeRows += 1; if (Number(p.price) % 1000 !== 0) { result[kind].nonThousand += 1; if (result[kind].examples.length < 12) result[kind].examples.push({ state, set: s.model, model: p.model, price: p.price }); } }
      }
    }
    return { componentRows: (SINGLE_PARTS || []).length, distinctVariants: new Set((SINGLE_PARTS || []).map((p) => `${p.component_variant || p.componentVariant || p.feat || ''}`)).size, setsWithComponents: sets.length, stateRuns: sets.length * states.length, states: states.length, byKind: result };
  });
  // sweep은 DOM 옵션을 순회하므로 실제 양방향 화면 검증은 깨끗한 페이지에서 다시 시작한다.
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('#singleBody tr', { state: 'attached', timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { if (typeof goSingle === 'function') goSingle(); });
  await page.waitForTimeout(1000);
  const target = await page.evaluate(() => { const row = [...document.querySelectorAll('#singleBody tr[data-id]')].find((r) => r.querySelector('.model')?.textContent?.trim() === 'AC060BS4PBH7SY'); if (!row) return { error: '4way AC060 row not found' }; const input = row.querySelector('.qty-input'); input.value = '1'; input.dispatchEvent(new Event('change', { bubbles: true })); return { id: row.dataset.id }; });
  if (target.error) throw new Error(target.error);
  await page.waitForTimeout(1000);
  const id = target.id;
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
  const data = { auth, target, basic, black, back, sweep };
  console.log(JSON.stringify(data, null, 2));
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(data, null, 2), 'utf8');
} finally { await browser.close(); }
