package com.samhanair.logis.inventory.service;

import java.util.List;

/** 성공한 전표 귀속 스캔 결과 — 사용자 식별자는 slipNo·serialKey·productCode만 포함한다. */
public record StockScanResponse(String slipNo, StockScanDirection direction, List<StockScanItem> items) {
}
