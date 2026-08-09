package com.samhanair.logis.inventory.domain;

/** 정방향 재고 호출의 관측 결과. NO_OP도 정상 호출의 감사 결과로 보존한다. */
public enum SourceOperationOutcome {
    APPLIED,
    NO_OP_EXISTING,
    NO_OP_EXCLUDED
}
