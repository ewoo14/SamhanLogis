package com.samhanair.logis.partnerorder.client;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * product-service 가 반환하는 제품 요약. partner-order-service 가 product 도메인을 직접 import 하지
 * 않도록 wire-format 의 record 사본을 둔다 (status 는 String 문자열로).
 *
 * <p>inventory-service 의 동일 record 와 형태 동일.
 *
 * <p>Round C #23(세트 재고 가드): {@code productType} 추가 — product-service 의
 * {@code ProductSummaryResponse.productType}("SINGLE"/"BUNDLE") wire-format 을 맞춘다.
 * 주문 상세 라인 응답에 BUNDLE 여부를 전사하여 FE 재고조회 모달(2.6d)이 세트 라인을
 * 재고조회 대상에서 제외하도록 한다. 신규 DB 컬럼 없이 조회 시점 enrich 전용.
 */
public record ProductSummary(
        UUID id,
        String name,
        String modelName,
        UUID categoryId,
        BigDecimal sellingPrice,
        String status,
        String modelCode,
        String productType,
        String categoryKey,
        BigDecimal fixedDiscountRate,
        String discountFlags) {

    /**
     * 구 6-arg 호환 생성자 — productType 미제공 기존 호출자/테스트(productType=null).
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
        this(id, name, modelName, categoryId, sellingPrice, status, null, null, null, null, null);
    }

    /**
     * 구 7-arg 호환 생성자 — modelCode 미제공 기존 호출자/테스트(modelCode=null).
     *
     * @param id           제품 UUID
     * @param name         제품명
     * @param modelName    모델명
     * @param categoryId   카테고리 UUID
     * @param sellingPrice 판매가
     * @param status       제품 상태
     * @param productType  품목 유형
     */
    public ProductSummary(UUID id, String name, String modelName, UUID categoryId,
                          BigDecimal sellingPrice, String status, String productType) {
        this(id, name, modelName, categoryId, sellingPrice, status, null, productType, null, null, null);
    }

    /**
     * 구 8-arg 호환 생성자 — categoryKey 미제공 기존 호출자/테스트(categoryKey=null).
     *
     * @param id           제품 UUID
     * @param name         제품명
     * @param modelName    모델명
     * @param categoryId   카테고리 UUID
     * @param sellingPrice 판매가
     * @param status       제품 상태
     * @param modelCode    사용자 노출 모델코드
     * @param productType  품목 유형
     */
    public ProductSummary(UUID id, String name, String modelName, UUID categoryId,
                          BigDecimal sellingPrice, String status, String modelCode,
                          String productType) {
        this(id, name, modelName, categoryId, sellingPrice, status, modelCode, productType, null, null, null);
    }

    /** 구 9-arg 호환 생성자 — categoryKey 를 포함한 기존 wire-format. */
    public ProductSummary(UUID id, String name, String modelName, UUID categoryId,
                          BigDecimal sellingPrice, String status, String modelCode,
                          String productType, String categoryKey) {
        this(id, name, modelName, categoryId, sellingPrice, status,
                modelCode, productType, categoryKey, null, null);
    }
}
