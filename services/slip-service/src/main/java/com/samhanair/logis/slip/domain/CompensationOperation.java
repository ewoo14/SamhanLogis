package com.samhanair.logis.slip.domain;

/**
 * 실패한 원격 재고 보상 동작.
 */
public enum CompensationOperation {
    /** batch 예약 해제. */
    RELEASE,
    /** 시리얼 예약 인스턴스 해제. */
    RELEASE_INSTANCES,
    /** 시리얼 회수 인스턴스 원복. */
    UNRECALL_INSTANCES
}
