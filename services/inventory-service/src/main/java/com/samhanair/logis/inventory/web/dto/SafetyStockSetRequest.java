package com.samhanair.logis.inventory.web.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

/**
 * 안전재고 임계값 설정/갱신 요청 DTO (P1-3).
 *
 * @param warehouseId 대상 창고 UUID (null = 전체 창고 합산 기준)
 * @param threshold   안전재고 임계값 (0 이상)
 * @param note        메모 (선택)
 */
public record SafetyStockSetRequest(
        UUID warehouseId,
        @NotNull @Min(0) Integer threshold,
        String note
) {
}
