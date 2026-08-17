'use strict';

jest.mock('axios', () => {
  const get = jest.fn().mockResolvedValue({
    status: 200,
    data: {
      success: true,
      data: [{
        name: '실외기 6HP 단배관',
        modelCode: 'AJ060MXHNBC1',
        unit: '대',
        deliveryPrice: 1611115,
        releasePrice: 2929300,
        outboundPrice: 2607000,
        estimateCategory: 'HOME_MULTI',
        hasVariableDiscount: true,
      }],
    },
  });
  return { create: jest.fn(() => ({ get })), get };
});

const catalog = require('../lib/db-catalog');

test('홈멀티 변동DC 기준가는 desktop·dc-config와 같은 출고단가를 사용한다', async () => {
  const rows = await catalog.multiCatalog('HOME_MULTI', () => ({ catL: '실외기', catM: '단배관' }));

  expect(rows[0]).toEqual(expect.objectContaining({
    model: 'AJ060MXHNBC1',
    list: 2607000,
  }));
  expect(Math.round(rows[0].list * (1 - 0.48))).toBe(1355640);
});

test('인상 전 단가(단가변동) 옵션이 켜져도 baseline 변동DC 기준가는 outboundPrice를 유지한다', async () => {
  const prices = await catalog.priceIncData();

  for (const usePreChange of [false, true]) {
    const base = prices.home.AJ060MXHNBC1;
    expect({ usePreChange, base, total: Math.round(base * (1 - 0.48)) }).toEqual({
      usePreChange,
      base: 2607000,
      total: 1355640,
    });
  }
});
