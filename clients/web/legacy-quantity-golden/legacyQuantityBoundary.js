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

/**
 * name 함수가 이 정본 파일에 실제로 존재하면 추출하고, 없으면 빈 문자열을 반환한다.
 * 견적·주문 두 포팅본은 항상 같은 이름으로 헬퍼를 분리하지 않는다 — 예를 들어
 * `isDefaultComponent_`는 견적에만 별도 함수로 있고 주문은 동일 정규식을 인라인한다.
 * 이런 실제 포팅 드리프트를 있는 그대로 흡수하기 위한 관용 추출이며, 수량 계산의
 * 본체 함수(예: recomputeSingleExtras 등 필수 목록)에는 사용하지 않는다 — 그런 함수가
 * 없으면 즉시 에러가 나야 한다.
 */
function extractOptionalFunctionSource(source, name) {
  return source.includes(`function ${name}`) ? extractFunctionSource(source, name) : '';
}

/** 정본의 단순 const 객체 선언을 그대로 추출한다. */
function extractConstSource(source, name) {
  const start = source.indexOf(`const ${name}`);
  if (start < 0) throw new Error(`${name} 상수를 찾을 수 없습니다.`);
  const end = source.indexOf(';', start);
  if (end < 0) throw new Error(`${name} 상수 선언을 닫을 수 없습니다.`);
  return source.slice(start, end + 1);
}

/**
 * startMarker부터 endMarker(포함)까지 정본 텍스트를 그대로 잘라낸다.
 * 함수 하나·상수 하나가 아니라, 여러 top-level const 선언이 이어지는 블록을
 * 통째로 추출할 때 사용한다(파생 target 상수 preamble).
 */
function extractRangeSource(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`시작 지점을 찾을 수 없습니다: ${startMarker}`);
  const endAt = source.indexOf(endMarker, start);
  if (endAt < 0) throw new Error(`종료 지점을 찾을 수 없습니다: ${endMarker}`);
  return source.slice(start, endAt + endMarker.length);
}

// HOMEMULTI/SINGLE_SETS 카탈로그 snapshot에서 target 모델 상수(HOSE_*, FOOT_*, REMOTE_*,
// BRANCH_*, MODEL_6HP_SINGLE, PANEL_MODELS, SS_*_ID, SEND_AS_SET_IDS, AUTO_HOME_MODELS/
// AUTO_SINGLE_IDS)를 도출하는 정본의 실제 top-level 블록. 두 앱 모두 이 정확한 문자열로
// 시작·종료한다(order-app은 REMOTE_360_DEFAULT 정규식만 다르다 — 그것이 실제 앱 드리프트다).
const DERIVATION_PREAMBLE_START = 'const MODEL_6HP_SINGLE=';
const DERIVATION_PREAMBLE_END = 'markAutoSingle(SS_FOOT_ROUND_ID,SS_FOOT_FLAT_ID,SS_WIRED_BOARD_ID,SS_CEILING_PUMP_ID);';

/**
 * 정본이 카탈로그 snapshot에서 target 모델 상수를 도출하는 실제 블록을 그대로 추출한다.
 * 이 블록은 fixture가 주입하는 값이 아니라, 이 함수가 정본 파일에서 읽어온 텍스트로만
 * 채워진다 — target 모델은 입력이 아니라 정본 계산의 결과여야 한다는 것이 이 슬라이스의
 * 불변식이다.
 */
