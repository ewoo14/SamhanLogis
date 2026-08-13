package com.samhanair.logis.inventory.web.dto;

import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.samhanair.logis.inventory.domain.StockLot;
import com.samhanair.logis.inventory.domain.StockLotStatus;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/** 재고 로트 단건 응답. */
public record StockLotResponse(
        UUID id,
        UUID productId,
        @JsonSerialize(using = OpaqueUuidSerializer.class)
        UUID warehouseId,
        String warehouseCode,
        String lotNo,
        int quantity,
        int initialQuantity,
        LocalDateTime receivedAt,
        BigDecimal unitCost,
        StockLotStatus status,
        UUID sourceTransferId,
        LocalDateTime createdAt,
        String createdBy) {

    public static StockLotResponse from(StockLot lot) {
        return new StockLotResponse(
                lot.getId(),
                lot.getProductId(),
                lot.getWarehouse().getId(),
                lot.getWarehouse().getCode(),
                lot.getLotNo(),
                lot.getQuantity(),
                lot.getInitialQuantity(),
                lot.getReceivedAt(),
                lot.getUnitCost(),
                lot.getStatus(),
                lot.getSourceTransferId(),
                lot.getCreatedAt(),
                lot.getCreatedBy());
    }
}
