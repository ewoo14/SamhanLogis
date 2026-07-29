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

function runRecompute(rows: CatalogRow[], sourceModel: string) {
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
    ${source.includes('function renderCommCatalogWarnings')
      ? extractFunction(source, 'renderCommCatalogWarnings')
      : 'function renderCommCatalogWarnings() {}'}
    recomputeCommDerived();
    globalThis.__result = {
      hidden: warning.hidden,
      textContent: warning.textContent,
      innerHTML: warning.innerHTML,
      missingQuantity: commQty.get('방진가대S2소') || 0,
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

describe('상업멀티 파생 카탈로그 누락 신호', () => {
  it('실 bootstrap fixture에서 파생 모델 1개가 빠지면 모델명을 사용자 신호로 남긴다', () => {
    const fixture = loadBootstrapFixture();
    const bootstrapRows = fixture.rows;
    expect(bootstrapRows).toHaveLength(fixture.source.originalCommercialMultiRows);
    expect(bootstrapRows.some((row) => row.model === 'AM080AXVHHH1')).toBe(true);
    expect(bootstrapRows.some((row) => row.model === '방진가대S2소')).toBe(true);

    const catalogWithoutDerived = bootstrapRows.filter((row) => row.model !== '방진가대S2소');
    expect(catalogWithoutDerived).toHaveLength(fixture.source.afterRemovingDerivedRows);
    const result = runRecompute(catalogWithoutDerived, 'AM080AXVHHH1');

    expect(result.hidden).toBe(false);
    expect(`${result.textContent}${result.innerHTML}`).toContain('방진가대S2소');
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
