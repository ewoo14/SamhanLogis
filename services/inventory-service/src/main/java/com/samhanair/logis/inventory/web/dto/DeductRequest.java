package com.samhanair.logis.inventory.web.dto;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.util.UUID;

/**
 * 차감 요청 — FIFO 로 lot 들에서 빼고 balance 도 갱신.
 * {@code fromReservation=true} 면 예약분에서, false 면 가용분에서 차감.
 */
public record DeductRequest(
        @NotNull UUID productId,
        @JsonDeserialize(using = OpaqueUuidDeserializer.class)
        @NotNull UUID warehouseId,
        @NotNull @Positive Integer quantity,
        Boolean fromReservation,
        @Size(max = 30) String referenceType,
        UUID referenceId,
        @Size(max = 500) String note,
        @NotNull(message = "sourceContext 는 필수입니다") SourceOperationContext sourceContext) {

    public DeductRequest(UUID productId, UUID warehouseId, Integer quantity, Boolean fromReservation,
                         String referenceType, UUID referenceId, String note) {
        this(productId, warehouseId, quantity, fromReservation, referenceType, referenceId, note, null);
    }

    public boolean fromReservationOrFalse() {
        return Boolean.TRUE.equals(fromReservation);
    }
}
