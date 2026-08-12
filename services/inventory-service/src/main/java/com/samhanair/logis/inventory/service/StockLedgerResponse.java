package com.samhanair.logis.inventory.service;

import java.time.LocalDate;
import java.util.List;

/** 재고수불부 조회 결과 — 헤더와 기간 내 누적 행을 함께 반환한다. */
public record StockLedgerResponse(
        String companyName,
        LocalDate startDate,
        LocalDate endDate,
        String productName,
        String productCode,
        int openingBalance,
        int totalInbound,
        int totalOutbound,
        int closingBalance,
        List<StockLedgerRow> rows) {
}
