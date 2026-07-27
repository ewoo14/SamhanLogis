'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SOURCE_PATH = {
  estimate: path.resolve(__dirname, '../estimate-app/views/index.ejs'),
  order: path.resolve(__dirname, '../order-app/index.html'),
};

/** 정본 파일의 함수 본문을 괄호 깊이 기준으로 그대로 추출한다. */
function extractFunctionSource(source, name) {
  const start = source.indexOf(`function ${name}`);
  if (start < 0) throw new Error(`${name} 함수를 찾을 수 없습니다.`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`${name} 함수 본문을 닫을 수 없습니다.`);
}

/** 정본의 단순 const 객체 선언을 그대로 추출한다. */
function extractConstSource(source, name) {
  const start = source.indexOf(`const ${name}`);
  if (start < 0) throw new Error(`${name} 상수를 찾을 수 없습니다.`);
  const end = source.indexOf(';', start);
  if (end < 0) throw new Error(`${name} 상수 선언을 닫을 수 없습니다.`);
  return source.slice(start, end + 1);
}

function sourceFunctionBundle(source, names) {
  return names.map((name) => extractFunctionSource(source, name)).join('\n');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mapObject(map) {
  return Object.fromEntries([...map.entries()].map(([key, value]) => [String(key), Number(value) || 0]));
}

function nonZeroMap(map) {
  return Object.fromEntries(
    [...map.entries()]
      .filter(([, value]) => Number(value) !== 0)
      .map(([key, value]) => [String(key), Number(value) || 0]),
  );
}

function domScript(values) {
  return `
    const __domValues = ${JSON.stringify(values || {})};
    const __domValue = (selector) => {
      const raw = Object.prototype.hasOwnProperty.call(__domValues, selector)
        ? __domValues[selector]
        : __domValues[selector.replace(/^#/, '')];
      return raw === undefined ? undefined : raw;
    };
    const el = (selector) => {
      const raw = __domValue(selector);
      if (raw === undefined) return null;
      return { value: typeof raw === 'object' ? raw.value : raw, checked: typeof raw === 'object' ? !!raw.checked : !!raw };
    };
    const document = {
      getElementById: (id) => {
        const raw = __domValue('#' + id);
        if (raw === undefined) return null;
        return { value: typeof raw === 'object' ? raw.value : raw, checked: typeof raw === 'object' ? !!raw.checked : !!raw };
      },
      querySelector: (selector) => {
        const raw = __domValue(selector);
        if (raw === undefined) return null;
        return { value: typeof raw === 'object' ? raw.value : raw, checked: typeof raw === 'object' ? !!raw.checked : !!raw };
      },
      querySelectorAll: () => [],
      activeElement: null,
    };
  `;
}

function commonContextScript(input) {
  const options = input.options || {};
  return `
    const window = {
      SHOW_I_HOSE: ${JSON.stringify(!!options.showIHose)},
      ABSOLUTE_LOCK: new Set(${JSON.stringify(input.absoluteLocks || [])}),
    };
    const CSS = { escape: (value) => String(value).replace(/[^a-zA-Z0-9_-]/g, '_') };
    const fmt = (value) => String(value);
    const syncSingleUIFromState = () => {};
    const syncCommTotals = () => {};
    const updateInlineTotals = () => {};
    const updateCommRatio = () => {};
    const refreshBranchOpenButton = () => {};
    const syncHomeUIFromState = () => {};
    const syncHomeTotals = () => {};
    const refreshSelectedBadge = () => {};
    const updateHomeRatio = () => {};
    const saveBranchState = () => {};
    const pushBranchPartsToCommFromBadges = () => {};
  `;
}

function runHome(source, input) {
  const rows = clone(input.catalog?.home || []);
  const quantities = input.sourceQuantities || {};
  const locks = input.manualLocks?.home || {};
  const targets = input.targets || {};
  const functions = sourceFunctionBundle(source, [
    'inferOneWaySize',
    'isPanelRow',
    'isRemoteRow',
    'clearAllPanels',
    'clearAllRemotes',
    'pickPanelBy',
    'recomputeFootAll',
    'recomputeHomeBranches',
    'recomputeHomeRemotes',
    'recomputeHomePanels',
    'recomputeHomeDerived',
  ]);
  const panelModels = extractConstSource(source, 'PANEL_MODELS');
  const script = `
    ${commonContextScript(input)}
    ${domScript(input.options?.dom)}
    const HOMEMULTI = ${JSON.stringify(rows)};
    const SINGLE_SETS = [];
    const SINGLE_PARTS = [];
    const homeQty = new Map(Object.entries(${JSON.stringify(quantities)}));
    const homeRowByModel = new Map(HOMEMULTI.map((row) => [row.model, row]));
    const HOME_MANUAL_PANEL = new Set(${JSON.stringify(locks.panel || [])});
    const HOME_MANUAL_HOSE = new Set(${JSON.stringify(locks.hose || [])});
    const HOME_MANUAL_REMOTE = new Set(${JSON.stringify(locks.remote || [])});
    const HOME_MANUAL_BRANCH = new Set(${JSON.stringify(locks.branch || [])});
    const HOME_MANUAL_FOOT = new Set(${JSON.stringify(locks.foot || [])});
    const HOSE_1W = ${JSON.stringify(targets.hose1w || '')};
    const HOSE_4W = ${JSON.stringify(targets.hose4w || '')};
    const HOSE_I_1W = ${JSON.stringify(targets.hoseI1w || '')};
    const HOSE_I_4W = ${JSON.stringify(targets.hoseI4w || '')};
    const FOOT_ROUND = ${JSON.stringify(targets.footRound || '')};
    const FOOT_FLAT = ${JSON.stringify(targets.footFlat || '')};
    const REMOTE_WIRED = ${JSON.stringify(targets.remoteWired || '')};
    const REMOTE_WIRED_COLOR = ${JSON.stringify(targets.remoteWiredColor || '')};
    const REMOTE_WIRED_KIT = ${JSON.stringify(targets.remoteWiredKit || '')};
    const REMOTE_WIRELESS = ${JSON.stringify(targets.remoteWireless || '')};
    const REMOTE_360_DEFAULT = ${JSON.stringify(targets.remote360Default || '')};
    const REMOTE_INF_DEFAULT = ${JSON.stringify(targets.remoteInfDefault || '')};
    const REMOTE_COLOR_AIRCOMBO = ${JSON.stringify(targets.remoteColorAircombo || '')};
    const BRANCH_2512 = ${JSON.stringify(targets.branch2512 || '')};
    const BRANCH_1509 = ${JSON.stringify(targets.branch1509 || '')};
    const MODEL_6HP_SINGLE = ${JSON.stringify(targets.model6HpSingle || '')};
    ${panelModels}
    ${functions}
    recomputeHomeDerived(false);
    globalThis.__result = { quantities: nonZeroMap(homeQty), allQuantities: mapObject(homeQty) };
  `;
  const context = {
    nonZeroMap,
    mapObject,
    console: { log: () => {} },
  };
  vm.runInNewContext(script, context, { filename: SOURCE_PATH[input.app || 'estimate'] });
  return context.__result;
}

function runSingle(source, input) {
  const rows = clone(input.catalog?.single || []);
  const quantities = input.sourceQuantities || {};
  const locks = input.manualLocks?.single || {};
  const targets = input.targets || {};
  const functions = sourceFunctionBundle(source, [
    'allowRemoteChange_',
    'is1WaySet_',
    'recomputeSingleBaseFoot',
    'recomputeSingleExtras',
  ]);
  const script = `
    ${commonContextScript(input)}
    ${domScript(input.options?.dom)}
    const SINGLE_SETS = ${JSON.stringify(rows)};
    const SINGLE_PARTS = [];
    const singleQty = new Map(Object.entries(${JSON.stringify(quantities)}));
    const SS_FOOT_ROUND_ID = ${JSON.stringify(targets.footRoundId ?? null)};
    const SS_FOOT_FLAT_ID = ${JSON.stringify(targets.footFlatId ?? null)};
    const SS_WIRED_BOARD_ID = ${JSON.stringify(targets.wiredBoardId ?? null)};
    const SS_CEILING_PUMP_ID = ${JSON.stringify(targets.ceilingPumpId ?? null)};
    const HOME_MANUAL_PANEL = new Set();
    const HOME_MANUAL_HOSE = new Set();
    const HOME_MANUAL_REMOTE = new Set();
    const HOME_MANUAL_BRANCH = new Set();
    const HOME_MANUAL_FOOT = new Set();
    const partsForSetStrict_ = (set) => (set.components || []);
    const getDefaultRemoteRows = () => [{ model: 'AR-EC05' }];
    ${functions}
    recomputeSingleBaseFoot();
    recomputeSingleExtras();
    globalThis.__result = { quantities: nonZeroMap(singleQty), allQuantities: mapObject(singleQty) };
  `;
  const context = {
    nonZeroMap,
    mapObject,
    console: { log: () => {} },
  };
  vm.runInNewContext(script, context, { filename: SOURCE_PATH[input.app || 'estimate'] });
  return context.__result;
}

function runCommercial(source, input) {
  const rows = clone(input.catalog?.commercial || []);
  const quantities = input.sourceQuantities || {};
  const locks = input.manualLocks?.commercial || {};
  const targets = input.targets || {};
  const functions = sourceFunctionBundle(source, [
    'rawNameOf',
    'isCommIndoorRow',
    'isCommOutdoorRow',
    'commIndoorKind',
    'isCommPanelRow',
    'isCommHoseRow',
    'isCommRemoteRow',
    'isCommPumpRow',
    'computeCommRemoteModelForIndoor_',
    'pickHoseModel',
    'hasExactHP',
    'parseSetHPs',
    'chooseBaseModel',
    'modelByNameLike',
    'countBranchForSet',
    'computeCommPanelModelForIndoor_',
    'recomputeCommDerived',
  ]);
  const renewFilterMap = extractConstSource(source, 'RENEW_FILTER_MAP');
  const script = `
    ${commonContextScript(input)}
    ${domScript(input.options?.dom)}
    const COMMULTI = ${JSON.stringify(rows)};
    const commQty = new Map(Object.entries(${JSON.stringify(quantities)}));
    const COMM_MANUAL_PANEL = new Set(${JSON.stringify(locks.panel || [])});
    const COMM_MANUAL_HOSE = new Set(${JSON.stringify(locks.hose || [])});
    const COMM_MANUAL_REMOTE = new Set(${JSON.stringify(locks.remote || [])});
    const COMM_MANUAL_PUMP = new Set(${JSON.stringify(locks.pump || [])});
    const COMM_MANUAL_BASE = new Set(${JSON.stringify(locks.base || [])});
    const HOSE_1W = ${JSON.stringify(targets.hose1w || '')};
    const HOSE_4W = ${JSON.stringify(targets.hose4w || '')};
    const HOSE_I_1W = ${JSON.stringify(targets.hoseI1w || '')};
    const HOSE_I_4W = ${JSON.stringify(targets.hoseI4w || '')};
    const commCustomPrices = new Map();
    const commUnitPrice = () => 0;
    ${renewFilterMap}
    ${functions}
    recomputeCommDerived();
    globalThis.__result = { quantities: nonZeroMap(commQty), allQuantities: mapObject(commQty) };
  `;
  const context = {
    nonZeroMap,
    mapObject,
    console: { log: () => {} },
  };
  vm.runInNewContext(script, context, { filename: SOURCE_PATH[input.app || 'estimate'] });
  return context.__result;
}

function runBranch(source, input) {
  const functions = sourceFunctionBundle(source, ['recomputeBranchCodes']);
  const slots = input.options?.branchSlots || [];
  const isOrder = input.app === 'order';
  const slotSelector = isOrder ? '.out-drop' : '.out-slot';
  const html = `
    ${functions}
    const __cells = [];
    const __slots = ${JSON.stringify(slots)}.map((item) => {
      const cell = { textContent: '', dataset: {} };
      __cells.push(cell);
      const input = { value: item.cap == null ? '' : String(item.cap) };
      const chip = { dataset: { cap: item.cap == null ? '0' : String(item.cap) } };
      const parent = { querySelector: (selector) => selector === '.code-cell' ? cell : null };
      const zone = {
        querySelector: (selector) => selector === '${isOrder ? '.capsule.in-grid' : '.cap-input'}' ? ${isOrder ? 'chip' : 'input'} : null,
        parentElement: parent,
      };
      return zone;
    });
    const document = {
      querySelectorAll: (selector) => selector === '${slotSelector}[data-out="out1"]' ? __slots : (selector === '.code-cell' ? __cells : []),
      querySelector: () => null,
    };
    const codeByCumulativeSum = (sum) => sum <= 1200 ? '1509' : sum <= 2000 ? '2512' : sum <= 2800 ? '2812' : sum <= 3100 ? '2815' : sum <= 3800 ? '3419' : '4119';
    const codeByOutdoorHP = (hp, fallback) => fallback;
    const saveBranchState = () => {};
    const pushBranchPartsToCommFromBadges = () => {};
    recomputeBranchCodes([{ model: ${JSON.stringify(input.options?.outdoorModel || 'AM120AXVHHH1')} }]);
    const totals = Object.fromEntries(['1509','2512','2812','2815','3419','4119'].map((key) => [key, __cells.filter((cell) => cell.dataset.code === key).length]));
    globalThis.__result = { codes: __cells.map((cell) => cell.dataset.code || '-'), totals };
  `;
  const context = { console: { log: () => {} } };
  vm.runInNewContext(html, context, { filename: SOURCE_PATH[input.app || 'estimate'] });
  const modelByCode = {
    '1509': 'AXJ-YA1509N',
    '2512': 'AXJ-YA2512N',
    '2812': 'AXJ-YA2812M',
    '2815': 'AXJ-YA2815M',
    '3419': 'AXJ-YA3419M',
    '4119': 'AXJ-YA4119M',
  };
  return {
    ...context.__result,
    quantities: Object.fromEntries(Object.entries(context.__result.totals).filter(([, value]) => value).map(([code, value]) => [modelByCode[code], value])),
    targetModels: Object.values(modelByCode),
  };
}

function loadSource(app, sourceMutator) {
  let source = fs.readFileSync(SOURCE_PATH[app], 'utf8');
  return typeof sourceMutator === 'function' ? sourceMutator(source, app) : source;
}

/**
 * 순수 경계: 입력 snapshot을 새 VM에 넣고 정본 계산 함수의 출력만 반환한다.
 * 가격 원천이 없는 model-only fixture에서는 금액을 계산하지 않고 null로 남긴다.
 */
function evaluateLegacyQuantityBoundary(input, options = {}) {
  const app = input.app || 'estimate';
  const source = loadSource(app, options.sourceMutator);
  let result;
  if (input.family === 'C-09') result = runBranch(source, input);
  else if (input.family.startsWith('H-')) result = runHome(source, input);
  else if (input.family.startsWith('S-')) result = runSingle(source, input);
  else if (input.family.startsWith('C-')) result = runCommercial(source, input);
  else throw new Error(`지원하지 않는 가족: ${input.family}`);
  return {
    quantities: result.quantities || {},
    targetModels: Object.keys(result.quantities || {}),
    unitPrices: null,
    subtotals: null,
    supplyAmount: null,
    vat: null,
    total: null,
    detail: result,
  };
}

module.exports = {
  SOURCE_PATH,
  evaluateLegacyQuantityBoundary,
  extractFunctionSource,
};
