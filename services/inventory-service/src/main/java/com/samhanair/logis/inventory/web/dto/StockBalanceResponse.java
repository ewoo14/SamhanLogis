package com.samhanair.logis.inventory.web.dto;

import com.samhanair.logis.inventory.domain.StockBalance;
import com.samhanair.logis.inventory.domain.WarehouseType;
import com.samhanair.logis.inventory.client.ProductSummary;
import java.util.UUID;

/** (product, warehouse) 단위 재고 잔량 응답. UUID는 내부 조인용이며 화면에는 모델코드를 표시한다. */
public record StockBalanceResponse(
        UUID id,
        UUID productId,
        String productCode,
        String productName,
        UUID warehouseId,
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
                b.getId(),
                b.getProductId(),
                product == null ? null : product.modelName(),
                product == null ? null : product.name(),
                b.getWarehouse().getId(),
                b.getWarehouse().getCode(),
                b.getWarehouse().getName(),
                b.getWarehouse().getType(),
                b.getAvailableQty(),
                b.getReservedQty(),
                b.getTotalQty(),
                b.getVersion());
    }
}
