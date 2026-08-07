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
        String productCode,
        UUID categoryId,
        BigDecimal sellingPrice,
        String status,
        boolean serialManaged,
        String modelCode,
        String productType,
        String categoryKey,
        String bundleMode,
        BigDecimal fixedDiscountRate,
        String specification) {

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
        this(id, name, modelName, null, categoryId, sellingPrice, status, false, null, null, null, null, null, null);
    }

    /**
     * 기존 테스트/호출자 호환 생성자 — productCode 미제공 시 null 로 유지한다.
     *
     * @param id            제품 UUID
     * @param name          제품명
     * @param modelName     모델명
     * @param categoryId    카테고리 UUID
     * @param sellingPrice  판매가
     * @param status        제품 상태
     * @param serialManaged 시리얼 관리 여부
     */
    public ProductSummary(UUID id, String name, String modelName, UUID categoryId,
                          BigDecimal sellingPrice, String status, boolean serialManaged) {
        this(id, name, modelName, null, categoryId, sellingPrice, status, serialManaged, null, null, null, null, null, null);
    }

    /**
     * serialManaged 미제공 호출자 호환 생성자.
     *
     * @param id           제품 UUID
     * @param name         제품명
     * @param modelName    모델명
     * @param productCode  이카운트 품목코드
     * @param categoryId   카테고리 UUID
     * @param sellingPrice 판매가
     * @param status       제품 상태
     */
    public ProductSummary(UUID id, String name, String modelName, String productCode,
                          UUID categoryId, BigDecimal sellingPrice, String status) {
        this(id, name, modelName, productCode, categoryId, sellingPrice, status, false, null, null, null, null, null, null);
    }

    /**
     * 호환 생성자 — 구 8-arg 정규 생성자(modelCode/productType 미지원 기존 호출자/테스트).
     */
    public ProductSummary(UUID id, String name, String modelName, String productCode,
                          UUID categoryId, BigDecimal sellingPrice, String status, boolean serialManaged) {
        this(id, name, modelName, productCode, categoryId, sellingPrice, status, serialManaged, null, null, null, null, null, null);
    }

    /** categoryKey 추가 전 정규 생성자 호환용. */
    public ProductSummary(UUID id, String name, String modelName, String productCode,
                          UUID categoryId, BigDecimal sellingPrice, String status,
                          boolean serialManaged, String modelCode, String productType) {
        this(id, name, modelName, productCode, categoryId, sellingPrice, status,
                serialManaged, modelCode, productType, null, null, null, null);
    }

    /** categoryKey 까지만 포함한 기존 정규 생성자 호환용. */
    public ProductSummary(UUID id, String name, String modelName, String productCode,
                          UUID categoryId, BigDecimal sellingPrice, String status,
                          boolean serialManaged, String modelCode, String productType,
                          String categoryKey) {
        this(id, name, modelName, productCode, categoryId, sellingPrice, status,
                serialManaged, modelCode, productType, categoryKey, null, null, null);
    }

    /** bundleMode 추가 전 규격 출처 생성자 호환용. */
    public ProductSummary(UUID id, String name, String modelName, String productCode,
                          UUID categoryId, BigDecimal sellingPrice, String status,
                          boolean serialManaged, String modelCode, String productType,
                          String categoryKey, BigDecimal fixedDiscountRate, String specification) {
        this(id, name, modelName, productCode, categoryId, sellingPrice, status,
                serialManaged, modelCode, productType, categoryKey, null,
                fixedDiscountRate, specification);
    }

    /** bundleMode 를 포함하는 product-service 내부 조회 응답용 생성자. */
    public ProductSummary(UUID id, String name, String modelName, String productCode,
                          UUID categoryId, BigDecimal sellingPrice, String status,
                          boolean serialManaged, String modelCode, String productType,
                          String categoryKey, String bundleMode) {
        this(id, name, modelName, productCode, categoryId, sellingPrice, status,
                serialManaged, modelCode, productType, categoryKey, bundleMode, null, null);
    }
}
