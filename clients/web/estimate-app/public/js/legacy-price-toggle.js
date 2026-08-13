'use strict';

/**
 * 구형 단가변동 표면의 계약. 결정 B에서는 토글 상태와 무관하게
 * 현재 출고가/납품가를 사용한다(금액 no-op).
 */
function resolveLegacyPriceVariant(item, _usePreChange) {
  return {
    releasePrice: Number(item?.price) || 0,
    deliveryPrice: Number(item?.sheetPrice) || 0,
  };
}

if (typeof module !== 'undefined') module.exports = { resolveLegacyPriceVariant };
