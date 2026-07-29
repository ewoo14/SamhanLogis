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

function loadBootstrapFixture(): CatalogFixture {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as CatalogFixture;
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

function runRecompute(rows: CatalogRow[], sourceModel: string, missingModel = '방진가대S2소') {
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
    const commQty = new Map([[${JSON.stringify(sourceModel)}, 1]]);
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
    const HOSE_1W = '';
    const HOSE_4W = '';
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
