'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { evaluateLegacyQuantityBoundary } = require('./legacyQuantityBoundary');
const { fixtures, optionFixtures } = require('./fixtures');

const SOURCE_PATH = {
  order: path.resolve(__dirname, '../order-app/index.html'),
  estimate: path.resolve(__dirname, '../estimate-app/views/index.ejs'),
};

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

function inputFor(fixture, app) {
  return { ...fixture, app };
}

function remote360Input() {
  const fixture = optionFixtures.find((item) => item.id === 'C-01-CIRCLE-360');
  if (!fixture) throw new Error('C-01-CIRCLE-360 fixture를 찾을 수 없습니다.');
  return fixture;
}

function coolTop30Input() {
  const fixture = fixtures.find((item) => item.family === 'C-05');
  if (!fixture) throw new Error('C-05 fixture를 찾을 수 없습니다.');
  return {
    ...fixture,
    family: 'C-S3-COOLTOP-30',
    sourceQuantities: { AM030AXVCOOL1: 1 },
    catalog: {
      ...fixture.catalog,
      commercial: [
        ...fixture.catalog.commercial,
        { model: 'AM030AXVCOOL1', name: '실외기 냉방전용 상부토출 (30HP)', unit: 'EA' },
      ],
    },
  };
}

function evaluateCase(fixture, app) {
  return evaluateLegacyQuantityBoundary(inputFor(fixture, app));
}

function runCommercialPrice(app, model) {
  const source = fs.readFileSync(SOURCE_PATH[app], 'utf8');
  const rowByModel = {
    'AR-EH05': { model: 'AR-EH05', name: '무선리모컨(냉난방전용)', price: 13915, list: 25300, useK2: false },
    '방진가대S2중': { model: '방진가대S2중', name: 'S2 방진가대 중', price: 160000, list: 240000, useK2: false },
  };
  const context = {
    COMMULTI: [rowByModel[model]],
    window: { SHOW_I_HOSE: false, DISCOUNT_RATE_COMM: 0 },
    CONFIG: { commDiscount: 0, unitRoundTo: 0, unitRoundMode: 'ROUND' },
    PRICE_CHANGE_SCHEDULE: {},
    COMM_INC: {},
    commCustomPrices: new Map(),
    commCustomListPrices: new Map(),
    document: {
      getElementById(id) {
        if (id === 'due') return { value: '' };
        if (id === 'comm_hose_i') return { checked: false };
        return null;
      },
      querySelector: () => null,
    },
    CSS: { escape: (value) => String(value) },
    getBaseListPrice: (_type, _model, defaultValue) => defaultValue,
    incActive: () => false,
    parseFixedDc: () => null,
    roundByConfig: (value) => value,
  };
  vm.createContext(context);
  vm.runInContext(extractFunctionSource(source, 'commUnitPrice'), context, { filename: SOURCE_PATH[app] });
  return context.commUnitPrice(model);
}

module.exports = {
  coolTop30Input,
  evaluateCase,
  remote360Input,
  runCommercialPrice,
};
