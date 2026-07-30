const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const INDEX_PATH = path.resolve(__dirname, '../../index.html');
const FIXTURE_PATH = path.resolve(__dirname, 'fixtures/singleSetsBootstrap.fixture.json');

function extractFunction(source, name) {
  const marker = `function ${name}`;
  const start = source.indexOf(marker);
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

function runLegacyS03({ sourceQuantity, manualQuantity = null }) {
  const source = fs.readFileSync(INDEX_PATH, 'utf8');
  const rows = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8')).rows;
  const sourceRow = rows.find((row) => row.id === '싱글 실링61');
  const targetRow = rows.find((row) => row.model === 'ADP-F075SP');
  const initialTarget = manualQuantity == null ? 0 : manualQuantity;
  const locked = manualQuantity != null;

  const script = `
    const SINGLE_SETS = ${JSON.stringify(rows)};
    const singleQty = new Map([
      [${JSON.stringify(sourceRow.id)}, ${sourceQuantity}],
      [${JSON.stringify(targetRow.id)}, ${initialTarget}],
    ]);
    const SINGLE_CATALOG_MISSING_MODELS = new Map();
    const MANUAL_QTY_LOCKS = { single: new Set(${JSON.stringify(locked ? [targetRow.id] : [])}) };
    const DERIVED_QTY_TARGETS = { single: new Set() };
    const lockScope_ = (scope) => MANUAL_QTY_LOCKS[scope] || null;
    const targetScope_ = (scope) => DERIVED_QTY_TARGETS[scope] || null;
    const registerDerivedQty = (scope, model) => targetScope_(scope)?.add(String(model));
    const isManualQtyLocked = (scope, model) => !!lockScope_(scope)?.has?.(String(model));
    const setDerivedQty = (scope, state, model, quantity) => {
      if(model === undefined || model === null || model === '') return;
      registerDerivedQty(scope, model);
      if(!isManualQtyLocked(scope, model)) state.set(model, quantity);
    };
    const controls = {
      '#ss_remote_ex': { checked: false },
      '#ss_remote': { value: '' },
    };
    const document = {
      querySelector: (selector) => controls[selector] || null,
      getElementById: () => null,
      querySelectorAll: () => [],
    };
    const el = (selector) => document.querySelector(selector);
    const is1WaySet_ = () => false;
    const allowRemoteChange_ = () => false;
    const syncSingleUIFromState = () => {};
    const noteSingleCatalogMissing_ = ${extractFunction(source, 'noteSingleCatalogMissing_')};
    const setSingleDerivedQty_ = ${extractFunction(source, 'setSingleDerivedQty_')};
    const SS_WIRED_BOARD_ID = null;
    const SS_CEILING_PUMP_ID = ${JSON.stringify(targetRow.id)};
    ${extractFunction(source, 'recomputeSingleExtras')}
    recomputeSingleExtras();
    globalThis.__result = {
      sourceQuantity: singleQty.get(${JSON.stringify(sourceRow.id)}),
      targetQuantity: singleQty.get(${JSON.stringify(targetRow.id)}),
      manualLock: isManualQtyLocked('single', ${JSON.stringify(targetRow.id)}),
    };
  `;

  const context = vm.createContext({});
  vm.runInContext(script, context);
  return context.__result;
}

function runLegacyS03TargetSwap() {
  const source = fs.readFileSync(INDEX_PATH, 'utf8');
  const rows = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8')).rows;
  const sourceRow = rows.find((row) => row.id === '싱글 실링61');
  const oldTarget = rows.find((row) => row.model === 'ADP-F075SP');
  const newTarget = rows.find((row) => row.model === 'AIM-N01');

  const script = `
    const SINGLE_SETS = ${JSON.stringify(rows)};
    const singleQty = new Map([
      [${JSON.stringify(sourceRow.id)}, 1],
      [${JSON.stringify(oldTarget.id)}, 1],
      [${JSON.stringify(newTarget.id)}, 0],
    ]);
    const SINGLE_CATALOG_MISSING_MODELS = new Map();
    const DERIVED_QTY_TARGETS = { single: new Set() };
    const controls = {
      '#ss_remote_ex': { checked: false },
      '#ss_remote': { value: '' },
    };
    const document = {
      querySelector: (selector) => controls[selector] || null,
      getElementById: () => null,
      querySelectorAll: () => [],
    };
    const el = (selector) => document.querySelector(selector);
    const is1WaySet_ = () => false;
    const allowRemoteChange_ = () => false;
    const syncSingleUIFromState = () => {};
    const noteSingleCatalogMissing_ = ${extractFunction(source, 'noteSingleCatalogMissing_')};
    const setSingleDerivedQty_ = ${extractFunction(source, 'setSingleDerivedQty_')};
    const setDerivedQty = (_scope, state, model, quantity) => state.set(model, quantity);
    const SS_WIRED_BOARD_ID = null;
    const SS_CEILING_PUMP_ID = ${JSON.stringify(oldTarget.id)};
    ${extractFunction(source, 'recomputeSingleExtras')}
    recomputeSingleExtras();
    globalThis.__result = {
      oldTargetQuantity: singleQty.get(${JSON.stringify(oldTarget.id)}) || 0,
      newTargetQuantity: singleQty.get(${JSON.stringify(newTarget.id)}) || 0,
      targetSubtotal: (singleQty.get(${JSON.stringify(oldTarget.id)}) || 0) * 79200,
      sendModels: Array.from(singleQty.entries())
        .filter(([id, quantity]) => quantity > 0)
        .map(([id]) => SINGLE_SETS.find((row) => row.id === id)?.model)
        .filter(Boolean),
    };
  `;

  const context = vm.createContext({});
  vm.runInContext(script, context);
  return context.__result;
}

function runOrderReadiness({ missingModel }) {
  const source = fs.readFileSync(INDEX_PATH, 'utf8');
  const script = `
    const controls = {
      '#memo': { value: '배송 요청' },
      '#addrBase': { value: '서울시' },
      '#tel': { value: '010-1234-5678' },
      '#sameAddr': { checked: true },
      '#addrAuditBase': { value: '' },
      '#btnSendOrder': { disabled: false },
    };
    // F-01의 reset 뒤 남는 관측 Map을 일부러 유지하되, 전송 준비 판정과 분리한다.
    const SINGLE_CATALOG_MISSING_MODELS = new Map([[${JSON.stringify(missingModel)}, new Set(['S-03'])]]);
    const document = { querySelector: (selector) => controls[selector] || null };
    const el = (selector) => document.querySelector(selector);
    ${extractFunction(source, 'isValidTel')}
    ${extractFunction(source, 'checkOrderReady')}
    checkOrderReady();
    globalThis.__result = {
      disabled: controls['#btnSendOrder'].disabled,
      missingMapSize: SINGLE_CATALOG_MISSING_MODELS.size,
      unrelatedOrder: { model: 'SI-AL700a', quantity: 1, subtotal: 25000 },
    };
  `;
  const context = vm.createContext({});
  vm.runInContext(script, context);
  return context.__result;
}

function runLegacyCaseDistinctSource() {
  const source = fs.readFileSync(INDEX_PATH, 'utf8');
  const rows = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8')).rows;
  rows.push({ id: 'case-distinct', model: 'ac090bscPbh2sy', name: '벽걸이 신규품' });
  const target = rows.find((row) => row.model === 'ADP-F075SP');

  const script = `
    const SINGLE_SETS = ${JSON.stringify(rows)};
    const singleQty = new Map([['case-distinct', 1], [${JSON.stringify(target.id)}, 0]]);
    const SINGLE_CATALOG_MISSING_MODELS = new Map();
    const DERIVED_QTY_TARGETS = { single: new Set() };
    const controls = { '#ss_remote_ex': { checked: false }, '#ss_remote': { value: '' } };
    const document = { querySelector: (selector) => controls[selector] || null, getElementById: () => null, querySelectorAll: () => [] };
    const el = (selector) => document.querySelector(selector);
    const is1WaySet_ = () => false;
    const allowRemoteChange_ = () => false;
    const syncSingleUIFromState = () => {};
    const noteSingleCatalogMissing_ = ${extractFunction(source, 'noteSingleCatalogMissing_')};
    const setSingleDerivedQty_ = ${extractFunction(source, 'setSingleDerivedQty_')};
    const setDerivedQty = (_scope, state, model, quantity) => state.set(model, quantity);
    const SS_WIRED_BOARD_ID = null;
    const SS_CEILING_PUMP_ID = ${JSON.stringify(target.id)};
    ${extractFunction(source, 'recomputeSingleExtras')}
    recomputeSingleExtras();
    globalThis.__result = {
      legacyPumpQty: singleQty.get(${JSON.stringify(target.id)}) || 0,
      legacyPumpSubtotal: (singleQty.get(${JSON.stringify(target.id)}) || 0) * 79200,
      caseDistinctSourceQuantity: singleQty.get('case-distinct') || 0,
    };
  `;
  const context = vm.createContext({});
  vm.runInContext(script, context);
  return context.__result;
}

module.exports = {
  runLegacyS03,
  runLegacyS03TargetSwap,
  runOrderReadiness,
  runLegacyCaseDistinctSource,
};
