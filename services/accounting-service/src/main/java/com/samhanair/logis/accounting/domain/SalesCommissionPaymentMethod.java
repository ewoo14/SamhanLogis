package com.samhanair.logis.accounting.domain;

/** 영업수수료 정산의 결제방식. 카드결제일 때만 카드수수료를 공제한다. */
public enum SalesCommissionPaymentMethod {
    /** 총 결제금액의 카드수수료를 공제하는 방식. */
    CARD,
    /** 카드수수료를 공제하지 않는 현금결제 방식. */
    CASH
}
