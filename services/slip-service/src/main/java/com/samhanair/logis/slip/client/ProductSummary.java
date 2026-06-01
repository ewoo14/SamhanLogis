package com.samhanair.logis.slip.client;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * product-service 가 반환하는 제품 요약. slip-service 가 product 도메인을 직접 import 하지
 * 않도록 wire-format 의 record 사본을 둔다 (status 는 String 문자열로).
 *
 * <p>S2 입고 연동: {@code serialManaged} 로 INBOUND complete 시 인스턴스 경로와 기존 lot 경로를
 * 분기한다. product-service 의 {@code ProductSummaryResponse.serialManaged} 와 wire-format 을 맞춘다.
 */
public record ProductSummary(
        UUID id,
        String name,
        String modelName,
        UUID categoryId,
        BigDecimal sellingPrice,
        String status,
        boolean serialManaged) {

    /**
     * 기존 테스트/호출자 호환 생성자 — serialManaged 미제공 시 batch 품목(false)으로 간주한다.
     *
     * @param id           제품 UUID
     * @param name         제품명
     * @param modelName    모델명
     * @param categoryId   카테고리 UUID
     * @param sellingPrice 판매가
     * @param status       제품 상태
     */
    public ProductSummary(UUID id, String name, String modelName, UUID categoryId,
                          BigDecimal sellingPrice, String status) {
        this(id, name, modelName, categoryId, sellingPrice, status, false);
    }
}
