'use strict';

const { resolveLegacyPriceVariant } = require('../public/js/legacy-price-toggle');

describe('구형 단가변동 토글 no-op 계약', () => {
  test.each([false, true])('토글 %s 에서 출고가·납품가가 동일하다', (usePreChange) => {
    const item = { price: 167200, sheetPrice: 120000 };
    expect(resolveLegacyPriceVariant(item, usePreChange)).toEqual({
      releasePrice: 167200,
      deliveryPrice: 120000,
    });
  });
});
