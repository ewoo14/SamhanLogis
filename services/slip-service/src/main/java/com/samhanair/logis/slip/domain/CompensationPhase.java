package com.samhanair.logis.slip.domain;

/**
 * 원격 재고 보상이 발생한 전표 처리 단계.
 */
public enum CompensationPhase {
    /** OUTBOUND 수락 중 reserve 보상 단계. */
    ACCEPT_RESERVE,
    /** RETURN/RETURN_TRIP 입고 완료 중 recall 보상 단계. */
    COMPLETE_RECALL
}
