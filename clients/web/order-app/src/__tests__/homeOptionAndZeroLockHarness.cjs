'use strict';

/*
 * #967 R2 결함 G-3[MED·회귀]/G-5[MED]/G-6[LOW-MED] 전용 harness — index.html 정본에서
 * onHomeOptionChange(신규)·onHomeQtyInput(G-5용 3번째 인자 확장)·홈 재계산 함수를
 * 그대로 추출해 vm으로 실행한다. 재구현이 아니다.
 *
 * G-3/G-6 뿌리 — 옵션 컨트롤(판넬변경/유연호스 제외/리모컨/분기관 제외/발통포함)이
 * 바뀌어도 개별 모델 잠금(HOME_MANUAL_*)이 그대로 남아 "계열 단위 제외·치환"을
 * 막는다(U-1 위반). fix는 renderHomeOptions(:4914-4925)의 change 리스너를
 * onHomeOptionChange(controlId)(신규, 해당 계열 잠금을 비우고 재계산)로 통일한다 —
 * 이 함수 자체를 vm으로 추출해 실행하므로 "리스너가 잠금을 비우는지"가 아니라
 * "실제 그 함수가 잠금을 비우고 재계산하는지"를 검증한다. renderHomeOptions가 각
 * 컨트롤의 change 이벤트에 이 함수를 실제로 잇는지(배선)는 이 harness 범위 밖이며
 * 소스 텍스트 확인 + 실 브라우저 왕복으로 별도 검증한다.
 *
 * G-5 뿌리 — bindQty(:2869-2890)가 raw 입력이 빈 문자열인지(진짜 지움) 숫자 0인지
 * (명시적 0 입력)를 구분하지 않고 둘 다 v=0으로 뭉개 onHomeQtyInput에 넘겼다. fix는
 * bindQty가 raw==='' 여부를 3번째 인자(explicit)로 함께 넘기고, onHomeQtyInput이
 * add/delete 분기를 v truthy 대신 explicit(주어지면)로 판단하도록 확장한다 — 2-인자
 * 호출(R1 하네스·기존 테스트)은 explicit===undefined 이므로 기존 v truthy 분기로
 * fallback해 하위호환된다.
 *
 * legacyQuantityBoundary.js·fixtures.js·goldens.js·legacy-quantity-golden.test.{js,ts}
 * (공유 golden 하네스)와 homeManualLockHarness.cjs·commManualLockHarness.cjs(R1/G-1/G-2)는
 * 이 파일이 건드리지 않는다 — 형제 파일이다.
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
  'noteHomeCatalogMissing_',
  'setHomeDerivedQty_',
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

function fixtureFor(family) {
  const found = fixtures.find((fixture) => fixture.family === family);
  if (!found) throw new Error(`fixture 를 찾을 수 없습니다: ${family}`);
  return found;
}

function catalogPrelude(source, family) {
  const fixture = fixtureFor(family);
  return {
    sourceQuantities: fixture.sourceQuantities,
    home: fixture.catalog.home,
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

/**
 * G-3 재현 — 파생 모델을 수동 입력(잠금)한 뒤, 옵션 컨트롤이 "계열 단위 제외"로
 * 바뀌었을 때(onHomeOptionChange 호출로 시뮬레이션) 잠금이 제외를 막는지 검증한다.
 */
function runHomeOptionChangeScenario({ family, model, lockValue, controlId, dom, sourceMutator }) {
  const source = loadOrderSource(sourceMutator);
  const prelude = catalogPrelude(source, family);
  const functions = bundle(source, [...HOME_RECOMPUTE_FUNCTIONS, 'onHomeOptionChange']);
  const modelJson = JSON.stringify(model);
  const script = `
    const window = { SHOW_I_HOSE: false, ABSOLUTE_LOCK: new Set() };
    ${COMMON_STUBS}
    ${domScript(dom)}
    ${prelude.script}
    const homeQty = new Map(Object.entries(${JSON.stringify(prelude.sourceQuantities)}));
    const homeRowByModel = new Map(HOMEMULTI.map((row) => [row.model, row]));
    let HOME_CATALOG_MISSING_MODELS = new Map();
    ${HOME_MANUAL_SETS_DECL}
    ${functions}

    onHomeQtyInput(${modelJson}, ${JSON.stringify(lockValue)}, true);
    const lockedBeforeOptionChange = ${LOCK_CHECK(model)};
    const valueBeforeOptionChange = homeQty.get(${modelJson}) || 0;

    onHomeOptionChange(${JSON.stringify(controlId)});

    globalThis.__result = {
      lockedBeforeOptionChange,
      valueBeforeOptionChange,
      lockedAfterOptionChange: ${LOCK_CHECK(model)},
      valueAfterOptionChange: homeQty.get(${modelJson}) || 0,
    };
  `;
  const context = { console: { log: () => {} } };
  vm.runInNewContext(script, context, { filename: SOURCE_PATH.order });
  return context.__result;
}

/**
 * G-6 재현 — 공청판넬 ↔ 기본판넬(4WAY) 왕복 시 이중 계상되는지 검증한다.
 * t5-exclusion.cjs (d1~d5)의 실 브라우저 시퀀스를 그대로 옮긴 것이다:
 *   (d1) 기본판넬, 실내기 N → fromModel=N
 *   (d2) 공청판넬 선택(잠금 없음) → toModel=N, fromModel=0
 *   (d3) toModel 수동 입력(잠금)
 *   (d4) 기본판넬로 되돌림 → fromModel/toModel 이중 계상 여부(G-6 본체)
 *   (d5) 다시 공청판넬 → toModel 치환 차단 여부
 */
