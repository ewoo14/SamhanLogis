'use strict';

/**
 * 구형 변동단가 표면의 계약.
 * 체크 해제는 2000-01-01 변동 전 단가, 체크는 products 현재 단가를 사용한다.
 */
function resolveLegacyPriceVariant(item, useChangedPrice) {
  const useBaseline = useChangedPrice !== true;
  const release = useBaseline && item?.preChangePrice != null
    ? Number(item.preChangePrice)
    : Number(item?.price);
  const delivery = useBaseline && item?.preChangeSheetPrice != null
    ? Number(item.preChangeSheetPrice)
    : Number(item?.sheetPrice);
  return {
    releasePrice: Number.isFinite(release) ? release : 0,
    deliveryPrice: Number.isFinite(delivery) ? delivery : 0,
  };
}

if (typeof module !== 'undefined') module.exports = { resolveLegacyPriceVariant };
