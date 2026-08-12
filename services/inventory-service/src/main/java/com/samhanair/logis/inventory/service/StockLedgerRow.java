package com.samhanair.logis.inventory.service;

import java.time.LocalDate;

/** 품목 단위 재고수불부의 사용자 표시 행. 내부 식별자는 포함하지 않는다. */
public record StockLedgerRow(
        LocalDate date,
        String productName,
        String productCode,
        String warehouseName,
        String partnerName,
        String description,
        String locationTag,
        int inboundQuantity,
        int outboundQuantity,
        int balance,
        boolean opening,
        String slipNo,
        String slipType) {

    public StockLedgerRow(LocalDate date, String productName, String productCode,
                          String warehouseName, String partnerName, String description,
                          String locationTag, int inboundQuantity, int outboundQuantity,
                          int balance, boolean opening) {
        this(date, productName, productCode, warehouseName, partnerName, description,
                locationTag, inboundQuantity, outboundQuantity, balance, opening, null, null);
    }
}
