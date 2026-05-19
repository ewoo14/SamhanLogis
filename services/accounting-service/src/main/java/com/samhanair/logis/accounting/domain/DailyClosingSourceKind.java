package com.samhanair.logis.accounting.domain;

/** 일마감 집계 source — 기존 세금계산서와 신규 매출/매입전표를 구분한다. */
public enum DailyClosingSourceKind {
    TAX_INVOICE,
    SALES_SLIP,
    PURCHASE_SLIP
}
