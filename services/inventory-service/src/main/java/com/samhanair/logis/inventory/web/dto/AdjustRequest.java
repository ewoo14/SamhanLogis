package com.samhanair.logis.inventory.web.dto;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

/** 재고 조정 요청 — delta 부호 있는 정수 (양수=가산, 음수=감산). 사유 필수. */
public record AdjustRequest(
        @NotNull UUID productId,
        @JsonDeserialize(using = OpaqueUuidDeserializer.class)
        @NotNull UUID warehouseId,
        @NotNull Integer quantityDelta,
        @NotNull @Size(min = 1, max = 500) String reason) {
}
