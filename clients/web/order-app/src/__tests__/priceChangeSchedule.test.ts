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
    COMM_PARTS_INC: { 'COMM-PART-1': 76000 },
    SINGLE_DEFAULTS: { '자재 포함 여부': '미포함' },
    homeRowByModel: new Map([
      ['HM1', { model: 'HM1', name: '홈', price: 1100, list: 1100, useK2: false }],
    ]),
    SINGLE_PARTS: [
      { setModel: 'SS1', model: 'SP1', name: '싱글 구성품', qty: 2, unit: 'EA', price: 4100, kind: 'ETC' },
    ],
    COMMULTI: [
      { model: 'CM1', name: '상업', price: 2100, list: 2100, useK2: false },
    ],
    COMM_PARTS: [
      { setModel: 'CM1', model: 'COMM-PART-1', name: '상업 구성품', qty: 2, unit: 'EA', price: 88000 },
      { setModel: 'CM1', model: 'COMM-PART-MISSING', name: '상업 구성품 결측', qty: 1, unit: 'EA', price: 99000 },
    ],
    el: () => null,
    getBasePanelRow: () => null,
    pickPanelRow: () => null,
    getDefaultRemoteRows: () => [],
    getOptionRemoteRow: () => null,
    allowRemoteChange_: () => false,
    isFoot: () => false,
    isHideMat: () => false,
    isPanel: () => false,
    isRemote: () => false,
    isMaterial: () => false,
    classifySingleSetFixed: () => null,
    isIndoorUnitPart: () => false,
    isOutdoorUnitPart: () => false,
    splitIndoorOutdoorToK: () => ({ indoor: 0, outdoor: 0, remain: 0 }),
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
    'partsForSetStrict_',
    'explodeSetParts',
    'normKey',
    'commPartUnitPrice',
    'partsForCommSet_',
    'explodeCommPreviewParts',
    'explodeCommSets_',
  ].map((name) => extractFunction(html, name));
  vm.runInContext(snippets.join('\n'), context);
  return context as typeof context & {
    homeUnitPrice: (model: string) => number;
    commUnitPrice: (model: string) => number;
    partUnitPrice: (part: Record<string, unknown>) => number;
    singleUnitPrice: (item: Record<string, unknown>) => number;
    setBasePriceRightFirst: (item: Record<string, unknown>) => number;
    explodeSetParts: (
      setRow: Record<string, string | number>,
      setQty: number,
      setUnitOverride: number | null,
    ) => Array<Record<string, number | string>>;
    commPartUnitPrice: (model: string, basePrice: number) => number;
    explodeCommPreviewParts: (setModel: string, setQty: number) => Array<Record<string, number | string>>;
    explodeCommSets_: (setRow: Record<string, string>, setQty: number) => Array<Record<string, number | string>>;
  };
}

