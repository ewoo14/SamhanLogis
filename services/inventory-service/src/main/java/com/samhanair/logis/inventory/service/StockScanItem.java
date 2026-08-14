package com.samhanair.logis.inventory.service;

/** QR 한 건의 사용자 입력 — UUID 없이 노출용 시리얼키와 품목코드만 받는다. */
public record StockScanItem(String serialKey, String productCode) {
}
