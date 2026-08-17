'use strict';

/*
 * PR #967 CODEX SOL 2차 RED harness.
 * clients/web/order-app/index.html 정본에서 함수와 파생 target preamble을 그대로
 * 추출해 실행한다. 이 파일은 현재 결함을 재현하기 위한 테스트 경계이며, 계산식을
 * 복제하지 않는다.
 */

const fs = require('fs');
const vm = require('vm');
const {
  SOURCE_PATH,
  extractFunctionSource,
  extractConstSource,
  derivationPreambleSource,
} = require('../../../legacy-quantity-golden/legacyQuantityBoundary');
const { fixtures } = require('../../../legacy-quantity-golden/fixtures');

function source() {
  return fs.readFileSync(SOURCE_PATH.order, 'utf8');
}

function fixtureFor(family) {
  const fixture = fixtures.find((item) => item.family === family);
  if (!fixture) throw new Error(`fixture 없음: ${family}`);
  return fixture;
}

function bundle(raw, names) {
  return names
    .filter((name) => raw.includes(`function ${name}`))
    .map((name) => extractFunctionSource(raw, name))
    .join('\n');
}

function domScript(values = {}) {
  return `
    const __domValues = ${JSON.stringify(values)};
    const __blank = { value: '', checked: false, textContent: '', style: {}, setAttribute: () => {} };
    const el = (selector) => {
      const raw = __domValues[selector];
      if (raw === undefined) return __blank;
      return { value: typeof raw === 'object' ? raw.value : raw, checked: typeof raw === 'object' ? !!raw.checked : !!raw };
    };
    const document = {
      getElementById: (id) => el('#' + id),
      querySelector: (selector) => el(selector),
      querySelectorAll: () => [],
    };
  `;
}

const LOCK_DECL = `
  const MANUAL_QTY_LOCKS = {
    home: new Set(),
    commercial: new Set(),
    single: new Set(),
  };
  const DERIVED_QTY_TARGETS = {
    home: new Set(),
    commercial: new Set(),
    single: new Set(),
  };
  /* 이전 정본 함수도 같은 상태를 보도록 하는 테스트용 호환 별칭. */
  const HOME_MANUAL_PANEL = MANUAL_QTY_LOCKS.home;
  const HOME_MANUAL_HOSE = MANUAL_QTY_LOCKS.home;
  const HOME_MANUAL_REMOTE = MANUAL_QTY_LOCKS.home;
  const HOME_MANUAL_BRANCH = MANUAL_QTY_LOCKS.home;
  const HOME_MANUAL_FOOT = MANUAL_QTY_LOCKS.home;
  const COMM_MANUAL_PANEL = MANUAL_QTY_LOCKS.commercial;
  const COMM_MANUAL_HOSE = MANUAL_QTY_LOCKS.commercial;
  const COMM_MANUAL_REMOTE = MANUAL_QTY_LOCKS.commercial;
  const COMM_MANUAL_PUMP = MANUAL_QTY_LOCKS.commercial;
  const COMM_MANUAL_BASE = MANUAL_QTY_LOCKS.commercial;
  const COMM_MANUAL_BRANCH = MANUAL_QTY_LOCKS.commercial;
`;

const COMMON = `
  const CSS = { escape: (value) => String(value).replace(/[^a-zA-Z0-9_-]/g, '_') };
  const fmt = (value) => String(value);
  const commUnitPrice = () => 0;
  const calcSetUnitPrice = () => 0;
  const commCustomPrices = new Map();
  const syncCommTotals = () => {};
  const syncCommManualUI = () => {};
  const updateInlineTotals = () => {};
  const updateCommRatio = () => {};
  const refreshBranchOpenButton = () => {};
  const refreshBranchButton = () => {};
  const refreshSelectedBadge = () => {};
  const updateSingleTotals = () => {};
  const unifyCatL_ = (value) => String(value || '');
  const sumSingles = () => 0;
  const updateHomeRatio = () => {};
  const syncSingleUIFromState = () => {};
  const syncHomeUIFromState = () => {};
  const syncHomeTotals = () => {};
`;

