package com.samhanair.logis.inventory.web.dto;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.util.UUID;

/** 가용 재고 → 예약 재고 이동 요청. */
public record ReserveRequest(
        @NotNull UUID productId,
        @JsonDeserialize(using = OpaqueUuidDeserializer.class)
        @NotNull UUID warehouseId,
        @NotNull @Positive Integer quantity,
        @Size(max = 30) String referenceType,
        UUID referenceId,
        @Size(max = 500) String note) {
}
