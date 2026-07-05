package com.samhanair.logis.accounting.domain;

/** 일마감 집계 종류 — 매출/매입 snapshot 분리. */
public enum DailyClosingKind {
    SALES("매출 마감"),
    PURCHASE("매입 마감");

    private final String displayName;

    DailyClosingKind(String displayName) {
        this.displayName = displayName;
    }

    /**
     * 사용자 노출 메시지에 사용하는 한국어 일마감 종류 라벨.
     *
     * @return 한국어 표시명
     */
    public String getDisplayName() {
        return displayName;
    }
}
