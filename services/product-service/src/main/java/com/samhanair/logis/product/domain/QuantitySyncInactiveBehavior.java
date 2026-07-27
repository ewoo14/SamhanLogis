package com.samhanair.logis.product.domain;

/** 조건이 비활성일 때 target 수량 처리 방식. */
public enum QuantitySyncInactiveBehavior {
    ZERO,
    KEEP
}
