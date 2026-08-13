package com.samhanair.logis.inventory.web.dto;

import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.samhanair.logis.inventory.domain.StockBalance;
import com.samhanair.logis.inventory.domain.WarehouseType;
import java.util.List;
import java.util.UUID;

/**
 * 제품 단위 모든 창고 재고 잔량 응답 — Sales Form Polish 슬라이스의 견적/주문 라인 입력
 * 단계에서 영업원이 사용. 잔량이 0인 창고는 DB row 가 없으므로 결과에서 제외 (FE 가
 * dash 표시); 가상창고 (VIRTUAL) 도 포함하되 FE 가 표시 분기.
 *
 * @param productId 제품 UUID
 * @param balances  해당 제품의 모든 활성 stock_balance row (warehouse 정보 포함)
 */
public record ProductBalanceResponse(
        UUID productId,
        List<WarehouseBalance> balances) {

    /**
     * 도메인 StockBalance 리스트로부터 ProductBalanceResponse 를 생성한다.
     *
     * @param productId 제품 UUID (balances 가 빈 리스트여도 응답에 포함하기 위해 별도 인자)
     * @param balances  해당 productId 의 stock_balance 도메인 리스트
     * @return 매핑된 응답
     */
    public static ProductBalanceResponse of(UUID productId, List<StockBalance> balances) {
        return new ProductBalanceResponse(
                productId,
                balances.stream().map(WarehouseBalance::from).toList());
    }

    /**
     * 창고별 잔량 sub-record — Warehouse 메타데이터 (코드/이름/유형) + 잔량 3종을 동봉한다.
     *
     * @param warehouseId   창고 UUID
     * @param warehouseCode 창고 코드 (예: "HQ-001")
     * @param warehouseName 창고 이름 (예: "본사창고")
     * @param warehouseType 창고 유형 (HEADQUARTERS/VEHICLE/CONSIGNMENT/VIRTUAL)
     * @param availableQty  가용 재고
     * @param reservedQty   예약 재고
     * @param totalQty      총 재고
     */
    public record WarehouseBalance(
            @JsonSerialize(using = OpaqueUuidSerializer.class)
            UUID warehouseId,
            String warehouseCode,
            String warehouseName,
            WarehouseType warehouseType,
            int availableQty,
            int reservedQty,
            int totalQty) {

        public static WarehouseBalance from(StockBalance b) {
            return new WarehouseBalance(
                    b.getWarehouse().getId(),
                    b.getWarehouse().getCode(),
                    b.getWarehouse().getName(),
                    b.getWarehouse().getType(),
                    b.getAvailableQty(),
                    b.getReservedQty(),
                    b.getTotalQty());
        }
    }
}
