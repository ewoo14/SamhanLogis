package com.samhanair.logis.accounting.domain;

/** 수금계획 상태. */
public enum PlanStatus {
    /** 예정. */
    PLANNED("예정"),
    /** 수금완료. */
    COLLECTED("수금완료"),
    /** 연체. */
    OVERDUE("연체");

    private final String displayName;

    PlanStatus(String displayName) {
        this.displayName = displayName;
    }

    /**
     * 사용자 노출 메시지에 사용하는 한국어 상태 라벨.
     *
     * <p>clients/desktop 의 {@code PLAN_STATUS_LABEL} 과 값이 정합해야 한다(SSOT).
     *
     * @return 한국어 상태 표시명
     */
    public String getDisplayName() {
        return displayName;
    }
}
