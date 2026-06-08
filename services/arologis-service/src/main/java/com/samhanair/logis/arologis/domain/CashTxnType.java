package com.samhanair.logis.arologis.domain;

/**
 * 아로로지스 간이 현금 거래 유형.
 *
 * <p>단식부기 입출금 구분이다. 수입은 잔액을 증가시키고 지출은 잔액을 감소시킨다.
 */
public enum CashTxnType {

    /** 수입 (현금 유입). */
    INCOME,

    /** 지출 (현금 유출). */
    EXPENSE
}
