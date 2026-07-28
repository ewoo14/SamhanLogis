'use strict';

/*
 * #963 R1 결함 A/B 전용 harness — clients/web/order-app/index.html 정본에서
 * onHomeQtyInput/recomputeHomeDerived/takeSnapshot/applySnapshot/clearHomeManualLocks 를
 * 그대로 추출해 vm으로 실행한다.
 *
 * 이 파일은 vitest include 패턴(src/**\/*.test.ts)에 걸리지 않는 순수 헬퍼다
 * (테스트 자체는 homeManualLockRestore.test.ts).
 *
 * legacy-quantity-golden/legacyQuantityBoundary.js(견적·주문 공유 golden 하네스)는
 * 이번 fix가 만든 결함(HOME_MANUAL_* delete 누락·snapshot lock 미직렬화) 재현에 필요한
 * 훅(clear 시뮬레이션·takeSnapshot/applySnapshot 실행)이 없고, 이 파일은 그 훅을 이
 * 결함 재현 전용으로만 추가한다 — 공유 golden 73/73 표면(legacyQuantityBoundary.js·
 * fixtures.js·goldens.js·legacy-quantity-golden.test.ts)은 단 한 줄도 건드리지 않는다.
 */

const fs = require('fs');
const vm = require('vm');
const {
  SOURCE_PATH,
  extractFunctionSource,
  derivationPreambleSource,
} = require('../../../legacy-quantity-golden/legacyQuantityBoundary');
const { fixtures } = require('../../../legacy-quantity-golden/fixtures');

const HOME_RECOMPUTE_FUNCTIONS = [
  'lockScope_',
  'targetScope_',
  'registerDerivedQty',
  'isManualQtyLocked',
  'setManualQtyLock',
  'setDerivedQty',
  'seedDerivedQty',
  'clearManualQtyLocks',
  'serializeManualQtyLocks',
  'hasSnapshotManualQtyLocks',
  'restoreSnapshotManualQtyLocks',
  'restoreLegacyDerivedQty',
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
  'isHomeCalcTriggerModel',
  'isHomeDerivedRow',
  'onHomeQtyInput',
];

function bundle(source, names) {
  return names.map((name) => extractFunctionSource(source, name)).join('\n');
}

function loadOrderSource(sourceMutator) {
  const raw = fs.readFileSync(SOURCE_PATH.order, 'utf8');
  return typeof sourceMutator === 'function' ? sourceMutator(raw) : raw;
}

/** family로 fixture를 찾는다 — sourceQuantities/dom 옵션 전사(轉寫) 오류를 피하려고 fixtures.js를 그대로 재사용한다. */
function fixtureFor(family) {
  const found = fixtures.find((fixture) => fixture.family === family);
  if (!found) throw new Error(`fixture 를 찾을 수 없습니다: ${family}`);
  return found;
}

function domScript(domOptions) {
  return `
    const __domValues = ${JSON.stringify(domOptions || {})};
    const el = (selector) => {
      const raw = Object.prototype.hasOwnProperty.call(__domValues, selector) ? __domValues[selector] : undefined;
      if (raw === undefined) return null;
      return { value: typeof raw === 'object' ? raw.value : raw, checked: typeof raw === 'object' ? !!raw.checked : !!raw };
    };
  `;
}

function catalogPrelude(source, family) {
  const fixture = fixtureFor(family);
  const home = fixture.catalog.home;
  const single = fixture.catalog.single;
  const singleParts = fixture.catalog.singleParts;
  return {
    dom: (fixture.options && fixture.options.dom) || {},
    sourceQuantities: fixture.sourceQuantities,
    script: `
      const HOMEMULTI = ${JSON.stringify(home)};
      const SINGLE_SETS = ${JSON.stringify(single)};
      const SINGLE_PARTS = ${JSON.stringify(singleParts)};
      ${derivationPreambleSource(source)}
    `,
  };
}

