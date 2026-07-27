package com.samhanair.logis.product.domain;

/** 동일 target에 여러 규칙이 기여할 때의 충돌 정책. */
public enum QuantitySyncConflictPolicy {
    ADD,
    REPLACE
}
