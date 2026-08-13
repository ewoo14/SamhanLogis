package com.samhanair.logis.inventory.web.dto;

import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import java.util.List;
import java.util.UUID;

/** deduct / adjust 결과 응답 — 영향받은 lot 들과 갱신된 잔량. */
public record DeductionResponse(
        UUID productId,
        @JsonSerialize(using = OpaqueUuidSerializer.class)
        UUID warehouseId,
        int requestedQuantity,
        int deductedQuantity,
        int availableQty,
        int reservedQty,
        int totalQty,
        List<DeductedLotEntry> affectedLots) {

    /** 차감 분배 내역 — lotId 와 차감량 한 쌍. */
    public record DeductedLotEntry(UUID lotId, int amount) {
    }
}
