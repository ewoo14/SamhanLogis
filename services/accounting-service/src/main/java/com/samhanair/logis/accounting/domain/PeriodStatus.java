package com.samhanair.logis.accounting.domain;

/**
 * 회계 마감 기간 상태 (P2-4 매출 마감).
 *
 * <pre>
 *   OPEN ↔ CLOSED   (역마감 시 CLOSED → OPEN)
 * </pre>
 *
 * <ul>
 *   <li>{@link #OPEN} — 마감 미시행 (기본값) 또는 역마감 후. 분개/슬립 변경 허용.</li>
 *   <li>{@link #CLOSED} — 마감 완료. {@code AccountingPeriodGuard} 가 분개/슬립 변경 차단.
 *       역마감(MASTER 만)으로 OPEN 복귀 가능.</li>
 * </ul>
 */
public enum PeriodStatus {
    /** 마감 미시행 또는 역마감 후. */
    OPEN("열림"),

    /** 마감 완료 — 변경 차단. */
    CLOSED("마감");

    private final String displayName;

    PeriodStatus(String displayName) {
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