const COMMON_STUBS = `
  const CSS = { escape: (v) => String(v).replace(/[^a-zA-Z0-9_-]/g, '_') };
  const fmt = (v) => String(v);
  const homeUnitPrice = () => 0;
  const syncHomeUIFromState = () => {};
  const syncHomeTotals = () => {};
  const refreshSelectedBadge = () => {};
  const updateHomeRatio = () => {};
`;

const HOME_MANUAL_SETS_DECL = `
  const MANUAL_QTY_LOCKS = { home: new Set(), commercial: new Set(), single: new Set() };
  const DERIVED_QTY_TARGETS = { home: new Set(), commercial: new Set(), single: new Set() };
  const HOME_MANUAL_PANEL = MANUAL_QTY_LOCKS.home;
  const HOME_MANUAL_HOSE = MANUAL_QTY_LOCKS.home;
  const HOME_MANUAL_REMOTE = MANUAL_QTY_LOCKS.home;
  const HOME_MANUAL_BRANCH = MANUAL_QTY_LOCKS.home;
  const HOME_MANUAL_FOOT = MANUAL_QTY_LOCKS.home;
`;

const LOCK_CHECK = (model) => `(
  HOME_MANUAL_PANEL.has(${JSON.stringify(model)}) ||
  HOME_MANUAL_HOSE.has(${JSON.stringify(model)}) ||
  HOME_MANUAL_REMOTE.has(${JSON.stringify(model)}) ||
  HOME_MANUAL_BRANCH.has(${JSON.stringify(model)}) ||
  HOME_MANUAL_FOOT.has(${JSON.stringify(model)})
)`;

/**
 * 결함 A 재현 — 사용자가 파생 수량 칸에 값을 넣어 잠근 뒤(add) 칸을 지우면(v=0)
 * onHomeQtyInput이 잠금을 해제(delete)하는지, 이어지는 재계산(recomputeHomeDerived)이
 * 자동값으로 복귀하는지를 정본 함수를 그대로 실행해 검증한다.
 */
function runClearScenario({ family, model, lockValue, sourceMutator }) {
  const source = loadOrderSource(sourceMutator);
  const prelude = catalogPrelude(source, family);
  const functions = bundle(source, HOME_RECOMPUTE_FUNCTIONS);
  const modelJson = JSON.stringify(model);
  const script = `
    const window = { SHOW_I_HOSE: false, ABSOLUTE_LOCK: new Set() };
    ${COMMON_STUBS}
    ${domScript(prelude.dom)}
    const document = { querySelector: () => null, querySelectorAll: () => [] };
    ${prelude.script}
    const homeQty = new Map(Object.entries(${JSON.stringify(prelude.sourceQuantities)}));
    const homeRowByModel = new Map(HOMEMULTI.map((row) => [row.model, row]));
    ${HOME_MANUAL_SETS_DECL}
    ${functions}

    onHomeQtyInput(${modelJson}, ${JSON.stringify(lockValue)});
    const lockedAfterManualInput = ${LOCK_CHECK(model)};
    const valueAfterManualInput = homeQty.get(${modelJson}) || 0;

    onHomeQtyInput(${modelJson}, 0);
    const lockedAfterClear = ${LOCK_CHECK(model)};
    const valueImmediatelyAfterClear = homeQty.get(${modelJson}) || 0;

    recomputeHomeDerived(false);
    const valueAfterRecompute = homeQty.get(${modelJson}) || 0;

    globalThis.__result = {
      lockedAfterManualInput,
      valueAfterManualInput,
      lockedAfterClear,
      valueImmediatelyAfterClear,
      valueAfterRecompute,
    };
  `;
  const context = { console: { log: () => {} } };
  vm.runInNewContext(script, context, { filename: SOURCE_PATH.order });
  return context.__result;
}

