'use strict';

const { resolveLegacyPriceVariant } = require('../public/js/legacy-price-toggle');

describe('구형 변동단가 토글 계약', () => {
  const item = {
    price: 200000,
    sheetPrice: 150000,
    preChangePrice: 167200,
    preChangeSheetPrice: 120000,
  };

  test('체크 해제는 변동 전 단가를 사용한다', () => {
    expect(resolveLegacyPriceVariant(item, false)).toEqual({
      releasePrice: 167200,
      deliveryPrice: 120000,
    });
  });

  test('체크는 변동된 현재 단가를 사용한다', () => {
    expect(resolveLegacyPriceVariant(item, true)).toEqual({
      releasePrice: 200000,
      deliveryPrice: 150000,
    });
  });
});
