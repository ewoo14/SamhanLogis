package com.samhanair.logis.inventory.web.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/** 입고 요청 — 새 StockLot 생성 + StockBalance 가산. */
public record InboundRequest(
        @NotNull UUID productId,
        @NotNull UUID warehouseId,
        @Size(max = 50) String lotNo,
        UUID inboundLineId,
        @NotNull @Positive Integer quantity,
        LocalDateTime receivedAt,
        @DecimalMin("0.00") BigDecimal unitCost,
        @Size(max = 500) String note) {

    /** 기존 외부 입고 호출과의 소스 호환용 생성자. */
    public InboundRequest(UUID productId, UUID warehouseId, String lotNo, Integer quantity,
                          LocalDateTime receivedAt, BigDecimal unitCost, String note) {
        this(productId, warehouseId, lotNo, null, quantity, receivedAt, unitCost, note);
    }
}
