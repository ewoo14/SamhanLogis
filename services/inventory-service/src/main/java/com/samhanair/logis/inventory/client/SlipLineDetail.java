package com.samhanair.logis.inventory.client;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * slip-service 가 반환하는 입고 슬립 라인 요약.
 * inventory-service 가 slip 도메인을 직접 import 하지 않도록 wire-format 의 record 사본.
 *
 * @param id        SlipLine UUID
 * @param productId 제품 UUID
 * @param productName 제품명 snapshot
 * @param modelName 모델명 snapshot
 * @param quantity  수량 (슬립 수량 = 검수 기준 expectedQty)
 * @param unitPrice 단가 (입고 원가 기준)
 */
public record SlipLineDetail(
        UUID id,
        UUID productId,
        String productName,
        String modelName,
        int quantity,
        BigDecimal unitPrice
) {
}
