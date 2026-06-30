import { describe, expect, it } from 'vitest';

declare const process: { cwd: () => string };
declare function require(id: string): any;

const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');

function readOrderAppHtml(): string {
  return readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
}

function extractFunction(src: string, name: string): string {
  const re = new RegExp(`function\\s+${name}\\s*\\(`, 'g');
  const match = re.exec(src);
  if (!match) throw new Error(`${name} function not found`);

  let i = match.index + match[0].length;
  let depthParen = 1;
  while (i < src.length && depthParen > 0) {
    if (src[i] === '(') depthParen += 1;
    else if (src[i] === ')') depthParen -= 1;
    i += 1;
  }
  while (i < src.length && src[i] !== '{') i += 1;

  let depth = 0;
  for (; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(match.index, i + 1);
    }
  }
  throw new Error(`${name} function body not found`);
}

function loadRuntime(due: string, schedule: Record<string, string>) {
  const html = readOrderAppHtml();
  const context = {
    window: {
      SHOW_I_HOSE: false,
      DISCOUNT_RATE_HOME: 0,
      DISCOUNT_RATE_COMM: 0,
    },
    document: {
      getElementById(id: string) {
        if (id === 'due') return { value: due };
        return null;
      },
    },
    CONFIG: {
      homeDiscount: 0,
      commDiscount: 0,
      unitRoundTo: 0,
      unitRoundMode: 'ROUND',
    },
    PRICE_CHANGE_SCHEDULE: schedule,
    HOME_INC: { HM1: 1000 },
    COMM_INC: { CM1: 2000 },
    SINGLE_INC: { SS1: 3000 },
    SINGLE_PARTS_INC: { SP1: 4000 },
    homeRowByModel: new Map([
      ['HM1', { model: 'HM1', name: '홈', price: 1100, list: 1100, useK2: false }],
    ]),
    COMMULTI: [
      { model: 'CM1', name: '상업', price: 2100, list: 2100, useK2: false },
    ],
  };
  vm.createContext(context);
  const snippets = [
    'roundK',
    'roundByConfig',
    'parseFixedDc',
    'priceFrom',
    'incActive',
    'homeUnitPrice',
    'commUnitPrice',
    'partUnitPrice',
    'singleUnitPrice',
    'setBasePriceRightFirst',
  ].map((name) => extractFunction(html, name));
  vm.runInContext(snippets.join('\n'), context);
  return context as typeof context & {
    homeUnitPrice: (model: string) => number;
    commUnitPrice: (model: string) => number;
    partUnitPrice: (part: Record<string, unknown>) => number;
    singleUnitPrice: (item: Record<string, unknown>) => number;
    setBasePriceRightFirst: (item: Record<string, unknown>) => number;
  };
}

describe('order-app price change schedule', () => {
  it('모델 B: due가 카테고리 변동일 전이면 INC 인상전 단가를 사용한다', () => {
    const runtime = loadRuntime('2026-11-30', {
      homemulti: '2026-12-01',
      commercialMulti: '2026-12-01',
      singleSets: '2026-12-01',
    });

    expect(runtime.homeUnitPrice('HM1')).toBe(1000);
    expect(runtime.commUnitPrice('CM1')).toBe(2000);
    expect(runtime.singleUnitPrice({ model: 'SS1', name: '싱글', priceRaw: 3100 })).toBe(3000);
    expect(runtime.partUnitPrice({ model: 'SP1', name: '판넬', price: 4100 })).toBe(4000);
    expect(runtime.setBasePriceRightFirst({ model: 'SS1', name: '싱글', price: 3100 })).toBe(3000);
  });

  it('모델 B: due가 카테고리 변동일 이상이면 base 인상후 단가를 사용한다', () => {
    const runtime = loadRuntime('2026-12-01', {
      homemulti: '2026-12-01',
      commercialMulti: '2026-12-01',
      singleSets: '2026-12-01',
    });

    expect(runtime.homeUnitPrice('HM1')).toBe(1100);
    expect(runtime.commUnitPrice('CM1')).toBe(2100);
    expect(runtime.singleUnitPrice({ model: 'SS1', name: '싱글', priceRaw: 3100 })).toBe(3100);
    expect(runtime.partUnitPrice({ model: 'SP1', name: '판넬', price: 4100 })).toBe(4100);
    expect(runtime.setBasePriceRightFirst({ model: 'SS1', name: '싱글', price: 3100 })).toBe(3100);
  });

  it('schedule 키가 없으면 변동 없음으로 보고 항상 base 인상후 단가를 사용한다', () => {
    const runtime = loadRuntime('2026-11-30', {});

    expect(runtime.homeUnitPrice('HM1')).toBe(1100);
    expect(runtime.commUnitPrice('CM1')).toBe(2100);
    expect(runtime.singleUnitPrice({ model: 'SS1', name: '싱글', priceRaw: 3100 })).toBe(3100);
    expect(runtime.partUnitPrice({ model: 'SP1', name: '판넬', price: 4100 })).toBe(4100);
  });
});
