package com.samhanair.logis.inventory.web.dto;

import com.samhanair.logis.inventory.domain.StockBalance;
import com.samhanair.logis.inventory.domain.Warehouse;
import com.samhanair.logis.inventory.domain.WarehouseType;
import com.samhanair.logis.inventory.client.ProductSummary;

/** (품목, 창고) 단위 재고 잔량 응답. 내부 UUID는 응답에 포함하지 않는다. */
public record StockBalanceResponse(
        String productCode,
        String productName,
        String warehouseCode,
        String warehouseName,
        WarehouseType warehouseType,
        int availableQty,
        int reservedQty,
        int totalQty,
        Long version) {

    public static StockBalanceResponse from(StockBalance b) {
        return from(b, null);
    }

    /**
     * 재고 행과 품목 bulk 조회 결과를 화면 응답으로 조합한다.
     *
     * @param b 재고 잔량 행
     * @param product 품목 메타데이터
     * @return 모델코드·품목명이 포함된 응답
     */
    public static StockBalanceResponse from(StockBalance b, ProductSummary product) {
        return new StockBalanceResponse(
                product == null ? null : product.modelName(),
                product == null ? null : product.name(),
                b.getWarehouse().getCode(),
                b.getWarehouse().getName(),
                b.getWarehouse().getType(),
                b.getAvailableQty(),
                b.getReservedQty(),
                b.getTotalQty(),
                b.getVersion());
    }

    /**
     * 수량 개념이 없는 VIRTUAL 창고의 화면 표시 행을 만든다.
     * 합성 행은 DB에 저장하지 않으며, 프런트가 세 수량을 {@code —}로 렌더링한다.
     *
     * @param warehouse 활성 VIRTUAL 창고
     * @param product 품목 bulk 조회 결과
     * @return 수량 0·version null인 표시 전용 응답
     */
    public static StockBalanceResponse virtual(Warehouse warehouse, ProductSummary product) {
        return new StockBalanceResponse(
                product == null ? null : product.modelName(),
                product == null ? null : product.name(),
                warehouse.getCode(),
                warehouse.getName(),
                WarehouseType.VIRTUAL,
                0,
                0,
                0,
                null);
    }
}
