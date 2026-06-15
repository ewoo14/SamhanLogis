package com.samhanair.logis.product.domain;

/**
 * 품목의 재고 생성 대상 여부.
 *
 * <p>{@link #GOODS} 는 실제 재고를 생성하는 상품 품목이고,
 * {@link #NON_GOODS} 는 운임/수수료/설치비처럼 견적·전표 라인에는 쓰되 재고를 만들지 않는 품목이다.
 */
public enum ProductGoodsType {
    /** 재고 생성 대상 상품. */
    GOODS,
    /** 재고를 생성하지 않는 비용/서비스성 품목. */
    NON_GOODS
}
