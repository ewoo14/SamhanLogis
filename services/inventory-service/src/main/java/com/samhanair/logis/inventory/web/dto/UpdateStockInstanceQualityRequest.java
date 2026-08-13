package com.samhanair.logis.inventory.web.dto;

import com.samhanair.logis.inventory.domain.StockInstanceQuality;
import jakarta.validation.constraints.NotNull;

/** 출고 전 인스턴스 품목 상태 변경 요청. */
public record UpdateStockInstanceQualityRequest(@NotNull StockInstanceQuality quality) {
}
