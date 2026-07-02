package com.samhanair.logis.accounting.domain;

/** 입금보고서 상태. */
public enum CashReceiptStatus {
    /** 수기 작성 중. */
    DRAFT,
    /** 확정됨. S2에서 분개 생성 배선 대상. */
    CONFIRMED,
    /** 취소됨. S2에서 역분개 배선 대상. */
    CANCELLED
}
