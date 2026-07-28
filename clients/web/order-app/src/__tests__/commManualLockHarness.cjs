'use strict';

/*
 * #967 R2 결함 G-1/G-2 전용 harness — clients/web/order-app/index.html 정본에서
 * applyCommManualLock/clearCommManualLocks(신규, 홈 R1 fix 의 comm 대칭 이식)·
 * recomputeCommDerived·takeSnapshot/applySnapshot 을 그대로 추출해 vm 으로 실행한다.
 * 재구현이 아니다.
 *
 * legacy-quantity-golden 의 runCommercial() 은 COMM_MANUAL_* 를 "이미 잠긴 상태"로만
 * 주입하고 add/delete 왕복·저장→복원 왕복·초기화 잠금해제 를 검사하지 않는다 — 이
 * 파일은 그 왕복 전용이다(homeManualLockHarness.cjs 의 comm 대응).
 *
 * legacyQuantityBoundary.js·fixtures.js·goldens.js·legacy-quantity-golden.test.{js,ts}
 * (견적·주문 공유 golden 하네스)는 한 줄도 건드리지 않고 SOURCE_PATH/extractFunctionSource/
 * extractConstSource/derivationPreambleSource·fixtures 만 읽기 전용으로 재사용한다.
 * homeManualLockHarness.cjs(R1)도 건드리지 않는다 — 이 파일은 그 형제 파일이다.
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

const COMM_FUNCTIONS = [
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
  'commManualSetForRow',
  'recomputeCommDerived',
  'applyCommManualLock',
  'clearCommManualLocks',
];

function bundle(source, names) {
  return names.map((name) => extractFunctionSource(source, name)).join('\n');
}

function loadOrderSource(sourceMutator) {
  const raw = fs.readFileSync(SOURCE_PATH.order, 'utf8');
  return typeof sourceMutator === 'function' ? sourceMutator(raw) : raw;
}

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
    const document = {
      getElementById: (id) => el('#' + id),
      querySelector: (selector) => el(selector),
      querySelectorAll: () => [],
    };
  `;
}

function catalogPrelude(source, family) {
  const fixture = fixtureFor(family);
  return {
    dom: (fixture.options && fixture.options.dom) || {},
    sourceQuantities: fixture.sourceQuantities,
    rows: fixture.catalog.commercial,
    script: `
      const HOMEMULTI = ${JSON.stringify(fixture.catalog.home)};
      const SINGLE_SETS = ${JSON.stringify(fixture.catalog.single)};
      const SINGLE_PARTS = ${JSON.stringify(fixture.catalog.singleParts)};
      ${derivationPreambleSource(source)}
    `,
  };
}

const COMMON_STUBS = `
  const CSS = { escape: (v) => String(v).replace(/[^a-zA-Z0-9_-]/g, '_') };
  const fmt = (v) => String(v);
  const commUnitPrice = () => 0;
  const commCustomPrices = new Map();
  const syncCommTotals = () => {};
  const updateInlineTotals = () => {};
  const updateCommRatio = () => {};
  const refreshBranchOpenButton = () => {};
`;

const COMM_MANUAL_SETS_DECL = `
  const COMM_MANUAL_PANEL = new Set();
  const COMM_MANUAL_HOSE = new Set();
  const COMM_MANUAL_REMOTE = new Set();
  const COMM_MANUAL_PUMP = new Set();
  const COMM_MANUAL_BASE = new Set();
`;

const LOCK_CHECK = (model) => `(
  COMM_MANUAL_PANEL.has(${JSON.stringify(model)}) ||
  COMM_MANUAL_HOSE.has(${JSON.stringify(model)}) ||
  COMM_MANUAL_REMOTE.has(${JSON.stringify(model)}) ||
  COMM_MANUAL_PUMP.has(${JSON.stringify(model)}) ||
  COMM_MANUAL_BASE.has(${JSON.stringify(model)})
)`;

/**
 * G-2 본체(add-only) 재현 — applyCommManualLock(신규 함수)이 q 값에 따라 add/delete를
 * 대칭으로 처리하는지, 잠금 해제 후 재계산이 자동값으로 복귀하는지를 검증한다.
 */
