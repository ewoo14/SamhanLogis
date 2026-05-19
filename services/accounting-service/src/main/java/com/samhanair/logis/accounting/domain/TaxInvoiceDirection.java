package com.samhanair.logis.accounting.domain;

public enum TaxInvoiceDirection {
    /** 우리가 발행하는 매출 측 세금계산서. */
    OUTBOUND,
    /** 거래처가 발행하고 우리가 수신하는 매입 측 세금계산서. */
    INBOUND
}
