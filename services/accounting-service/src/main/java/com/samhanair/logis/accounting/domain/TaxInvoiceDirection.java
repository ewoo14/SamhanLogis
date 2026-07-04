package com.samhanair.logis.accounting.domain;

public enum TaxInvoiceDirection {
    /** 우리가 발행하는 매출 측 세금계산서. */
    OUTBOUND("매출(발행)"),
    /** 거래처가 발행하고 우리가 수신하는 매입 측 세금계산서. */
    INBOUND("매입(수신)");

    private final String displayName;

    TaxInvoiceDirection(String displayName) {
        this.displayName = displayName;
    }

    /**
     * 사용자 노출 메시지에 사용하는 한국어 방향 라벨.
     *
     * @return 한국어 방향 표시명
     */
    public String getDisplayName() {
        return displayName;
    }
}