function derivationPreambleSource(source) {
  return extractRangeSource(source, DERIVATION_PREAMBLE_START, DERIVATION_PREAMBLE_END);
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

/**
 * HOMEMULTI/SINGLE_SETS/SINGLE_PARTS 카탈로그 snapshot과, 정본이 그 snapshot에서 도출하는
 * target 상수 preamble을 함께 반환한다. runHome/runSingle/runCommercial 셋 다 이 프렐류드를
 * 공유한다 — 실제 페이지에서도 이 상수들은 딱 한 번만 top-level에서 계산되어 홈·싱글·상업
 * 세 계산이 전부 같은 값을 참조한다(예: 상업의 pickHoseModel은 홈 카탈로그에서 도출된
 * HOSE_I_1W를 그대로 재사용한다 — index.ejs:4083-4088).
 */
function catalogPreludeScript(source, input) {
  const home = clone(input.catalog?.home || []);
  const single = clone(input.catalog?.single || []);
  const singleParts = clone(input.catalog?.singleParts || []);
  return `
    const HOMEMULTI = ${JSON.stringify(home)};
    const SINGLE_SETS = ${JSON.stringify(single)};
    const SINGLE_PARTS = ${JSON.stringify(singleParts)};
    ${derivationPreambleSource(source)}
  `;
}

function runHome(source, input) {
  const quantities = input.sourceQuantities || {};
  const locks = input.manualLocks?.home || {};
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
  const script = `
    ${commonContextScript(input)}
    ${domScript(input.options?.dom)}
    ${catalogPreludeScript(source, input)}
    const homeQty = new Map(Object.entries(${JSON.stringify(quantities)}));
    const homeRowByModel = new Map(HOMEMULTI.map((row) => [row.model, row]));
    const HOME_MANUAL_PANEL = new Set(${JSON.stringify(locks.panel || [])});
    const HOME_MANUAL_HOSE = new Set(${JSON.stringify(locks.hose || [])});
    const HOME_MANUAL_REMOTE = new Set(${JSON.stringify(locks.remote || [])});
    const HOME_MANUAL_BRANCH = new Set(${JSON.stringify(locks.branch || [])});
    const HOME_MANUAL_FOOT = new Set(${JSON.stringify(locks.foot || [])});
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
  const quantities = input.sourceQuantities || {};
  const locks = input.manualLocks?.single || {};
  // partsForSetStrict_/getDefaultRemoteRows는 D-4에서 스텁으로 대체됐던 실제 정본 함수다.
  // isDefaultComponent_는 견적에만 별도 함수로 존재한다(주문은 /기본/i 정규식을 인라인) —
  // 실제 포팅 드리프트이므로 관용 추출로 흡수한다.
  const optionalFunctions = ['isDefaultComponent_']
    .map((name) => extractOptionalFunctionSource(source, name))
    .filter(Boolean);
  const functions = [
    ...optionalFunctions,
    sourceFunctionBundle(source, [
      'partsForSetStrict_',
      'getDefaultRemoteRows',
      'allowRemoteChange_',
      'is1WaySet_',
      'recomputeSingleBaseFoot',
      'recomputeSingleExtras',
    ]),
  ].join('\n');
  const script = `
    ${commonContextScript(input)}
    ${domScript(input.options?.dom)}
    ${catalogPreludeScript(source, input)}
    const singleQty = new Map(Object.entries(${JSON.stringify(quantities)}));
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
    ${catalogPreludeScript(source, input)}
    const COMMULTI = ${JSON.stringify(rows)};
    const commQty = new Map(Object.entries(${JSON.stringify(quantities)}));
    const COMM_MANUAL_PANEL = new Set(${JSON.stringify(locks.panel || [])});
    const COMM_MANUAL_HOSE = new Set(${JSON.stringify(locks.hose || [])});
    const COMM_MANUAL_REMOTE = new Set(${JSON.stringify(locks.remote || [])});
    const COMM_MANUAL_PUMP = new Set(${JSON.stringify(locks.pump || [])});
    const COMM_MANUAL_BASE = new Set(${JSON.stringify(locks.base || [])});
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
  // codeByCumulativeSum/codeByOutdoorHP는 D-1에서 자체 구현으로 대체됐던 실제 정본 함수다.
  // 실제 임계값은 index.ejs:12592-12611 — 누적합 150/406/464/696/986, 실외기 HP 강제표
  // 50/100/160/220/340 — 이며, 하네스가 재구현하지 않고 정본에서 그대로 추출한다.
  //
  // pushBranchPartsToCommFromBadges(index.ejs:13234-13261)도 마찬가지다 — 코드→모델 MAP은
  // 이 함수 안에 있다. 예전에는 이 함수를 no-op으로 스텁하고 하네스가 자체 modelByCode
  // 사본을 유지했다 — 우연히 같은 문자열이었을 뿐 정본에서 추출한 것이 아니었다(dev-report
  // §3 C-09 커버 라인 :13235-13238이 실제로는 실행되지 않았던 지점). 이제 commQty Map을
  // 실제로 주고 이 함수를 그대로 실행해, 코드→모델 MAP 자체가 정본에서 나온다.
  const functions = sourceFunctionBundle(source, [
    'codeByCumulativeSum',
    'codeByOutdoorHP',
    'recomputeBranchCodes',
    'pushBranchPartsToCommFromBadges',
  ]);
  const slots = input.options?.branchSlots || [];
  const isOrder = input.app === 'order';
  const slotSelector = isOrder ? '.out-drop' : '.out-slot';
  const html = `
    const CSS = { escape: (value) => String(value).replace(/[^a-zA-Z0-9_-]/g, '_') };
    const commQty = new Map();
    const updateCommRatio = () => {};
    const syncCommTotals = () => {};
    const updateInlineTotals = () => {};
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
    const saveBranchState = () => {};
    recomputeBranchCodes([{ model: ${JSON.stringify(input.options?.outdoorModel || 'AM120AXVHHH1')} }]);
    globalThis.__result = {
      codes: __cells.map((cell) => cell.dataset.code || '-'),
      quantities: nonZeroMap(commQty),
      allQuantities: mapObject(commQty),
    };
  `;
  const context = { nonZeroMap, mapObject, console: { log: () => {} } };
  vm.runInNewContext(html, context, { filename: SOURCE_PATH[input.app || 'estimate'] });
  return context.__result;
}

function loadSource(app, sourceMutator) {
  let source = fs.readFileSync(SOURCE_PATH[app], 'utf8');
  return typeof sourceMutator === 'function' ? sourceMutator(source, app) : source;
}

/**
 * 순수 경계: 입력 snapshot을 새 VM에 넣고 정본 계산 함수의 출력만 반환한다.
 * 가격 원천이 없는 model-only fixture에서는 금액을 계산하지 않고 null로 남긴다.
 * target 모델(HOSE_*, FOOT_*, REMOTE_*, BRANCH_*, SS_*_ID, PANEL_MODELS 등)은 fixture가
 * 주입하지 않는다 — 정본이 카탈로그 snapshot에서 실제로 도출한다(derivationPreambleSource).
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
  extractOptionalFunctionSource,
  extractConstSource,
  extractRangeSource,
  derivationPreambleSource,
};
