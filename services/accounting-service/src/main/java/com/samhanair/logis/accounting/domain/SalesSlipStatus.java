package com.samhanair.logis.accounting.domain;

public enum SalesSlipStatus {
    /** 작성 중 — 자유 수정. */
    DRAFT("임시저장"),
    /** 확정 — 회계 분개 확정. DailyClosing 미잠금일 때만 VOIDED 가능. */
    POSTED("반영완료"),
    /** 무효화. */
    VOIDED("무효");

    private final String displayName;

    SalesSlipStatus(String displayName) {
        this.displayName = displayName;
    }

    /**
     * 사용자 노출 메시지에 사용하는 한국어 상태 라벨.
     *
     * @return 한국어 상태 표시명
     */
    public String getDisplayName() {
        return displayName;
    }
}
