package com.samhanair.logis.inventory.web.dto;

import com.samhanair.logis.inventory.domain.StockInstance;
import com.samhanair.logis.inventory.domain.StockInstanceQuality;
import com.samhanair.logis.inventory.domain.StockInstanceStatus;

/** 품목리스트 화면 전용 응답. 내부 UUID는 절대 포함하지 않는다. */
public record StockInstanceListResponse(
        String serialKey,
        String warehouseCode,
        String warehouseName,
        StockInstanceStatus status,
        StockInstanceQuality quality) {

    public static StockInstanceListResponse from(StockInstance instance, String warehouseCode,
                                                  String warehouseName) {
        return new StockInstanceListResponse(instance.getSerialKey(),
                warehouseCode, warehouseName, instance.getStatus(), instance.getQuality());
    }
}
