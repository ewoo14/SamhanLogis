import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolveQaShotsDir } from '../../../../../scripts/lib/qa-shots-dir.mjs';

const require = createRequire(import.meta.url);
const { resolveQaCredential } = require('../../../../../scripts/lib/qa-credentials.cjs');
const here = path.dirname(fileURLToPath(import.meta.url));
const committedDir = path.resolve(here, '..', '..', '..', '..', '..', 'docs', 'qa', '1269-sol-reverdict-4-real-qa');
const out = resolveQaShotsDir(committedDir);
fs.mkdirSync(out, { recursive: true });

const base = process.env.QA_BASE_URL || 'http://localhost:5192';
const email = process.env.QA_EMAIL || 'dev_master@samhan-air.com';
resolveQaCredential('QA_DEV_DEFAULT_PASSWORD');

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });

const showSingle = async () => {
  await page.evaluate(() => {
    if (typeof goSingle === 'function') goSingle();
    document.body.classList.add('single-active');
    document.body.classList.remove('no-active', 'orderInfo-active');
    const card = document.getElementById('cardSingle');
    if (card) {
      card.classList.remove('hidden');
      card.style.display = 'flex';
      card.style.visibility = 'visible';
    }
  });
};

const reload = async () => {
  await page.goto(`${base}/?email=${encodeURIComponent(email)}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('#singleBody tr[data-id]', { state: 'attached', timeout: 60000 });
  await page.waitForTimeout(1800);
  await showSingle();
  await page.waitForTimeout(500);
};

const selectSet = async (model) => {
  const filter = page.locator('#singleFilterText');
  if (await filter.count()) {
    await filter.fill(model);
    await filter.dispatchEvent('input');
    await filter.dispatchEvent('change');
    await page.waitForTimeout(400);
  }
  const id = await page.evaluate((wanted) => {
    const row = [...document.querySelectorAll('#singleBody tr[data-id]')]
      .find((r) => r.querySelector('.model')?.textContent?.trim() === wanted);
    return row?.dataset.id || null;
  }, model);
  if (!id) throw new Error(`세트 행 없음: ${model}`);
  const qty = page.locator(`#singleBody tr[data-id="${id.replaceAll('"', '\\"')}"] .qty-input`);
  await qty.fill('1');
  await qty.blur();
  await page.waitForTimeout(700);
  const toggle = page.locator(`#singleBody tr[data-id="${id.replaceAll('"', '\\"')}"] .toggle-comp-single`);
  if (await toggle.isVisible()) await toggle.click();
  else await page.evaluate((sid) => {
    document.querySelector(`#singleBody tr[data-id="${CSS.escape(sid)}"] .toggle-comp-single`)?.click();
  }, id);
  await page.waitForTimeout(500);
  return id;
};

const readSet = async (id) => page.evaluate((sid) => {
  const parse = (v) => Number(String(v || '').replace(/[^0-9-]/g, '')) || 0;
  const row = document.querySelector(`#singleBody tr[data-id="${CSS.escape(sid)}"]`);
  const rows = [...document.querySelectorAll(`tr.set-part-single[data-part-of="${CSS.escape(sid)}"]`)]
    .filter((r) => r.style.display !== 'none')
    .map((r) => ({
      name: r.querySelector('.colD')?.textContent?.trim() || '',
      model: r.querySelector('.model')?.textContent?.trim() || '',
      price: parse(r.querySelector('.price-input')?.value),
      qty: parse(r.querySelector('.part-qty-single')?.value),
    }));
  return {
    header: parse(row?.querySelector('.price-input')?.value),
    rowCount: rows.length,
    activeRowCount: rows.filter((r) => r.qty > 0).length,
    detailSum: rows.reduce((sum, r) => sum + r.price * r.qty, 0),
    rows,
  };
}, id);

const capture = async (id, fileName) => {
  await showSingle();
  const file = path.join(out, fileName);
  const box = await page.evaluate((sid) => {
    const nodes = [
      document.querySelector(`#singleBody tr[data-id="${CSS.escape(sid)}"]`),
      ...document.querySelectorAll(`tr.set-part-single[data-part-of="${CSS.escape(sid)}"]`),
    ].filter(Boolean);
    const rects = nodes.map((node) => node.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
    if (!rects.length) return null;
    const x = Math.min(...rects.map((r) => r.left)) + window.scrollX;
    const y = Math.min(...rects.map((r) => r.top)) + window.scrollY;
    const right = Math.max(...rects.map((r) => r.right)) + window.scrollX;
    const bottom = Math.max(...rects.map((r) => r.bottom)) + window.scrollY;
    return { x, y, width: right - x, height: bottom - y };
  }, id);
  if (!box) throw new Error(`캡처 영역 계산 실패: ${id}`);
  await page.screenshot({
    path: file,
    clip: { x: Math.max(0, box.x), y: Math.max(0, box.y), width: Math.min(1600, box.width), height: box.height },
  });
  return file;
};

try {
  await reload();

  const independentAudit = await page.evaluate(() => {
    const parseKind = (p) => {
      const t = `${p.kind || ''} ${p.name || ''}`;
      if (/실내기/.test(t)) return 'INDOOR';
      if (/실외기/.test(t)) return 'OUTDOOR';
      if (/판넬|패널/.test(t)) return 'PANEL';
      if (/리모컨|리모콘/.test(t)) return 'REMOTE';
      if (/자재/.test(`${t} ${p.feat || ''}`)) return 'MATERIAL';
      return 'ACCESSORY';
    };
    const inputs = {
      panel: document.getElementById('ss_panel'), remote: document.getElementById('ss_remote'),
      remoteEx: document.getElementById('ss_remote_ex'), material: document.getElementById('ss_mat'),
      shape: document.getElementById('ss_p360'), variable: document.getElementById('chkSingleInc'),
    };
    const discountIds = ['ss_disc_360', 'ss_disc_4way', 'ss_disc_1way', 'ss_disc_stand', 'ss_disc_deluxe', 'ss_disc_grade1'];
    const reset = () => {
      inputs.panel.value = '';
      inputs.remote.value = '';
      inputs.remoteEx.checked = false;
      inputs.material.value = '별도';
      inputs.shape.value = '원형';
      inputs.variable.checked = true;
      discountIds.forEach((id) => { document.getElementById(id).value = '0'; });
    };
    const sets = (SINGLE_SETS || []).filter((s) => partsForSetStrict_(s).length);
    const baseOf = (s) => { reset(); return calcSetUnitPrice(s); };
    const variant = (p) => String(p?.component_variant ?? p?.componentVariant ?? p?.feat ?? '').trim();

    // UI lookup 함수를 신뢰하지 않고 DB에서 내려온 구성품 variant를 직접 찾는다.
    const remoteRows = [];
    for (const s of sets.filter(allowRemoteChange_)) {
      const linked = partsForSetStrict_(s).filter((p) => /리모컨/.test(`${p.kind || ''}${p.name || ''}`));
      const defaults = linked.filter(isDefaultComponent_);
      const baseRemote = defaults.reduce((sum, p) => sum + componentDeliveryPrice_(p), 0);
      for (const spec of [
        { ui: '유선리모컨', canonical: '유선' },
        { ui: '컬러유선리모컨', canonical: '컬러' },
      ]) {
        reset();
        const basePrice = calcSetUnitPrice(s);
        inputs.remote.value = spec.ui;
        const actual = calcSetUnitPrice(s) - basePrice;
        const expectedPart = linked.find((p) => variant(p) === spec.canonical);
        const expected = expectedPart ? componentDeliveryPrice_(expectedPart) - baseRemote : null;
        const configured = Number(SINGLE_MAT?.[spec.ui] || 0);
        const runtimeCandidate = getOptionRemoteRow(s, spec.ui);
        const activeModels = explodeSetParts(s, 1, calcSetUnitPrice(s))
          .filter((p) => /리모컨/.test(`${p.kind || ''}${p.name || ''}`)).map((p) => p.model);
        remoteRows.push({ set: s.model, option: spec.ui, canonical: spec.canonical, configured, expected,
          actual, expectedModel: expectedPart?.model || null, runtimeModel: runtimeCandidate?.model || null,
          activeModels, match: expected !== null && actual === expected && activeModels.includes(expectedPart.model) });
      }
    }

    const panelRows = [];
    for (const s of sets) {
      reset();
      const basePanel = getBasePanelRow(s);
      if (!basePanel) continue;
      const basePrice = calcSetUnitPrice(s);
      for (const option of ['판넬제외', '블랙판넬', '승강판넬', '공청판넬']) {
        inputs.panel.value = option;
        const chosen = pickPanelRow(s);
        const expected = option === '판넬제외' ? -componentDeliveryPrice_(basePanel)
          : chosen && chosen.model !== basePanel.model ? componentDeliveryPrice_(chosen) - componentDeliveryPrice_(basePanel) : 0;
        const actual = calcSetUnitPrice(s) - basePrice;
        panelRows.push({ set: s.model, option, baseModel: basePanel.model, chosenModel: chosen?.model || null,
          expected, actual, match: actual === expected });
      }
    }

    const materialRows = [];
    const remoteExcludeRows = [];
    for (const s of sets) {
      reset();
      const basePrice = calcSetUnitPrice(s);
      const materialParts = partsForSetStrict_(s).filter((p) => /자재/.test(variant(p)));
      if (materialParts.length) {
        inputs.material.value = '포함';
        const expected = materialParts.reduce((sum, p) => sum + componentDeliveryPrice_(p), 0);
        const actual = calcSetUnitPrice(s) - basePrice;
        materialRows.push({ set: s.model, expected, actual, match: expected === actual });
      }
      reset();
      const defaults = getDefaultRemoteRows(s);
      if (defaults.length) {
        const base = calcSetUnitPrice(s);
        inputs.remoteEx.checked = true;
        const expected = -defaults.reduce((sum, p) => sum + componentDeliveryPrice_(p), 0);
        const actual = calcSetUnitPrice(s) - base;
        remoteExcludeRows.push({ set: s.model, expected, actual, match: expected === actual });
      }
    }

    const basePathRows = sets.map((s) => {
      reset();
      const expected = setBasePriceRightFirst(s);
      const actual = calcSetUnitPrice(s);
      return { set: s.model, expected, actual, match: expected === actual };
    });
    const discountSpecs = [
      { id: 'ss_disc_360', flag: 'is360' }, { id: 'ss_disc_4way', flag: 'is4way' },
      { id: 'ss_disc_1way', flag: 'is1way' }, { id: 'ss_disc_stand', flag: 'isStand' },
      { id: 'ss_disc_deluxe', flag: 'isDeluxe' }, { id: 'ss_disc_grade1', flag: 'isGrade1' },
    ];
    const discountRows = [];
    for (const spec of discountSpecs) {
      for (const s of sets.filter((candidate) => getModelFlags(candidate.model)?.[spec.flag])) {
        reset();
        const basePrice = calcSetUnitPrice(s);
        document.getElementById(spec.id).value = '1000';
        const actual = basePrice - calcSetUnitPrice(s);
        discountRows.push({ set: s.model, discount: spec.id, expected: Math.min(1000, basePrice), actual,
          match: actual === Math.min(1000, basePrice) });
      }
    }

    const states = [
      { name: '기본' }, { name: '판넬제외', panel: '판넬제외' }, { name: '블랙판넬', panel: '블랙판넬' },
      { name: '승강판넬', panel: '승강판넬' }, { name: '공청판넬', panel: '공청판넬' },
      { name: '유선리모컨', remote: '유선리모컨' }, { name: '컬러유선리모컨', remote: '컬러유선리모컨' },
      { name: '리모컨제외', remoteEx: true }, { name: '자재포함', material: '포함' },
      { name: '360원형', shape: '원형' }, { name: '360사각', shape: '사각' },
      { name: '360할인', discount: 'ss_disc_360' }, { name: '4way할인', discount: 'ss_disc_4way' },
      { name: '1way할인', discount: 'ss_disc_1way' }, { name: '스탠드할인', discount: 'ss_disc_stand' },
      { name: '디럭스할인', discount: 'ss_disc_deluxe' }, { name: '1등급할인', discount: 'ss_disc_grade1' },
      { name: '변동단가해제', variable: false },
    ];
    const kindCounts = Object.fromEntries(['INDOOR', 'OUTDOOR', 'PANEL', 'REMOTE', 'MATERIAL', 'ACCESSORY']
      .map((kind) => [kind, { activeRows: 0, nonThousand: 0 }]));
    const sumMismatches = [];
    for (const state of states) {
      reset();
      if (state.panel) inputs.panel.value = state.panel;
      if (state.remote) inputs.remote.value = state.remote;
      if (state.remoteEx) inputs.remoteEx.checked = true;
      if (state.material) inputs.material.value = state.material;
      if (state.shape) inputs.shape.value = state.shape;
      if (state.discount) document.getElementById(state.discount).value = '1000';
      if (state.variable === false) inputs.variable.checked = false;
      for (const s of sets) {
        const header = calcSetUnitPrice(s);
        const parts = explodeSetParts(s, 1, header);
        const detail = parts.reduce((sum, p) => sum + Number(p.price || 0) * Number(p.qty || 0), 0);
        if (header !== detail && sumMismatches.length < 100) sumMismatches.push({ state: state.name, set: s.model, header, detail });
        for (const p of parts) {
          const kind = parseKind(p);
          kindCounts[kind].activeRows += 1;
          if (Number(p.price) % 1000 !== 0) kindCounts[kind].nonThousand += 1;
        }
      }
    }
    reset();
    return {
      sourceCounts: { setsWithComponents: sets.length, componentRows: (SINGLE_PARTS || []).length },
      optionTable: SINGLE_MAT,
      usedRuntimeOptionKeys: ['유선리모컨', '컬러유선리모컨'],
      remote: {
        rows: remoteRows.length,
        mismatches: remoteRows.filter((r) => !r.match).length,
        mismatchesByOption: Object.fromEntries(['유선리모컨', '컬러유선리모컨'].map((o) => [o, remoteRows.filter((r) => r.option === o && !r.match).length])),
        examples: remoteRows.filter((r) => !r.match).slice(0, 12),
      },
      panel: { rows: panelRows.length, mismatches: panelRows.filter((r) => !r.match).length, examples: panelRows.filter((r) => !r.match).slice(0, 12) },
      material: { rows: materialRows.length, mismatches: materialRows.filter((r) => !r.match).length, examples: materialRows.filter((r) => !r.match).slice(0, 12) },
      remoteExclude: { rows: remoteExcludeRows.length, mismatches: remoteExcludeRows.filter((r) => !r.match).length, examples: remoteExcludeRows.filter((r) => !r.match).slice(0, 12) },
      basePath: { rows: basePathRows.length, mismatches: basePathRows.filter((r) => !r.match).length, examples: basePathRows.filter((r) => !r.match).slice(0, 12) },
      discounts: { rows: discountRows.length, mismatches: discountRows.filter((r) => !r.match).length,
        byInput: Object.fromEntries(discountSpecs.map((s) => [s.id, { rows: discountRows.filter((r) => r.discount === s.id).length, mismatches: discountRows.filter((r) => r.discount === s.id && !r.match).length }])),
        examples: discountRows.filter((r) => !r.match).slice(0, 12) },
      sweep: { states: states.map((s) => s.name), stateRuns: sets.length * states.length, sumMismatchCount: sumMismatches.length, sumMismatchExamples: sumMismatches, byKind: kindCounts },
    };
  });

  await reload();
  const panelId = await selectSet('AC060BS4PBH7SY');
  const panelBasic = await readSet(panelId);
  panelBasic.screenshot = await capture(panelId, '01-판넬-기본-1300000-9행.png');
  await page.locator('#ss_panel').selectOption('블랙판넬');
  await page.waitForTimeout(900);
  const panelBlack = await readSet(panelId);
  panelBlack.screenshot = await capture(panelId, '02-판넬-블랙-1360000-9행.png');

  await reload();
  const remoteId = await selectSet('AC060CS6PBH1SY');
  const remoteBasic = await readSet(remoteId);
  remoteBasic.screenshot = await capture(remoteId, '03-리모컨-무선-1660000-13행.png');
  await page.locator('#ss_disc_360').fill('1000');
  await page.locator('#ss_disc_360').blur();
  await page.waitForTimeout(900);
  const discount360 = await readSet(remoteId);
  discount360.screenshot = path.join(out, '08-360할인-1000-미반영-전체카드.png');
  await page.locator('#cardSingle').screenshot({ path: discount360.screenshot });
  await page.locator('#ss_disc_360').fill('0');
  await page.locator('#ss_disc_360').blur();
  await page.waitForTimeout(900);
  await page.locator('#ss_remote').selectOption('유선리모컨');
  await page.waitForTimeout(900);
  const remoteWired = await readSet(remoteId);
  remoteWired.screenshot = await capture(remoteId, '04-리모컨-유선-1700000-13행.png');
  await page.locator('#ss_remote').selectOption('컬러유선리모컨');
  await page.waitForTimeout(900);
  const remoteColor = await readSet(remoteId);
  remoteColor.screenshot = await capture(remoteId, '05-리모컨-컬러-실측-13행.png');
  remoteColor.fullCardScreenshot = path.join(out, '09-리모컨-컬러-미반영-전체카드.png');
  await page.locator('#cardSingle').screenshot({ path: remoteColor.fullCardScreenshot });

  await reload();
  const materialId = await selectSet('AP060BAPPBH2S');
  const materialSeparate = await readSet(materialId);
  materialSeparate.screenshot = await capture(materialId, '06-자재-별도-1200000-3행.png');
  await page.locator('#ss_mat').selectOption('포함');
  await page.waitForTimeout(900);
  const materialIncluded = await readSet(materialId);
  materialIncluded.screenshot = await capture(materialId, '07-자재-포함-1330000-3행.png');

  await reload();
  const toggleId = await selectSet('AC060BS4PBH7SY');
  const toggleBaseHeader = (await readSet(toggleId)).header;
  const baseCheckedBefore = await page.locator('#ss_base').isChecked();
  const footBefore = await page.evaluate(() => ({ roundId: SS_FOOT_ROUND_ID, flatId: SS_FOOT_FLAT_ID,
    roundQty: SS_FOOT_ROUND_ID == null ? null : (singleQty.get(SS_FOOT_ROUND_ID) || 0),
    flatQty: SS_FOOT_FLAT_ID == null ? null : (singleQty.get(SS_FOOT_FLAT_ID) || 0) }));
  await page.locator('#ss_base').dispatchEvent('click');
  await page.waitForTimeout(700);
  const baseCheckedAfter = await page.locator('#ss_base').isChecked();
  const footAfter = await page.evaluate(() => ({ roundId: SS_FOOT_ROUND_ID, flatId: SS_FOOT_FLAT_ID,
    roundQty: SS_FOOT_ROUND_ID == null ? null : (singleQty.get(SS_FOOT_ROUND_ID) || 0),
    flatQty: SS_FOOT_FLAT_ID == null ? null : (singleQty.get(SS_FOOT_FLAT_ID) || 0) }));
  const baseToggleHeader = await page.locator(`#singleBody tr[data-id="${toggleId.replaceAll('"', '\\"')}"] .price-input`).inputValue();
  const expansionBefore = await page.locator('#ss_expand').isChecked();
  await page.locator('#ss_expand').dispatchEvent('click');
  await page.waitForTimeout(700);
  const expansionAfter = await page.locator('#ss_expand').isChecked();
  const expansionHeader = await page.locator(`#singleBody tr[data-id="${toggleId.replaceAll('"', '\\"')}"] .price-input`).inputValue();

  await reload();
  const shapeId = await selectSet('AC060CS6PBH1SY');
  await page.evaluate(() => {
    const shape = document.getElementById('ss_p360');
    shape.value = '사각';
    shape.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(700);
  const square = await readSet(shapeId);
  await page.locator('#ss_remote_ex').dispatchEvent('click');
  await page.waitForTimeout(700);
  const remoteExcluded = await readSet(shapeId);

  const live = {
    panel: { basic: panelBasic, black: panelBlack },
    remote: { basic: remoteBasic, discount360, wired: remoteWired, color: remoteColor, square, excluded: remoteExcluded },
    material: { separate: materialSeparate, included: materialIncluded },
    toggles: { toggleBaseHeader, baseToggleHeader, baseCheckedBefore, baseCheckedAfter, footBefore, footAfter, expansionBefore, expansionAfter, expansionHeader },
  };
  const data = { auth: await page.evaluate(() => ({ authorized: USER_AUTH?.authorized ?? null })), independentAudit, live };
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(data, null, 2), 'utf8');
  console.log(JSON.stringify(data, null, 2));
} finally {
  await browser.close();
}