function runCommClearScenario({ family, model, lockValue, sourceMutator }) {
  const source = loadOrderSource(sourceMutator);
  const prelude = catalogPrelude(source, family);
  const renewFilterMap = extractConstSource(source, 'RENEW_FILTER_MAP');
  const functions = bundle(source, COMM_FUNCTIONS);
  const modelJson = JSON.stringify(model);
  const script = `
    const window = { SHOW_I_HOSE: false, ABSOLUTE_LOCK: new Set() };
    ${COMMON_STUBS}
    ${domScript(prelude.dom)}
    ${prelude.script}
    const COMMULTI = ${JSON.stringify(prelude.rows)};
    const commQty = new Map(Object.entries(${JSON.stringify(prelude.sourceQuantities)}));
    ${COMM_MANUAL_SETS_DECL}
    ${renewFilterMap}
    ${functions}

    const rec = COMMULTI.find(r => r.model === ${modelJson});
    if(!rec) throw new Error('rec 없음: ' + ${modelJson});

    applyCommManualLock(rec, ${modelJson}, ${JSON.stringify(lockValue)});
    const lockedAfterManualInput = ${LOCK_CHECK(model)};
    commQty.set(${modelJson}, ${JSON.stringify(lockValue)});
    const valueAfterManualInput = commQty.get(${modelJson}) || 0;

    applyCommManualLock(rec, ${modelJson}, 0);
    const lockedAfterClear = ${LOCK_CHECK(model)};

    commQty.set(${modelJson}, 0);
    recomputeCommDerived();
    const valueAfterRecompute = commQty.get(${modelJson}) || 0;

    globalThis.__result = {
      lockedAfterManualInput,
      valueAfterManualInput,
      lockedAfterClear,
      valueAfterRecompute,
    };
  `;
  const context = { console: { log: () => {} } };
  vm.runInNewContext(script, context, { filename: SOURCE_PATH.order });
  return context.__result;
}

/**
 * G-2 본체(초기화 버튼 무효) 재현 — clearCommManualLocks(신규 함수)가 5계열 잠금을
 * 전부 비우는지 검증한다. btnResetComm 배선(초기화 버튼 클릭이 이 함수를 부르는지)
 * 자체는 이 vm harness 범위 밖이며(인라인 클릭 핸들러라 추출 불가) 소스 텍스트
 * 존재 확인(RED-first 테스트) + 실 브라우저 왕복으로 별도 검증한다.
 */
function runCommResetScenario({ family, model, lockValue, sourceMutator }) {
  const source = loadOrderSource(sourceMutator);
  const prelude = catalogPrelude(source, family);
  const renewFilterMap = extractConstSource(source, 'RENEW_FILTER_MAP');
  const functions = bundle(source, COMM_FUNCTIONS);
  const modelJson = JSON.stringify(model);
  const script = `
    const window = { SHOW_I_HOSE: false, ABSOLUTE_LOCK: new Set() };
    ${COMMON_STUBS}
    ${domScript(prelude.dom)}
    ${prelude.script}
    const COMMULTI = ${JSON.stringify(prelude.rows)};
    const commQty = new Map(Object.entries(${JSON.stringify(prelude.sourceQuantities)}));
    ${COMM_MANUAL_SETS_DECL}
    ${renewFilterMap}
    ${functions}

    const rec = COMMULTI.find(r => r.model === ${modelJson});
    if(!rec) throw new Error('rec 없음: ' + ${modelJson});

    applyCommManualLock(rec, ${modelJson}, ${JSON.stringify(lockValue)});
    const lockedBeforeReset = ${LOCK_CHECK(model)};

    clearCommManualLocks();
    const lockedAfterReset = ${LOCK_CHECK(model)};

    globalThis.__result = { lockedBeforeReset, lockedAfterReset };
  `;
  const context = { console: { log: () => {} } };
  vm.runInNewContext(script, context, { filename: SOURCE_PATH.order });
  return context.__result;
}

