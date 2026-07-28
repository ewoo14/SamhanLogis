'use strict';

/*
 * #963 CODEX SOL 라운드 전용 harness.
 * 상업멀티 수동잠금의 4개 결함을 정본 함수/정본 블록에서 직접 추출해
 * 검증한다. 공유 legacy golden harness와 GAS 감사 원본은 읽기만 한다.
 */

const fs = require('fs');
const vm = require('vm');
const {
  SOURCE_PATH,
  extractFunctionSource,
} = require('../../../legacy-quantity-golden/legacyQuantityBoundary');

function sourceFor(app) {
  return fs.readFileSync(SOURCE_PATH[app], 'utf8');
}

function bundle(source, names) {
  return names.map((name) => extractFunctionSource(source, name)).join('\n');
}

const SETS = `
  const COMM_MANUAL_PANEL = new Set();
  const COMM_MANUAL_HOSE = new Set();
  const COMM_MANUAL_REMOTE = new Set();
  const COMM_MANUAL_PUMP = new Set();
  const COMM_MANUAL_BASE = new Set();
  const COMM_MANUAL_BRANCH = new Set();
`;

function runExplicitZeroScenario() {
  const source = sourceFor('order');
  const functions = bundle(source, [
    'isCommPanelRow',
    'isCommHoseRow',
    'isCommRemoteRow',
    'isCommPumpRow',
    'commManualSetForRow',
    'applyCommManualLock',
  ]);
  const script = `
    ${SETS}
    ${functions}
    const rec = { model: 'PC1MWSK3NW', name: 'PC1MWSK3NW WIFI 판넬' };
    applyCommManualLock(rec, rec.model, 0, true);
    const lockedAfterExplicitZero = COMM_MANUAL_PANEL.has(rec.model);
    applyCommManualLock(rec, rec.model, 0, false);
    const lockedAfterClear = COMM_MANUAL_PANEL.has(rec.model);
    globalThis.__result = { lockedAfterExplicitZero, lockedAfterClear };
  `;
  const context = { console: { log: () => {} } };
  vm.runInNewContext(script, context, { filename: SOURCE_PATH.order });
  return context.__result;
}

function runOptionScenario(controlId) {
  const source = sourceFor('order');
  const functions = bundle(source, ['onCommOptionChange']);
  const script = `
    ${SETS}
    let recomputeCount = 0;
    const document = { querySelectorAll: () => [] };
    const COMMULTI = [];
    const recomputeCommDerived = () => { recomputeCount += 1; };
    const syncCommManualUI = () => {};
    const syncCommTotals = () => {};
    const updateInlineTotals = () => {};
    ${functions}
    const model = 'LOCK-MODEL';
    COMM_MANUAL_PANEL.add(model);
    COMM_MANUAL_HOSE.add(model);
    COMM_MANUAL_REMOTE.add(model);
    COMM_MANUAL_PUMP.add(model);
    COMM_MANUAL_BASE.add(model);
    onCommOptionChange(${JSON.stringify(controlId)});
    globalThis.__result = {
      panel: COMM_MANUAL_PANEL.has(model),
      hose: COMM_MANUAL_HOSE.has(model),
      remote: COMM_MANUAL_REMOTE.has(model),
      pump: COMM_MANUAL_PUMP.has(model),
      base: COMM_MANUAL_BASE.has(model),
      recomputeCount,
    };
  `;
  const context = { console: { log: () => {} } };
  vm.runInNewContext(script, context, { filename: SOURCE_PATH.order });
  return context.__result;
}

function runVisualScenario() {
  const source = sourceFor('order');
  const functions = bundle(source, [
    'isCommPanelRow',
    'isCommHoseRow',
    'isCommRemoteRow',
    'isCommPumpRow',
    'commManualSetForRow',
    'isCommManualLocked',
  ]);
  const rows = [
    ['panel', { model: 'P', name: '판넬' }, 'COMM_MANUAL_PANEL'],
    ['hose', { model: 'H', name: '유연호스' }, 'COMM_MANUAL_HOSE'],
    ['remote', { model: 'R', name: '유선리모컨' }, 'COMM_MANUAL_REMOTE'],
    ['pump', { model: 'M', name: '드레인펌프' }, 'COMM_MANUAL_PUMP'],
    ['base', { model: 'B', name: '방진가대S2소' }, 'COMM_MANUAL_BASE'],
  ];
  const script = `
    ${SETS}
    ${functions}
    COMM_MANUAL_PANEL.add('P');
    COMM_MANUAL_HOSE.add('H');
    COMM_MANUAL_REMOTE.add('R');
    COMM_MANUAL_PUMP.add('M');
    COMM_MANUAL_BASE.add('B');
    globalThis.__result = ${JSON.stringify(rows)}.map(([label, row]) => ({
      label,
      manual: isCommManualLocked(row, row.model),
    }));
  `;
  const context = { console: { log: () => {} } };
  vm.runInNewContext(script, context, { filename: SOURCE_PATH.order });
  return context.__result;
}

function sourceGuardReport(app) {
  const source = sourceFor(app);
  const recalc = extractFunctionSource(source, 'recalcCommAccessories');
  const binding = extractFunctionSource(source, 'bindCommQtyEvents');
  const outdoorClear = /isCommOutdoorRow\([\s\S]{0,700}COMM_MANUAL_BASE\.clear\(\)/.test(binding);
  return {
    accessoryChecksManualBase: /COMM_MANUAL_BASE(?:\?\.)?\.has\(/.test(recalc),
    outdoorClear,
  };
}

module.exports = {
  runExplicitZeroScenario,
  runOptionScenario,
  runVisualScenario,
  sourceGuardReport,
};
