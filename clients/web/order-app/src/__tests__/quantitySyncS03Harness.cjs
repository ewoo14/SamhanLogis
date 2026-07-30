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

function runConfiguredS03({ sourceQuantity, manualQuantity = null }) {
  const source = fs.readFileSync(INDEX_PATH, 'utf8');
  const rows = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8')).rows;
  const sourceRow = rows.find((row) => row.id === '싱글 실링61');
  const targetRow = rows.find((row) => row.model === 'ADP-F075SP');
  const configured = {
    status: 'ready',
    targetProductCode: 'ADP-F075SP',
    targetQuantities: new Map([[targetRow.id, sourceQuantity]]),
  };
  const initialTarget = manualQuantity == null ? 0 : manualQuantity;
  const locked = manualQuantity != null;

  const script = `
    const window = {};
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
    const configuredSingleS03_ = () => globalThis.__configured;
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

  const context = vm.createContext({ __configured: configured });
  vm.runInContext(script, context);
  return context.__result;
}

module.exports = { runConfiguredS03 };
