import { describe, expect, test } from 'vitest';

declare function require(id: string): any;

const {
  coolTop30Input,
  evaluateCase,
  remote360Input,
  runCommercialPrice,
} = require('../../../legacy-quantity-golden/priceParityS3Cases');

describe('#896 슬3 라이브 가격 정합 — order/estimate parity', () => {
  test('360 실내기는 두 앱 모두 라이브 target AR-EH05를 수량 1로 선택한다', () => {
    const input = remote360Input();
    const order = evaluateCase(input, 'order').quantities;
    const estimate = evaluateCase(input, 'estimate').quantities;

    expect(order['AR-EH05'] || 0).toBe(1);
    expect(order['AR-KH05'] || 0).toBe(0);
    expect(order).toEqual(estimate);
  });

  test('냉방전용 상부토출 30HP는 두 앱 모두 라이브 target 방진가대S2중을 수량 1로 선택한다', () => {
    const input = coolTop30Input();
    const order = evaluateCase(input, 'order').quantities;
    const estimate = evaluateCase(input, 'estimate').quantities;

    expect(order['방진가대S2중'] || 0).toBe(1);
    expect(order['방진가대S2대'] || 0).toBe(0);
    expect(order).toEqual(estimate);
  });

  test.each([
    ['AR-EH05', remote360Input, 'order'],
    ['AR-EH05', remote360Input, 'estimate'],
    ['방진가대S2중', coolTop30Input, 'order'],
    ['방진가대S2중', coolTop30Input, 'estimate'],
  ])('카탈로그에 없는 파생 target %s는 조용히 스킵하지 않고 드러낸다', (model, inputFactory, app) => {
    const input = inputFactory();
    input.catalog = {
      ...input.catalog,
      commercial: input.catalog.commercial.filter((row: any) => row.model !== model),
    };

    expect(() => evaluateCase(input, app).quantities).toThrow(new RegExp(model));
  });

  test('라이브 product_db 납품가를 두 앱의 상업 단가 계산이 동일하게 반환한다', () => {
    const prices = ['order', 'estimate'].map((app) => ({
      app,
      remote: runCommercialPrice(app, 'AR-EH05'),
      base: runCommercialPrice(app, '방진가대S2중'),
    }));

    expect(prices).toEqual([
      { app: 'order', remote: 13915, base: 160000 },
      { app: 'estimate', remote: 13915, base: 160000 },
    ]);
  });
});
