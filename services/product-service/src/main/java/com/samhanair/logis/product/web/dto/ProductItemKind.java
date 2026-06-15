package com.samhanair.logis.product.web.dto;

/**
 * 품목 등록 화면의 요청 전용 3구분.
 *
 * <p>DB에는 저장하지 않고 {@code productType} 및 {@code BundleComponent} 링크로 변환한다.
 */
public enum ProductItemKind {
    /** 일반 단일 품목. */
    GENERAL,
    /** 세트 부모 품목. */
    SET,
    /** 세트에 속한 구성품. */
    SET_COMPONENT
}