function runPanelSwapScenario({ family, indoorModel, fromModel, toModel, indoorQty, manualToValue, sourceMutator }) {
  const source = loadOrderSource(sourceMutator);
  const prelude = catalogPrelude(source, family);
  const functions = bundle(source, [...HOME_RECOMPUTE_FUNCTIONS, 'onHomeOptionChange']);
  const script = `
    const window = { SHOW_I_HOSE: false, ABSOLUTE_LOCK: new Set() };
    ${COMMON_STUBS}
    let __home_panel = '';
    const document = {
      getElementById: (id) => id === 'home_panel' ? { value: __home_panel } : null,
      querySelector: (selector) => selector === '#home_panel' ? { value: __home_panel } : null,
      querySelectorAll: () => [],
    };
    const el = (selector) => document.querySelector(selector);
    ${prelude.script}
    const homeQty = new Map(Object.entries(${JSON.stringify(prelude.sourceQuantities)}));
    const homeRowByModel = new Map(HOMEMULTI.map((row) => [row.model, row]));
    let HOME_CATALOG_MISSING_MODELS = new Map();
    ${HOME_MANUAL_SETS_DECL}
    ${functions}

    /* (d1) 기본판넬(옵션 공백), 실내기 N */
    __home_panel = '';
    onHomeQtyInput(${JSON.stringify(indoorModel)}, ${JSON.stringify(indoorQty)}, true);
    const d1 = { from: homeQty.get(${JSON.stringify(fromModel)}) || 0, to: homeQty.get(${JSON.stringify(toModel)}) || 0 };

    /* (d2) 공청판넬 선택(잠금 없음) */
    __home_panel = '공청판넬';
    onHomeOptionChange('home_panel');
    const d2 = { from: homeQty.get(${JSON.stringify(fromModel)}) || 0, to: homeQty.get(${JSON.stringify(toModel)}) || 0 };

    /* (d3) 공청판넬(to) 수동 입력 → 잠금 */
    onHomeQtyInput(${JSON.stringify(toModel)}, ${JSON.stringify(manualToValue)}, true);
    const d3 = { from: homeQty.get(${JSON.stringify(fromModel)}) || 0, to: homeQty.get(${JSON.stringify(toModel)}) || 0 };

    /* (d4) 기본판넬로 되돌림 — G-6 본체: from/to 이중 계상 여부 */
    __home_panel = '';
    onHomeOptionChange('home_panel');
    const d4 = { from: homeQty.get(${JSON.stringify(fromModel)}) || 0, to: homeQty.get(${JSON.stringify(toModel)}) || 0 };

    /* (d5) 다시 공청판넬 — 치환이 여전히 되는지(고착 없음) */
    __home_panel = '공청판넬';
    onHomeOptionChange('home_panel');
    const d5 = { from: homeQty.get(${JSON.stringify(fromModel)}) || 0, to: homeQty.get(${JSON.stringify(toModel)}) || 0 };

    globalThis.__result = { d1, d2, d3, d4, d5 };
  `;
  const context = { console: { log: () => {} } };
  vm.runInNewContext(script, context, { filename: SOURCE_PATH.order });
  return context.__result;
}

/**
 * G-5 재현 — onHomeQtyInput 이 3번째 인자(explicit)로 "명시적 0 입력"과
 * "칸을 지움"을 구분하는지 검증한다. 2-인자 호출(레거시/R1 하네스 시그니처)은
 * explicit===undefined 이므로 기존 v truthy 분기로 폴백해야 한다(하위호환).
 */
function runExplicitZeroScenario({ family, model, sourceMutator }) {
  const source = loadOrderSource(sourceMutator);
  const prelude = catalogPrelude(source, family);
  const functions = bundle(source, HOME_RECOMPUTE_FUNCTIONS);
  const modelJson = JSON.stringify(model);
  const script = `
    const window = { SHOW_I_HOSE: false, ABSOLUTE_LOCK: new Set() };
    ${COMMON_STUBS}
    ${domScript({})}
    ${prelude.script}
    const homeQty = new Map(Object.entries(${JSON.stringify(prelude.sourceQuantities)}));
    const homeRowByModel = new Map(HOMEMULTI.map((row) => [row.model, row]));
    ${HOME_MANUAL_SETS_DECL}
    ${functions}

    /* U-2 본체: 사용자가 "0"을 명시적으로 입력(지운 게 아니라) */
    onHomeQtyInput(${modelJson}, 0, true);
    const lockedAfterExplicitZero = ${LOCK_CHECK(model)};
    const valueAfterExplicitZero = homeQty.get(${modelJson}) || 0;

    /* 회귀 울타리: 진짜로 칸을 지움(explicit=false) — 여전히 해제돼야 한다 */
    onHomeQtyInput(${modelJson}, 5, true);
    onHomeQtyInput(${modelJson}, 0, false);
    const lockedAfterRealClear = ${LOCK_CHECK(model)};

    /* 하위호환: 2-인자 레거시 호출(R1 하네스·기존 코드 경로) — 옛 동작(0=해제) 유지 */
    onHomeQtyInput(${modelJson}, 7, true);
    onHomeQtyInput(${modelJson}, 0);
    const lockedAfterLegacyTwoArgClear = ${LOCK_CHECK(model)};

    globalThis.__result = {
      lockedAfterExplicitZero,
      valueAfterExplicitZero,
      lockedAfterRealClear,
      lockedAfterLegacyTwoArgClear,
    };
  `;
  const context = { console: { log: () => {} } };
  vm.runInNewContext(script, context, { filename: SOURCE_PATH.order });
  return context.__result;
}

module.exports = {
  runHomeOptionChangeScenario,
  runPanelSwapScenario,
  runExplicitZeroScenario,
  fixtureFor,
};
