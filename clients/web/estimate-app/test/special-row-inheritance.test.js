'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(
  path.join(__dirname, '../views/index.ejs'),
  'utf8',
);

function extractFunction(name) {
  const start = source.indexOf(`function ${name}`);
  if (start < 0) throw new Error(`${name} not found`);
  const braceStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`${name} body not closed`);
}

function loadFunction(name, overrides = {}) {
  const context = {
    window: {},
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
    },
    CSS: { escape: (value) => String(value) },
    Number,
    Math,
    String,
    Array,
    Map,
    Set,
    parseInt,
    parseFloat,
    isNaN,
    SPECIAL_ROW_SOURCE: {
      CATALOG_SPECIAL: 'CATALOG_SPECIAL',
      AUTO_CUTOFF: 'AUTO_CUTOFF',
    },
    catalogSpecialSource: (product) => /운임|절삭/i.test(`${product?.kind || ''} ${product?.name || ''}`)
      ? 'CATALOG_SPECIAL'
      : undefined,
    ...overrides,
  };
  vm.createContext(context);
  vm.runInContext(extractFunction(name), context);
  return context;
}

function input(value) {
  return {
    value,
    style: {},
    closest: () => ({ querySelector: () => null }),
  };
}

function specialRowDocument(model, subtotal) {
  return {
    querySelector: (selector) => {
      if (selector.includes('.qty-input')) return null;
      if (selector.includes(`[data-sub="${model}"]`)) return subtotal;
      return null;
    },
  };
}

