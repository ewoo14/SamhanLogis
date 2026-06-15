package com.samhanair.logis.inventory.client;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * product-service 가 반환하는 제품 요약. inventory-service 가 product 도메인을 직접
 * import 하지 않도록 wire-format 의 record 사본을 둔다 (status 는 String 문자열로).
 *
 * <p>2026-05-22 Sprint 3: 안전재고 알림 화면에서 사용자에게 productCode/modelName 표시를
 * 위해 productCode field 추가 — product-service ProductSummaryResponse 와 1:1 정합.
 *
 * <p>2026-05-31 Phase INV-S S1: 개별시리얼 관리 여부({@code serialManaged}) 추가 —
 * product-service {@code categories.serial_managed} 파생. true 이면 {@code stock_instances} 대상,
 * false 이면 기존 {@code stock_lots} 배치 관리 유지.
 *
 * <p>2026-06-15 품목 마스터 등록: 상품 여부({@code goods}) 추가 —
 * product-service {@code Product.goodsType == GOODS} 파생. false 이면 어떤 재고도 생성하지 않는다.
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
        boolean goods) {

    /**
     * Backward-compatible 생성자 — productCode 미지원 호출자 (기존 14 test) 호환.
     * 2026-05-22 Sprint 3 productCode field 추가 후에도 기존 mock 사용처를 변경하지 않도록.
     * serialManaged 기본값 false.
     */
    public ProductSummary(UUID id, String name, String modelName, UUID categoryId,
                          BigDecimal sellingPrice, String status) {
        this(id, name, modelName, null, categoryId, sellingPrice, status, false, true);
    }

    /**
     * Backward-compatible 생성자 — productCode 지원, serialManaged 미지원 호출자 호환.
     * 2026-05-31 Phase INV-S S1 serialManaged field 추가 후에도 기존 mock 사용처를 변경하지 않도록.
     * serialManaged 기본값 false.
     */
    public ProductSummary(UUID id, String name, String modelName, String productCode,
                          UUID categoryId, BigDecimal sellingPrice, String status) {
        this(id, name, modelName, productCode, categoryId, sellingPrice, status, false, true);
    }

    /**
     * Backward-compatible 생성자 — goods 미지원 호출자 호환.
     * 기존 product-service 응답/테스트 mock 은 상품으로 취급한다.
     */
    public ProductSummary(UUID id, String name, String modelName, String productCode,
                          UUID categoryId, BigDecimal sellingPrice, String status,
                          boolean serialManaged) {
        this(id, name, modelName, productCode, categoryId, sellingPrice, status, serialManaged, true);
    }
}
