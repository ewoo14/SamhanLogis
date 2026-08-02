import { describe, expect, it } from 'vitest';

declare const process: {
  cwd: () => string;
};
declare function require(id: string): any;

const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');

type CatalogRow = Record<string, any>;

type CatalogFixture = {
  source: {
    endpoint: string;
    fetchedOn: string;
    httpStatus: number;
    originalCommercialMultiRows: number;
    afterRemovingDerivedRows: number;
    selectedFields: string[];
    note: string;
  };
  rows: CatalogRow[];
};

const FIXTURE_PATH = resolve(
  process.cwd(),
  'src/__tests__/fixtures/commercialMultiBootstrap.fixture.json',
);
const HOME_FIXTURE_PATH = resolve(
  process.cwd(),
  'src/__tests__/fixtures/homemultiBootstrap.fixture.json',
);
const SINGLE_FIXTURE_PATH = resolve(
  process.cwd(),
  'src/__tests__/fixtures/singleSetsBootstrap.fixture.json',
);

function loadBootstrapFixture(): CatalogFixture {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as CatalogFixture;
}

function loadSingleBootstrapFixture(): {
  source: {
    endpoint: string;
    fetchedOn: string;
    httpStatus: number;
    originalSingleSetRows: number;
    note: string;
  };
  rows: CatalogRow[];
} {
  return JSON.parse(readFileSync(SINGLE_FIXTURE_PATH, 'utf8')) as {
    source: {
      endpoint: string;
      fetchedOn: string;
      httpStatus: number;
      originalSingleSetRows: number;
      note: string;
    };
    rows: CatalogRow[];
  };
}