function runCommercialScenario(kind) {
  const raw = source();
  const fixture = fixtureFor('C-06');
  const functions = bundle(raw, [
    'd03PanelOption',
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
    'isCommDerivedRow',
    'lockScope_',
    'targetScope_',
    'registerDerivedQty',
    'isManualQtyLocked',
    'setManualQtyLock',
    'setDerivedQty',
    'commManualSetForRow',
    'isCommManualLocked',
    'applyCommManualLock',
    'recomputeCommDerived',
  ]);
  const renewFilterMap = extractConstSource(raw, 'RENEW_FILTER_MAP');
  const model = kind === 'branch' ? 'AXJ-TA3419M' : 'AF-R09A';
  const script = `
    const window = { SHOW_I_HOSE: false, ABSOLUTE_LOCK: new Set() };
    ${COMMON}
    ${domScript(fixture.options.dom)}
    const HOMEMULTI = ${JSON.stringify(fixture.catalog.home)};
    const SINGLE_SETS = ${JSON.stringify(fixture.catalog.single)};
    const SINGLE_PARTS = ${JSON.stringify(fixture.catalog.singleParts)};
    ${derivationPreambleSource(raw)}
    const COMMULTI = ${JSON.stringify(fixture.catalog.commercial)};
    const commQty = new Map(Object.entries(${JSON.stringify(fixture.sourceQuantities)}));
    COMMULTI.filter((row) => ['AM035FXMRHC1', 'AM050MXMRBC1', 'AM075FXMRHC1'].includes(row.model))
      .forEach((row) => { row.catL = '실외기'; });
    ${LOCK_DECL}
    ${renewFilterMap}
    ${functions}
    const target = COMMULTI.find((row) => row.model === ${JSON.stringify(model)});
    if (!target) throw new Error('target 없음: ' + ${JSON.stringify(model)});

    if (${JSON.stringify(kind)} === 'branch') {
      recomputeCommDerived();
      commQty.set('AM140AXVGHH1', 0);
      recomputeCommDerived();
      globalThis.__result = {
        valueAfterSourceClear: commQty.get(target.model) || 0,
        lockedAfterSourceClear: isCommManualLocked(target, target.model),
      };
    } else if (${JSON.stringify(kind)} === 'filterClear') {
      commQty.set('AM035FXMRHC1', 1);
      recomputeCommDerived();
      const automatic = commQty.get(target.model) || 0;
      commQty.set('AM035FXMRHC1', 0);
      commQty.set('AM075FXMRHC1', 0);
      recomputeCommDerived();
      globalThis.__result = {
        automatic,
        afterAllSourcesClear: commQty.get(target.model) || 0,
      };
    } else {
      commQty.set('AM035FXMRHC1', 1);
      recomputeCommDerived();
      const automatic = commQty.get(target.model) || 0;
      applyCommManualLock(target, target.model, 77, true);
      commQty.set(target.model, 77);
      commQty.set('AM035FXMRHC1', 2);
      recomputeCommDerived();
      const afterManualRecompute = commQty.get(target.model) || 0;
      const lockedAfterManualRecompute = isCommManualLocked(target, target.model);
      applyCommManualLock(target, target.model, 0, false);
      commQty.set('AM035FXMRHC1', 0);
      commQty.set('AM075FXMRHC1', 0);
      recomputeCommDerived();
      globalThis.__result = {
        automatic,
        afterManualRecompute,
        lockedAfterManualRecompute,
        afterAllSourcesClear: commQty.get(target.model) || 0,
      };
    }
  `;
  const context = { console: { log: () => {} } };
  vm.runInNewContext(script, context, { filename: SOURCE_PATH.order });
  return context.__result;
}

