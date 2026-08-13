package com.samhanair.logis.inventory.web.dto;

import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.samhanair.logis.inventory.domain.SafetyStockConfig;
import java.util.UUID;

/**
 * 안전재고 임계값 설정 결과 응답 DTO (P1-3).
 *
 * @param id          설정 UUID
 * @param productId   제품 UUID
 * @param warehouseId 창고 opaque token (null = 전체 합산 기준)
 * @param threshold   안전재고 임계값
 * @param note        메모
 */
public record SafetyStockConfigResponse(
        UUID id,
        UUID productId,
        @JsonSerialize(using = OpaqueUuidSerializer.class)
        UUID warehouseId,
        int threshold,
        String note
) {

    /**
     * SafetyStockConfig 엔티티로부터 응답 DTO 를 생성한다.
     *
     * @param config 임계값 설정 엔티티
     * @return SafetyStockConfigResponse 인스턴스
     */
    public static SafetyStockConfigResponse from(SafetyStockConfig config) {
        return new SafetyStockConfigResponse(
                config.getId(),
                config.getProductId(),
                config.getWarehouseId(),
                config.getThreshold(),
                config.getNote()
        );
    }
}
