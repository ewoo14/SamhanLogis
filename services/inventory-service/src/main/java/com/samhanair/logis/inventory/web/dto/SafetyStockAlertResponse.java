package com.samhanair.logis.inventory.web.dto;

import com.samhanair.logis.inventory.domain.SafetyStockConfig;
import java.util.UUID;

/**
 * 안전재고 임계 미만 제품 알림 응답 DTO (P1-3).
 *
 * <p>UUID 사용자 비공개 가드 — productId / warehouseId 는 내부 식별자이며
 * FE 는 productCode / warehouseCode 를 우선 표시해야 한다.
 * 본 DTO 는 관리자(MASTER/MANAGER/INVENTORY) 화면 전용이므로 UUID 노출은 허용
 * (사용자 비공개 가드는 일반 사용자 대면 화면에만 적용).
 *
 * @param productId     제품 UUID
 * @param warehouseId   창고 UUID (null = 전체 창고 합산 기준)
 * @param threshold     안전재고 임계값
 * @param currentQty    현재 가용 재고 수량 (availableQty 합계)
 * @param shortage      부족량 (threshold - currentQty, 양수이면 부족)
 * @param note          임계값 설정 메모
 */
public record SafetyStockAlertResponse(
        UUID productId,
        UUID warehouseId,
        int threshold,
        int currentQty,
        int shortage,
        String note
) {

    /**
     * SafetyStockConfig 와 현재 재고 수량을 조합하여 응답 DTO 를 생성한다.
     *
     * @param config     임계값 설정 엔티티
     * @param currentQty 현재 가용 재고 수량
     * @return SafetyStockAlertResponse 인스턴스
     */
    public static SafetyStockAlertResponse of(SafetyStockConfig config, int currentQty) {
        return new SafetyStockAlertResponse(
                config.getProductId(),
                config.getWarehouseId(),
                config.getThreshold(),
                currentQty,
                config.getThreshold() - currentQty,
                config.getNote()
        );
    }
}