describe('order-app price change schedule', () => {
  it('레거시 규칙: due가 변동일 전이면 base 단가를 사용한다', () => {
    const runtime = loadRuntime('2026-11-30', {
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

  it('레거시 규칙: due가 정확히 변동일이면 INC 단가를 사용한다', () => {
    const runtime = loadRuntime('2026-12-01', {
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

  it('레거시 규칙: due가 변동일 후여도 INC 단가를 사용한다', () => {
    const runtime = loadRuntime('2026-12-02', {
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

  it('schedule 키가 없으면 변동 없음으로 보고 항상 base 인상후 단가를 사용한다', () => {
    const runtime = loadRuntime('2026-11-30', {});

    expect(runtime.homeUnitPrice('HM1')).toBe(1100);
    expect(runtime.commUnitPrice('CM1')).toBe(2100);
    expect(runtime.singleUnitPrice({ model: 'SS1', name: '싱글', priceRaw: 3100 })).toBe(3100);
    expect(runtime.partUnitPrice({ model: 'SP1', name: '판넬', price: 4100 })).toBe(4100);
    // FE-LOW4 (#688 S3 R1 리뷰) — 5함수 완전성: 위 4개 함수와 동일하게 setBasePriceRightFirst 도
    // schedule 키 없음 분기에서 base 인상후 단가를 사용하는지 검증한다.
    expect(runtime.setBasePriceRightFirst({ model: 'SS1', name: '싱글', price: 3100 })).toBe(3100);
  });

  it('모델 B (QA-5): schedule 이 유효해도 due가 빈 문자열이면 incActive의 !due 분기로 base 인상후 단가를 사용한다', () => {
    // due='' 는 incActive(categoryKey, due) 의 `if (!effectiveDate || !due) return false;` 중
    // `!due` 단축분기로 곧장 false 를 반환해야 한다 — schedule 자체는 유효(homemulti 등 3개 키
    // 모두 존재)하므로, effectiveDate 부재(테스트 3)와는 다른 경로로 동일하게 base(인상후)에
    // 도달하는지 검증한다.
    const runtime = loadRuntime('', {
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

  it('상업 구성품은 due가 commercialMulti 변동일 전이면 base 단가를 사용한다', () => {
    const runtime = loadRuntime('2026-11-30', {
      commercialMulti: '2026-12-01',
    });

    expect(runtime.explodeCommPreviewParts('CM1', 1)[0]!.price).toBe(88000);
    expect(runtime.explodeCommSets_({ model: 'CM1' }, 1)[0]!.price).toBe(88000);
  });

  it('상업 SET 전송 폭파 수량은 세트 수량과 구성품 기본 수량을 곱한다', () => {
    const runtime = loadRuntime('2026-12-01', {
      commercialMulti: '2026-12-01',
    });

    expect(runtime.explodeCommPreviewParts('CM1', 3)[0]!.qty).toBe(6);
    expect(runtime.explodeCommSets_({ model: 'CM1' }, 3)[0]!.qty).toBe(6);
  });

  it('싱글 SET 전송 폭파 수량은 세트 수량과 구성품 기본 수량을 곱한다', () => {
    const runtime = loadRuntime('2026-12-01', {
      singleSets: '2026-12-01',
    });

    expect(runtime.explodeSetParts({ model: 'SS1', price: 3000 }, 3, null)[0]!.qty).toBe(6);
  });

  it('상업 구성품은 due가 commercialMulti 변동일이면 COMM_PARTS_INC 단가를 사용한다', () => {
    const runtime = loadRuntime('2026-12-01', {
      commercialMulti: '2026-12-01',
    });

    expect(runtime.explodeCommPreviewParts('CM1', 1)[0]!.price).toBe(76000);
    expect(runtime.explodeCommSets_({ model: 'CM1' }, 1)[0]!.price).toBe(76000);
  });

  it('상업 구성품은 COMM_PARTS_INC가 없으면 변동일 전에도 base 인상후 단가로 fallthrough 한다', () => {
    const runtime = loadRuntime('2026-11-30', {
      commercialMulti: '2026-12-01',
    });

    expect(runtime.explodeCommPreviewParts('CM1', 1)[1]!.price).toBe(99000);
    expect(runtime.explodeCommSets_({ model: 'CM1' }, 1)[1]!.price).toBe(99000);
  });

  it('commPartUnitPrice 공유 헬퍼: 변동일 전=base / 경계일=INC / INC 결측=base (렌더·재동기화 경로 단일화 보증)', () => {
    const before = loadRuntime('2026-11-30', { commercialMulti: '2026-12-01' });
    expect(before.commPartUnitPrice('COMM-PART-1', 88000)).toBe(88000);
    expect(before.commPartUnitPrice('COMM-PART-MISSING', 99000)).toBe(99000);

    const after = loadRuntime('2026-12-01', { commercialMulti: '2026-12-01' });
    expect(after.commPartUnitPrice('COMM-PART-1', 88000)).toBe(76000);
  });
});
