package com.samhanair.logis.inventory.service;

/** 전표 귀속 시리얼 스캔의 재고 방향. */
public enum StockScanDirection {
    /** 입고 전표에 개체를 귀속한다. */
    INBOUND,
    /** 출고 전표로 개체를 출고한다. */
    OUTBOUND
}