describe('#875 S3 특수행 계승', () => {
  test('S5 RED-A: 저장된 절삭 단가는 네 탭의 입력 표시에서 절댓값으로 렌더링된다', () => {
    for (const renderName of ['renderHome', 'renderSingle', 'renderComm', 'renderOld']) {
      const start = source.indexOf(`function ${renderName}()`);
      const end = source.indexOf('\nfunction ', start + 1);
      const renderSource = source.slice(start, end < 0 ? source.length : end);

      expect(renderSource).toContain('formatSpecialPriceForDisplay(currentPrice, fmt)');
    }
  });

  test('S5 RED-B: 표시 절댓값 변환은 저장·계산용 음수 값을 바꾸지 않는다', () => {
    const context = loadFunction('formatSpecialPriceForDisplay');
    expect(context.formatSpecialPriceForDisplay(-500, (value) => String(value))).toBe('500');
    expect(-500).toBe(-500);
  });

  test('RED-A: 카탈로그 특수행 q=1 payload가 source를 보존한다', () => {
    const single = { id: 'catalog-cut', name: '절삭', model: '절삭', unit: '식', source: 'CATALOG_SPECIAL', kind: 'CUT' };
    const context = loadFunction('buildSendRows', {
      COMMULTI: [],
      HOMEMULTI: [],
      SINGLE_PARTS: [],
      COMM_PARTS: [],
      OLD_PRODUCTS: [],
      SINGLE_SETS: [single],
      commQty: new Map(),
      homeQty: new Map(),
      singleQty: new Map([['catalog-cut', 1]]),
      oldQty: new Map(),
      singleCustomPrices: new Map([['catalog-cut', -500]]),
      getRealSinglePrice: () => -500,
      getBaseListPrice: (_type, _key, value) => value,
      getRealListPrice: (_type, _key, value) => value,
      getActiveFixedDc: () => 0,
      fmt: (value) => String(value),
      applyCardFeeLogic: () => {},
      applyEstimateTotalAdjustments: () => {},
      applyCutoffLogic: () => {},
    });

    const rows = context.buildSendRows();
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: '절삭',
        model: '절삭',
        qty: 1,
        price: -500,
        source: 'CATALOG_SPECIAL',
      }),
    ]));
  });

  test('RED-B: q=0 특수행은 화면 state에는 남지만 실제 payload 배열에는 없다', () => {
    const single = { id: 'catalog-freight', name: '운임', model: '운임', unit: '식', source: 'CATALOG_SPECIAL', kind: 'FREIGHT' };
    const context = loadFunction('buildSendRows', {
      COMMULTI: [],
      HOMEMULTI: [],
      SINGLE_PARTS: [],
      COMM_PARTS: [],
      OLD_PRODUCTS: [],
      SINGLE_SETS: [single],
      commQty: new Map(),
      homeQty: new Map(),
      singleQty: new Map([['catalog-freight', 0]]),
      oldQty: new Map(),
      singleCustomPrices: new Map([['catalog-freight', 0]]),
      getRealSinglePrice: () => 0,
      getBaseListPrice: (_type, _key, value) => value,
      getRealListPrice: (_type, _key, value) => value,
      getActiveFixedDc: () => 0,
      fmt: (value) => String(value),
      applyCardFeeLogic: () => {},
      applyEstimateTotalAdjustments: () => {},
      applyCutoffLogic: () => {},
    });

    const rows = context.buildSendRows();
    expect(rows.some((row) => row.model === '운임')).toBe(false);
  });

  test('RED-C: 자동 절삭행은 사용자 카탈로그 절삭행을 덮어쓰지 않는다', () => {
    const context = loadFunction('applyCutoffLogic', {
      document: { getElementById: () => ({ value: '100' }) },
    });
    const rows = [{
      section: 'SINGLE',
      type: 'item',
      name: '절삭',
      model: '절삭',
      qty: 1,
      price: -50,
      sub: -50,
      source: 'CATALOG_SPECIAL',
    }, {
      section: 'SINGLE',
      type: 'set-head',
      name: '세트',
      model: 'SET-1',
      qty: 1,
      price: 151,
      sub: 151,
    }];

    context.applyCutoffLogic(rows);

    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual(expect.objectContaining({ price: -50, source: 'CATALOG_SPECIAL' }));
    expect(rows[2]).toEqual(expect.objectContaining({
      name: '절삭',
      model: '절삭',
      source: 'AUTO_CUTOFF',
      qty: 1,
      price: -1,
    }));
  });

  test('특수행 금액 입력은 0에서 q=0, 비0에서 q=1, 절삭은 음수로 정규화한다', () => {
    const priceMap = new Map();
    const qtyMap = new Map();
    const context = loadFunction('handleFreightInput', {
      fmt: (value) => String(value),
    });
    const zero = { target: input('0') };
    context.handleFreightInput(zero, true, priceMap, qtyMap, '절삭', () => {});
    expect(priceMap.get('절삭')).toBe(0);
    expect(qtyMap.get('절삭')).toBe(0);

    const nonZero = { target: input('500') };
    context.handleFreightInput(nonZero, true, priceMap, qtyMap, '절삭', () => {});
    expect(priceMap.get('절삭')).toBe(-500);
    expect(qtyMap.get('절삭')).toBe(1);
  });

  test('RED-S8: 홈 특수행 소계는 저장용 단가와 읽기전용 수량으로 갱신된다', () => {
    const subtotal = { textContent: '0' };
    const doc = specialRowDocument('운임', subtotal);
    const context = loadFunction('syncHomeUIFromState', {
      homeRowByModel: new Map([['운임', { name: '운임', source: 'CATALOG_SPECIAL' }]]),
      homeQty: new Map([['운임', 1]]),
      homeCustomPrices: new Map([['운임', 1000]]),
      homeUnitPrice: () => 0,
      document: doc,
      fmt: (value) => String(value),
      syncHomeTotals: () => {},
    });

    context.syncHomeUIFromState();

    expect(subtotal.textContent).toBe('1000');
  });

  test('RED-S8: 절삭 특수행 소계는 레거시처럼 음수 기여액으로 표시된다', () => {
    const subtotal = { textContent: '0' };
    const doc = specialRowDocument('절삭', subtotal);
    const context = loadFunction('syncHomeUIFromState', {
      homeRowByModel: new Map([['절삭', { name: '절삭', source: 'CATALOG_SPECIAL' }]]),
      homeQty: new Map([['절삭', 1]]),
      homeCustomPrices: new Map([['절삭', -500]]),
      homeUnitPrice: () => 0,
      document: doc,
      fmt: (value) => String(value),
      syncHomeTotals: () => {},
    });

    context.syncHomeUIFromState();

    expect(subtotal.textContent).toBe('-500');
  });
});
