package com.samhanair.logis.inventory.web.dto;

import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.samhanair.logis.inventory.domain.SafetyStockConfig;
import java.util.UUID;

/**
 * 안전재고 임계 미만 제품 알림 응답 DTO (P1-3).
 *
 * <p>UUID 사용자 비공개 가드 — productId / warehouseId 는 내부 식별자이며
 * FE 는 productCode / productName / warehouseName 비즈니스 식별자를 우선 표시.
 * 본 DTO 는 관리자(MASTER/MANAGER/INVENTORY) 화면 전용이므로 UUID 노출은 허용
 * (사용자 비공개 가드는 일반 사용자 대면 화면에만 적용).
 *
 * <p>2026-05-22 Sprint 3 — 사용자 보고 "제품코드와 제품명도 없는데 알림 노출" fix:
 * productCode / productName / warehouseName 3 field 추가. SafetyStockService 가
 * ProductClient batch lookup + WarehouseRepository 로 비즈니스 라벨을 채운다.
 *
 * @param productId     제품 UUID
 * @param productCode   제품 코드 (예: AJ040RXH4BC1) — 사용자 노출용. null 가능 (제품 미동기)
 * @param productName     모델명 — 사용자 노출용. null 가능
 * @param warehouseId   창고 opaque token (null = 전체 창고 합산 기준)
 * @param warehouseName 창고명 — 사용자 노출용. warehouseId == null 일 때 "전체" 표기
 * @param threshold     안전재고 임계값
 * @param currentQty    현재 가용 재고 수량 (availableQty 합계)
 * @param shortage      부족량 (threshold - currentQty, 양수이면 부족)
 * @param note          임계값 설정 메모
 */
public record SafetyStockAlertResponse(
        UUID productId,
        String productCode,
        String productName,
        @JsonSerialize(using = OpaqueUuidSerializer.class)
        UUID warehouseId,
        String warehouseName,
        int threshold,
        int currentQty,
        int shortage,
        String note
) {

    /**
     * SafetyStockConfig + 현재 재고 + 비즈니스 라벨을 조합하여 응답 DTO 를 생성한다.
     *
     * @param config        임계값 설정 엔티티
     * @param productCode   제품 코드 (없으면 null)
     * @param productName     모델명 (없으면 null)
     * @param warehouseName 창고명 (warehouseId == null 일 때 "전체")
     * @param currentQty    현재 가용 재고 수량
     * @return SafetyStockAlertResponse 인스턴스
     */
    public static SafetyStockAlertResponse of(SafetyStockConfig config,
                                              String productCode,
                                              String productName,
                                              String warehouseName,
                                              int currentQty) {
        return new SafetyStockAlertResponse(
                config.getProductId(),
                productCode,
                productName,
                config.getWarehouseId(),
                warehouseName,
                config.getThreshold(),
                currentQty,
                config.getThreshold() - currentQty,
                config.getNote()
        );
    }
}
