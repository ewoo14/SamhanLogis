package com.samhanair.logis.partnerorder.client;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * product-service 가 반환하는 제품 요약. partner-order-service 가 product 도메인을 직접 import 하지
 * 않도록 wire-format 의 record 사본을 둔다 (status 는 String 문자열로).
 *
 * <p>inventory-service 의 동일 record 와 형태 동일.
 */
public record ProductSummary(
        UUID id,
        String name,
        String modelName,
        UUID categoryId,
        BigDecimal sellingPrice,
        String status) {
}