function runSingleScenario(targetKey) {
  const raw = source();
  const fixture = fixtureFor('H-01');
  const targetByKey = {
    roundFoot: { target: 'set-round-target', source: 'set-round-source', dom: {} },
    flatFoot: { target: 'set-flat-target', source: 'set-flat-source', dom: {} },
    wiredBoard: { target: 'wired-board', source: 'set-round-source', dom: { '#ss_remote': '유선리모컨', '#ss_remote_ex': { checked: false } } },
    ceilingPump: { target: 'ceiling-pump', source: 'set-ceiling-source', dom: {} },
  }[targetKey];
  const singleFixture = fixtureFor('H-01');
  const catalog = fixture.catalog.single;
  const script = `
    const window = { SHOW_I_HOSE: false, ABSOLUTE_LOCK: new Set() };
    ${COMMON}
    ${domScript(targetByKey.dom)}
    const HOMEMULTI = ${JSON.stringify(fixture.catalog.home)};
    const SINGLE_SETS = ${JSON.stringify(catalog)};
    const SINGLE_PARTS = ${JSON.stringify(fixture.catalog.singleParts)};
    ${derivationPreambleSource(raw)}
    const singleQty = new Map();
    let SINGLE_CATALOG_MISSING_MODELS = new Map();
    ${LOCK_DECL}
    ${bundle(raw, [
      'classifySingleSetFixed',
      'lockScope_',
      'targetScope_',
      'registerDerivedQty',
      'isManualQtyLocked',
      'setManualQtyLock',
      'setDerivedQty',
      'noteSingleCatalogMissing_',
      'setSingleDerivedQty_',
      'partsForSetStrict_',
      'getDefaultRemoteRows',
      'allowRemoteChange_',
      'is1WaySet_',
      'isSingleDerivedRow',
      'isSingleCalcTriggerId',
      'isSingleManualLocked',
      'setSingleManualLock',
      'applySingleManualLock',
      'recomputeSingleBaseFoot',
      'recomputeSingleExtras',
      'onSingleQtyInput',
    ])}
    const sourceRow = SINGLE_SETS.find((row) => row.id === ${JSON.stringify(targetByKey.source)});
    const targetRow = SINGLE_SETS.find((row) => row.id === ${JSON.stringify(targetByKey.target)});
    if (!sourceRow || !targetRow) throw new Error('single target/source 없음');
    singleQty.set(sourceRow.id, 1);
    recomputeSingleBaseFoot();
    recomputeSingleExtras();
    onSingleQtyInput(targetRow.id, 77, true);
    singleQty.set(sourceRow.id, 2);
    recomputeSingleBaseFoot();
    recomputeSingleExtras();
    globalThis.__result = {
      target: targetRow.model,
      valueAfterSourceChange: singleQty.get(targetRow.id) || 0,
      lockedAfterSourceChange: typeof isSingleManualLocked === 'function'
        ? isSingleManualLocked(targetRow.id)
        : false,
    };
  `;
  const context = { console: { log: () => {} } };
  vm.runInNewContext(script, context, { filename: SOURCE_PATH.order });
  return context.__result;
}

function chooseGhpBase() {
  const raw = source();
  const script = `
    ${bundle(raw, ['hasExactHP', 'chooseBaseModel'])}
    globalThis.__result = chooseBaseModel('가스히트펌프 GHP (8HP)');
  `;
  const context = {};
  vm.runInNewContext(script, context, { filename: SOURCE_PATH.order });
  return context.__result;
}

function hasGenericLockArchitecture() {
  const raw = source();
  return {
    genericRegistry: /const MANUAL_QTY_LOCKS\s*=/.test(raw),
    noHomeFamilyRegistry: !/const HOME_MANUAL_(?:PANEL|HOSE|REMOTE|BRANCH|FOOT)\s*=/.test(raw),
    noCommercialFamilyRegistry: !/const COMM_MANUAL_(?:PANEL|HOSE|REMOTE|PUMP|BASE|BRANCH)\s*=/.test(raw),
    singleInputHandler: /onSingleQtyInput[\s\S]*?setManualQtyLock/.test(raw),
    genericSnapshot: /manualQtyLocks/.test(raw),
  };
}

module.exports = {
  runCommercialScenario,
  runSingleScenario,
  chooseGhpBase,
  hasGenericLockArchitecture,
};