function extractFunction(source: string, name: string): string {
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

function extractConst(source: string, name: string): string {
  const start = source.indexOf(`const ${name}`);
  if (start < 0) throw new Error(`${name} 상수를 찾을 수 없습니다.`);
  const end = source.indexOf(';', start);
  if (end < 0) throw new Error(`${name} 상수 선언을 닫을 수 없습니다.`);
  return source.slice(start, end + 1);
}

type CommercialRecomputeOptions = {
  hose1?: string;
  hose4?: string;
};

function runRecompute(
  rows: CatalogRow[],
  sourceModel: string | null,
  missingModel = '방진가대S2소',
  options: CommercialRecomputeOptions = {},
) {
  const source = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
  const warning = { hidden: true, textContent: '', innerHTML: '' };
  const controls: Record<string, { value?: string; checked?: boolean }> = {
    '#comm_ex_hose': { checked: false },
    '#comm_ex_base': { checked: false },
    '#comm_panel': { value: '기본판넬' },
    '#comm_p360': { value: '원형' },
    '#comm_remote': { value: '무선' },
  };

  const script = `
    const window = { SHOW_I_HOSE: false };
    const CSS = { escape: (value) => String(value).replace(/[^a-zA-Z0-9_-]/g, '_') };
    const COMMULTI = ${JSON.stringify(rows)};
    const commQty = new Map(${JSON.stringify(sourceModel ? [[sourceModel, 1]] : [])});
    const warning = globalThis.__warning;
    const controls = globalThis.__controls;
    const document = {
      getElementById: (id) => id === 'commCatalogWarnings'
        ? warning
        : controls['#' + id] || null,
      querySelector: (selector) => controls[selector] || null,
      querySelectorAll: () => [],
    };
    const el = (selector) => document.querySelector(selector);
    const fmt = (value) => String(value);
    const commUnitPrice = (model) => Number(COMMULTI.find((row) => row.model === model)?.price || 0);
    const HOSE_1W = ${JSON.stringify(options.hose1 || '')};
    const HOSE_4W = ${JSON.stringify(options.hose4 || '')};
    const HOSE_I_1W = '';
    const HOSE_I_4W = '';
    const syncCommTotals = () => {};
    const updateInlineTotals = () => {};
    const updateCommRatio = () => {};
    const commCustomPrices = new Map();
    const DERIVED_QTY_TARGETS = { commercial: new Set() };
    const registerDerivedQty = (scope, model) => DERIVED_QTY_TARGETS[scope]?.add(model);
    const isManualQtyLocked = () => false;
    const setManualQtyLock = () => {};
    const setDerivedQty = (scope, map, model, quantity) => map.set(model, quantity);
    const RENEW_FILTER_MAP = {};
    ${[
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
      'recomputeCommDerived',
    ].map((name) => extractFunction(source, name)).join('\n')}
    ${source.includes('function renderCatalogWarnings_')
      ? extractFunction(source, 'renderCatalogWarnings_')
      : ''}
    ${source.includes('function renderCommCatalogWarnings')
      ? extractFunction(source, 'renderCommCatalogWarnings')
      : 'function renderCommCatalogWarnings() {}'}
    recomputeCommDerived();
    globalThis.__result = {
      hidden: warning.hidden,
      textContent: warning.textContent,
      innerHTML: warning.innerHTML,
      missingQuantity: commQty.get(${JSON.stringify(missingModel)}) || 0,
    };
  `;

  const context = vm.createContext({ __warning: warning, __controls: controls });
  vm.runInContext(script, context);
  return context.__result as {
    hidden: boolean;
    textContent: string;
    innerHTML: string;
    missingQuantity: number;
  };
}

function runHomeRecompute(rows: CatalogRow[], noHose = false) {
  const source = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
  const homeWarning = { hidden: true, textContent: '' };
  const controls: Record<string, { checked?: boolean }> = {
    '#home_no_hose': { checked: noHose },
  };

  const script = `
    const window = { SHOW_I_HOSE: false };
    const HOMEMULTI = ${JSON.stringify(rows)};
    const homeQty = new Map(HOMEMULTI.map((row) => [row.model, 0]));
    homeQty.set('AJ012BN1PBC2', 1);
    const HOSE_1W = HOMEMULTI.find((row) => row.model === 'FH-LFHLF')?.model || '';
    const HOSE_4W = '';
    const HOSE_I_1W = '';
    const HOSE_I_4W = '';
    let HOME_CATALOG_MISSING_MODELS = new Map();
    const noteHomeCatalogMissing_ = ${extractFunction(source, 'noteHomeCatalogMissing_').replace(/^function noteHomeCatalogMissing_/, 'function noteHomeCatalogMissing_')};
    const setHomeDerivedQty_ = ${extractFunction(source, 'setHomeDerivedQty_').replace(/^function setHomeDerivedQty_/, 'function setHomeDerivedQty_')};
    const renderCatalogWarnings_ = ${extractFunction(source, 'renderCatalogWarnings_').replace(/^function renderCatalogWarnings_/, 'function renderCatalogWarnings_')};
    const renderHomeCatalogWarnings = ${extractFunction(source, 'renderHomeCatalogWarnings').replace(/^function renderHomeCatalogWarnings/, 'function renderHomeCatalogWarnings')};
    const controls = globalThis.__controls;
    const warning = globalThis.__warning;
    const document = {
      getElementById: (id) => id === 'homeCatalogWarnings' ? warning : controls['#' + id] || null,
      querySelector: (selector) => controls[selector] || null,
    };
    const el = (selector) => document.querySelector(selector);
    const setDerivedQty = globalThis.__setDerivedQty;
    const recomputeHomeBranches = () => {};
    const recomputeHomeRemotes = () => {};
    const recomputeFootAll = () => {};
    const recomputeHomePanels = () => {};
    ${extractFunction(source, 'recomputeHomeDerived')}
    recomputeHomeDerived(false);
    globalThis.__result = {
      hidden: warning.hidden,
      textContent: warning.textContent,
      hoseQuantity: homeQty.get('FH-LFHLF') || 0,
    };
  `;

  const context = vm.createContext({ __warning: homeWarning, __controls: controls });
  context.__setDerivedQty = (_scope: string, state: Map<string, number>, model: string, quantity: number) => state.set(model, quantity);
  vm.runInContext(script, context);
  return context.__result as { hidden: boolean; textContent: string; hoseQuantity: number };
}

function runSingleRecompute(
  rows: CatalogRow[],
  sourceId: string,
  targetId: string,
  targetModel: string,
  options: { base?: boolean; remote?: string } = {},
) {
  const source = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
  const warning = { hidden: true, textContent: '', innerHTML: '' };
  const controls: Record<string, { value?: string; checked?: boolean }> = {
    '#ss_base': { checked: !!options.base },
    '#ss_remote': { value: options.remote || '' },
    '#ss_remote_ex': { checked: false },
  };

  const optionalFunction = (name: string) =>
    source.includes(`function ${name}`) ? extractFunction(source, name) : '';

  const script = `
    const window = { SHOW_I_HOSE: false };
    const HOMEMULTI = [];
    const SINGLE_SETS = ${JSON.stringify(rows)};
    const SINGLE_PARTS = [];
    const singleQty = new Map([[${JSON.stringify(sourceId)}, 1]]);
    let SINGLE_CATALOG_MISSING_MODELS = new Map();
    const warning = globalThis.__warning;
    const controls = globalThis.__controls;
    const document = {
      getElementById: (id) => id === 'singleCatalogWarnings'
        ? warning
        : controls['#' + id] || null,
      querySelector: (selector) => controls[selector] || null,
      querySelectorAll: () => [],
    };
    const el = (selector) => document.querySelector(selector);
    const CSS = { escape: (value) => String(value).replace(/[^a-zA-Z0-9_-]/g, '_') };
    const fmt = (value) => String(value);
    const registerDerivedQty = () => {};
    const setDerivedQty = (_scope, state, model, quantity) => state.set(model, quantity);
    const isManualQtyLocked = () => false;
    const setManualQtyLock = () => {};
    const syncSingleUIFromState = () => {};
    const is1WaySet_ = (row) => /1\s*way|1way/i.test(String(row?.name || ''));
    const allowRemoteChange_ = () => true;
    ${optionalFunction('noteSingleCatalogMissing_')}
    ${optionalFunction('setSingleDerivedQty_')}
    ${optionalFunction('renderCatalogWarnings_')}
    ${optionalFunction('renderSingleCatalogWarnings')}
    ${optionalFunction('recomputeSingleBaseFoot')}
    ${optionalFunction('recomputeSingleExtras')}
    ${optionalFunction('recomputeSingleDerived')}
    const SS_WIRED_BOARD_ID = (SINGLE_SETS.find(s => /AIM-?A01N/i.test(s?.model || '')) || {}).id || null;
    const SS_CEILING_PUMP_ID = (SINGLE_SETS.find(s => /ADP-F075SP/i.test(s?.model || '')) || {}).id || null;
    const SS_FOOT_ROUND_ID = (SINGLE_SETS.find(s => /발통세트/i.test(s?.model || '') || /발통세트/i.test(s?.name || '')) || {}).id || null;
    const SS_FOOT_FLAT_ID = (SINGLE_SETS.find(s => /SI-AL700a/i.test(s?.model || '')) || {}).id || null;
    const recompute = typeof recomputeSingleDerived === 'function'
      ? recomputeSingleDerived
      : () => { recomputeSingleBaseFoot(); recomputeSingleExtras(); };
    recompute();
    globalThis.__result = {
      hidden: warning.hidden,
      textContent: warning.textContent,
      innerHTML: warning.innerHTML,
      targetQuantity: singleQty.get(${JSON.stringify(targetId)}) || 0,
    };
  `;

  const context = vm.createContext({ __warning: warning, __controls: controls });
  vm.runInContext(script, context);
  return context.__result as {
    hidden: boolean;
    textContent: string;
    innerHTML: string;
    targetQuantity: number;
  };
}

describe('상업멀티 파생 카탈로그 누락 신호', () => {
  it.each([
    ['방진가대S2소', 'AM080AXVHHH1'],
    ['AR-EH05', 'AM130BN6PBH1'],
    ['방진가대S2중', 'AM300AXVGHC1'],
  ])('실 bootstrap fixture에서 %s가 빠지면 모델명을 사용자 신호로 남긴다', (missingModel, sourceModel) => {
    const fixture = loadBootstrapFixture();
    const bootstrapRows = fixture.rows;
    expect(bootstrapRows).toHaveLength(fixture.source.originalCommercialMultiRows);
    expect(bootstrapRows.some((row) => row.model === 'AM080AXVHHH1')).toBe(true);
    expect(bootstrapRows.some((row) => row.model === sourceModel)).toBe(true);
    expect(bootstrapRows.some((row) => row.model === missingModel)).toBe(true);

    const catalogWithoutDerived = bootstrapRows.filter((row) => row.model !== missingModel);
    expect(catalogWithoutDerived).toHaveLength(fixture.source.afterRemovingDerivedRows);
    const result = runRecompute(catalogWithoutDerived, sourceModel, missingModel);

    expect(result.hidden).toBe(false);
    expect(`${result.textContent}${result.innerHTML}`).toContain(missingModel);
    expect(result.missingQuantity).toBe(0);
  });

  it('실 bootstrap fixture 정상 행은 경고 없이 파생 수량을 계산한다', () => {
    const fixture = loadBootstrapFixture();
    const result = runRecompute(fixture.rows, 'AM080AXVHHH1');

    expect(result.hidden).toBe(true);
    expect(result.textContent).toBe('');
    expect(result.missingQuantity).toBe(1);
  });

  it('unused_pump_missing_empty_order', () => {
    const fixture = loadBootstrapFixture();
    const catalogWithoutUnusedPump = fixture.rows.filter((row) => row.model !== 'ADP-N047SNK1D');

    expect(fixture.rows.some((row) => row.model === 'ADP-N047SNK1D')).toBe(true);
    expect(catalogWithoutUnusedPump).toHaveLength(fixture.rows.length - 1);

    const result = runRecompute(catalogWithoutUnusedPump, null, 'ADP-N047SNK1D');

    expect(result.hidden).toBe(true);
    expect(result.textContent).toBe('');
    expect(result.missingQuantity).toBe(0);
  });

  it('required_hose_missing_from_both_catalogs', () => {
    const homeFixture = JSON.parse(readFileSync(HOME_FIXTURE_PATH, 'utf8')) as { rows: CatalogRow[] };
    const commercialFixture = loadBootstrapFixture();
    const homemultiWithoutHose = homeFixture.rows.filter((row) => row.model !== 'FH-LFHLF');
    const commercialWithoutHose = commercialFixture.rows.filter((row) => row.model !== 'FH-LFHLF');

    expect(homeFixture.rows.some((row) => row.model === 'FH-LFHLF')).toBe(true);
    expect(commercialFixture.rows.some((row) => row.model === 'FH-LFHLF')).toBe(true);
    expect(homemultiWithoutHose.some((row) => row.model === 'FH-LFHLF')).toBe(false);
    expect(commercialWithoutHose.some((row) => row.model === 'FH-LFHLF')).toBe(false);

    const hose1FromHomemulti = homemultiWithoutHose.find((row) => /유연호스.*(L형|엘형).*(1\s*-?\s*WAY|1WAY)/i.test(row.name || ''))?.model || '';
    const result = runRecompute(
      commercialWithoutHose,
      'AM016MN1PBH2',
      'FH-LFHLF',
      { hose1: hose1FromHomemulti },
    );

    expect(result.hidden).toBe(false);
    expect(`${result.textContent}${result.innerHTML}`).toContain('FH-LFHLF');
    expect(result.missingQuantity).toBe(0);
  });
});

describe('홈멀티 파생 카탈로그 누락 신호', () => {
  it('실 bootstrap fixture에서 FH-LFHLF가 빠지면 모델명을 사용자 신호로 남긴다', () => {
    const fixture = JSON.parse(readFileSync(HOME_FIXTURE_PATH, 'utf8')) as {
      source: { originalHomeMultiRows: number; afterRemovingDerivedRows: number };
      rows: CatalogRow[];
    };
    expect(fixture.source.originalHomeMultiRows).toBe(119);
    expect(fixture.rows).toHaveLength(2);
    const catalogWithoutDerived = fixture.rows.filter((row) => row.model !== 'FH-LFHLF');
    expect(catalogWithoutDerived).toHaveLength(1);
    expect(fixture.source.afterRemovingDerivedRows).toBe(118);

    const result = runHomeRecompute(catalogWithoutDerived);

    expect(result.hidden).toBe(false);
    expect(result.textContent).toContain('FH-LFHLF');
    expect(result.hoseQuantity).toBe(1);
  });

  it('정상 홈멀티 행은 경고 없이 1WAY 호스 수량을 계산한다', () => {
    const fixture = JSON.parse(readFileSync(HOME_FIXTURE_PATH, 'utf8')) as { rows: CatalogRow[] };
    const result = runHomeRecompute(fixture.rows);

    expect(result.hidden).toBe(true);
    expect(result.textContent).toBe('');
    expect(result.hoseQuantity).toBe(1);
  });

  it('유연호스 제외를 선택하면 이전 누락 경고도 현재 상태에 맞춰 사라진다', () => {
    const fixture = JSON.parse(readFileSync(HOME_FIXTURE_PATH, 'utf8')) as { rows: CatalogRow[] };
    const catalogWithoutDerived = fixture.rows.filter((row) => row.model !== 'FH-LFHLF');
    const result = runHomeRecompute(catalogWithoutDerived, true);

    expect(result.hidden).toBe(true);
    expect(result.textContent).toBe('');
    expect(result.hoseQuantity).toBe(0);
  });
});

describe('싱글중대형 파생 카탈로그 누락 신호', () => {
  const cases = [
    { kind: '원형 발통', sourceId: '360 CST UV0', targetModel: '발통세트', base: true },
    { kind: '일자발', sourceId: '냉난방 프리미엄 스탠드98', targetModel: 'SI-AL700a', base: true },
    { kind: '유선리모컨 키트', sourceId: '무풍 1way 냉난방47', targetModel: 'AIM-A01N', remote: '유선리모컨' },
    { kind: '실링용 드레인펌프', sourceId: '싱글 실링61', targetModel: 'ADP-F075SP' },
  ];

  it('사용자 신호 표면은 정확히 하나다', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    expect((html.match(/id="singleCatalogWarnings"/g) || []).length).toBe(1);
  });

  it.each(cases)('실 bootstrap fixture에서 %s가 빠지면 금액 누락 경고를 남긴다', (scenario) => {
    const fixture = loadSingleBootstrapFixture();
    expect(fixture.source.httpStatus).toBe(200);
    expect(fixture.source.originalSingleSetRows).toBe(288);
    expect(fixture.rows).toHaveLength(12);

    const source = fixture.rows.find((row) => row.id === scenario.sourceId);
    const target = fixture.rows.find((row) => row.model === scenario.targetModel);
    expect(source).toBeDefined();
    expect(target).toBeDefined();
    if (!source || !target) throw new Error(`실 bootstrap fixture 행이 없습니다: ${scenario.kind}`);

    const full = runSingleRecompute(fixture.rows, scenario.sourceId, target.id, scenario.targetModel, scenario);
    expect(full.hidden).toBe(true);
    expect(full.textContent).toBe('');
    expect(full.targetQuantity).toBe(1);

    const catalogWithoutDerived = fixture.rows.filter((row) => row.model !== scenario.targetModel);
    expect(catalogWithoutDerived).toHaveLength(11);
    const missing = runSingleRecompute(catalogWithoutDerived, scenario.sourceId, target.id, scenario.targetModel, scenario);

    expect(missing.hidden).toBe(false);
    expect(`${missing.textContent}${missing.innerHTML}`).toContain(scenario.targetModel);
    expect(`${missing.textContent}${missing.innerHTML}`).toContain('주문 금액에 반영되지 않았습니다');
    expect(missing.targetQuantity).toBe(0);
  });
});