/**
 * 결함 B 재현 — 파생 수량을 수동 입력(잠금)한 뒤 takeSnapshot()으로 저장하고,
 * 완전히 새 상태(잠금 0·수량 0)에서 applySnapshot()으로 복원했을 때 수동값이
 * 보존되는지를 검증한다. legacyShot=true 이면 저장된 shot에서 HOME_MANUAL_* 직렬화
 * 필드를 제거해 "이 fix 이전에 저장된 스냅샷"(D-3, 개발책임자 결정)을 흉내낸다 —
 * 이 갈래는 기존 동작(잠금 없이 recompute가 덮어씀)이 그대로 유지돼야 한다.
 */
function runSnapshotRoundtrip({ family, model, lockValue, legacyShot }) {
  const source = loadOrderSource();
  const prelude = catalogPrelude(source, family);
  const functions = bundle(source, [...HOME_RECOMPUTE_FUNCTIONS, 'takeSnapshot', 'applySnapshot', 'clearHomeManualLocks', 'clearCommManualLocks']);
  const modelJson = JSON.stringify(model);
  const stripLockFields = legacyShot
    ? `delete shot.core.manualQtyLocks; delete shot.core.homeManualPanel; delete shot.core.homeManualHose; delete shot.core.homeManualRemote; delete shot.core.homeManualBranch; delete shot.core.homeManualFoot;`
    : '';
  const script = `
    const window = { SHOW_I_HOSE: false, ABSOLUTE_LOCK: new Set() };
    ${COMMON_STUBS}
    ${domScript(prelude.dom)}
    const confirm = () => true;
    const alert = () => {};
    const sendLog = () => {};
    const document = { querySelector: () => null, querySelectorAll: () => [] };
    ${prelude.script}
    const homeQty = new Map(Object.entries(${JSON.stringify(prelude.sourceQuantities)}));
    const singleQty = new Map();
    const commQty = new Map();
    const oldQty = new Map();
    const homeRowByModel = new Map(HOMEMULTI.map((row) => [row.model, row]));
    ${HOME_MANUAL_SETS_DECL}
    /* #967 R2 G-1 이 takeSnapshot/applySnapshot 에 COMM_MANUAL_* 직렬화·복원을
       추가해, 이 두 함수를 추출·실행하려면 해당 식별자가 스코프에 있어야 한다.
       이 harness 는 comm 잠금 자체를 검사하지 않으므로(그건 commManualLockHarness.cjs
       담당) 빈 Set으로만 채운다 — ReferenceError 방지용, 재구현 아님. */
    const COMM_MANUAL_PANEL = new Set();
    const COMM_MANUAL_HOSE = new Set();
    const COMM_MANUAL_REMOTE = new Set();
    const COMM_MANUAL_PUMP = new Set();
    const COMM_MANUAL_BASE = new Set();
    const COMM_MANUAL_BRANCH = new Set();
    ${functions}

    /* 1) 사용자가 파생 칸에 직접 값을 입력해 잠근다 */
    onHomeQtyInput(${modelJson}, ${JSON.stringify(lockValue)});

    /* 2) 저장 */
    const shot = takeSnapshot();
    ${stripLockFields}
    const serializedLockArrays = shot.core.manualQtyLocks?.home || [];
    const anyLockSerialized = Array.isArray(serializedLockArrays) && serializedLockArrays.includes(${modelJson});

    /* 3) 완전히 새 세션(잠금 0·수량 0)에서 복원 — 페이지 재진입/새로고침을 흉내낸다 */
    homeQty.clear();
    HOMEMULTI.forEach((row) => homeQty.set(row.model, 0));
    clearHomeManualLocks();
    applySnapshot(shot);

    globalThis.__result = {
      anyLockSerialized,
      valueAfterRestore: homeQty.get(${modelJson}) || 0,
      lockedAfterRestore: ${LOCK_CHECK(model)},
    };
  `;
  const context = { console: { log: () => {} } };
  vm.runInNewContext(script, context, { filename: SOURCE_PATH.order });
  return context.__result;
}

module.exports = {
  runClearScenario,
  runSnapshotRoundtrip,
  fixtureFor,
};