/**
 * G-1 본체 재현 — 상업 파생 칸을 수동 입력(잠금)한 뒤 takeSnapshot()으로 저장하고,
 * 완전히 새 상태(잠금 0·수량 0)에서 applySnapshot()으로 복원했을 때 수동값이
 * 보존되는지를 검증한다. legacyShot=true 이면 저장된 shot에서 commManual* 직렬화
 * 필드를 제거해 "이 fix 이전에 저장된 스냅샷"(D-3 comm 대칭)을 흉내낸다.
 */
function runCommSnapshotRoundtrip({ family, model, lockValue, legacyShot, sourceMutator }) {
  const source = loadOrderSource(sourceMutator);
  const prelude = catalogPrelude(source, family);
  const renewFilterMap = extractConstSource(source, 'RENEW_FILTER_MAP');
  const functions = bundle(source, [
    ...COMM_FUNCTIONS,
    'clearHomeManualLocks',
    'takeSnapshot',
    'applySnapshot',
  ]);
  const modelJson = JSON.stringify(model);
  const stripLockFields = legacyShot
    ? `delete shot.core.commManualPanel; delete shot.core.commManualHose; delete shot.core.commManualRemote; delete shot.core.commManualPump; delete shot.core.commManualBase;`
    : '';
  const script = `
    const window = { SHOW_I_HOSE: false, ABSOLUTE_LOCK: new Set() };
    ${COMMON_STUBS}
    const confirm = () => true;
    const alert = () => {};
    const sendLog = () => {};
    ${domScript(prelude.dom)}
    ${prelude.script}
    const COMMULTI = ${JSON.stringify(prelude.rows)};
    const homeQty = new Map();
    const singleQty = new Map();
    const commQty = new Map(Object.entries(${JSON.stringify(prelude.sourceQuantities)}));
    const oldQty = new Map();
    const homeRowByModel = new Map(HOMEMULTI.map((row) => [row.model, row]));
    const HOME_MANUAL_PANEL = new Set();
    const HOME_MANUAL_HOSE = new Set();
    const HOME_MANUAL_REMOTE = new Set();
    const HOME_MANUAL_BRANCH = new Set();
    const HOME_MANUAL_FOOT = new Set();
    ${COMM_MANUAL_SETS_DECL}
    ${renewFilterMap}
    ${functions}

    const rec = COMMULTI.find(r => r.model === ${modelJson});
    if(!rec) throw new Error('rec 없음: ' + ${modelJson});

    /* 1) 사용자가 comm 파생 칸에 직접 값을 입력해 잠근다 */
    applyCommManualLock(rec, ${modelJson}, ${JSON.stringify(lockValue)});
    commQty.set(${modelJson}, ${JSON.stringify(lockValue)});

    /* 2) 저장 */
    const shot = takeSnapshot();
    ${stripLockFields}
    const serializedLockArrays = {
      commManualPanel: shot.core.commManualPanel,
      commManualHose: shot.core.commManualHose,
      commManualRemote: shot.core.commManualRemote,
      commManualPump: shot.core.commManualPump,
      commManualBase: shot.core.commManualBase,
    };
    const anyLockSerialized = Object.values(serializedLockArrays).some((arr) => Array.isArray(arr) && arr.includes(${modelJson}));

    /* 3) 완전히 새 세션(잠금 0·수량 0)에서 복원 — 페이지 재진입/새로고침을 흉내낸다 */
    commQty.clear();
    COMMULTI.forEach((row) => commQty.set(row.model, 0));
    clearCommManualLocks();
    applySnapshot(shot);

    globalThis.__result = {
      anyLockSerialized,
      valueAfterRestore: commQty.get(${modelJson}) || 0,
      lockedAfterRestore: ${LOCK_CHECK(model)},
    };
  `;
  const context = { console: { log: () => {} } };
  vm.runInNewContext(script, context, { filename: SOURCE_PATH.order });
  return context.__result;
}

module.exports = {
  runCommClearScenario,
  runCommResetScenario,
  runCommSnapshotRoundtrip,
  fixtureFor,
};
