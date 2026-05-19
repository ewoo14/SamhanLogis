package com.samhanair.logis.accounting.domain;

public enum SalesSlipStatus {
    /** 작성 중 — 자유 수정. */
    DRAFT,
    /** 확정 — 회계 분개 확정. DailyClosing 미잠금일 때만 VOIDED 가능. */
    POSTED,
    /** 무효화. */
    VOIDED
}
