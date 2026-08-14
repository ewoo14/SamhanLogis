package com.samhanair.logis.accounting.domain;

/** 일마감 집계 source — 기존 세금계산서와 신규 매출/입고전표를 구분한다. */
public enum DailyClosingSourceKind {
    TAX_INVOICE("세금계산서"),
    SALES_SLIP("출고전표"),
    PURCHASE_SLIP("입고전표");

    private final String displayName;

    DailyClosingSourceKind(String displayName) {
        this.displayName = displayName;
    }

    /**
     * 사용자 노출 메시지에 사용하는 한국어 일마감 원천 라벨.
     *
     * @return 한국어 표시명
     */
    public String getDisplayName() {
        return displayName;
    }
}
