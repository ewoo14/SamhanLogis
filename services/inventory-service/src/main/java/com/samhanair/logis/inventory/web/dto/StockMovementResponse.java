package com.samhanair.logis.inventory.web.dto;

import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.samhanair.logis.inventory.domain.MovementType;
import com.samhanair.logis.inventory.domain.StockMovement;
import java.time.LocalDateTime;
import java.util.UUID;

/** 재고 이동 감사 로그 응답. */
public record StockMovementResponse(
        UUID id,
        UUID lotId,
        UUID productId,
        @JsonSerialize(using = OpaqueUuidSerializer.class)
        UUID warehouseId,
        MovementType movementType,
        int quantityDelta,
        String referenceType,
        UUID referenceId,
        String note,
        LocalDateTime occurredAt,
        String actorUserId) {

    public static StockMovementResponse from(StockMovement m) {
        return new StockMovementResponse(
                m.getId(),
                m.getLotId(),
                m.getProductId(),
                m.getWarehouseId(),
                m.getMovementType(),
                m.getQuantityDelta(),
                m.getReferenceType(),
                m.getReferenceId(),
                m.getNote(),
                m.getOccurredAt(),
                m.getActorUserId());
    }
}
