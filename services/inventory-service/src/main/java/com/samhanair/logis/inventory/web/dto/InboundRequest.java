package com.samhanair.logis.inventory.web.dto;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
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
        @JsonDeserialize(using = OpaqueUuidDeserializer.class)
        @NotNull UUID warehouseId,
        @Size(max = 50) String lotNo,
        UUID inboundLineId,
        @NotNull @Positive Integer quantity,
        LocalDateTime receivedAt,
        @DecimalMin("0.00") BigDecimal unitCost,
        @Size(max = 500) String note,
        @NotNull(message = "sourceContext 는 필수입니다") SourceOperationContext sourceContext) {

    /** source journal 없는 구형 직접 호출을 위한 생성자 — 서비스 경계에서 거부된다. */
    public InboundRequest(UUID productId, UUID warehouseId, String lotNo, Integer quantity,
                          LocalDateTime receivedAt, BigDecimal unitCost, String note) {
        this(productId, warehouseId, lotNo, null, quantity, receivedAt, unitCost, note);
    }

    public InboundRequest(UUID productId, UUID warehouseId, String lotNo, UUID inboundLineId,
                          Integer quantity, LocalDateTime receivedAt, BigDecimal unitCost, String note) {
        this(productId, warehouseId, lotNo, inboundLineId, quantity, receivedAt, unitCost, note, null);
    }
}
