package com.samhanair.logis.inventory.service;

import java.util.List;

/** 전표번호와 QR 스캔 목록을 묶은 원자적 mutation 요청. */
public record StockScanRequest(String slipNo, StockScanDirection direction, List<StockScanItem> items) {
}
