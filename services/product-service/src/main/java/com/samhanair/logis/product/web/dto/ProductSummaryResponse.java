package com.samhanair.logis.product.web.dto;

import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductStatus;
import java.math.BigDecimal;
import java.util.UUID;

/**
 * 목록/조회 batch 용 경량 응답 — 출고가만 노출 (납품가 제외).
 *
 * <p>2026-05-22 Sprint 3: 안전재고 알림 등 사용자 노출 화면이 UUID 대신
 * productCode/modelName 비즈니스 식별자를 표시할 수 있도록 productCode field 추가.
 *
 * <p>Phase INV-S S1: {@code serialManaged} 추가 — inventory-service 가 이 플래그를 읽어
 * 개별시리얼(stock_instances) vs batch(stock_lots) 관리방식을 판정한다.
 * {@link #from(Product)} 매핑에서 {@code p.getCategory().isSerialManaged()} 를 통해 채움.
 * category 는 LAZY 이므로 반드시 트랜잭션 내부에서 호출해야 한다.
 */
public record ProductSummaryResponse(
        UUID id,
        String name,
        String modelName,
        String productCode,
        UUID categoryId,
        BigDecimal sellingPrice,
        ProductStatus status,
        boolean serialManaged) {

    /**
     * Backward-compatible 생성자 — productCode 미지원 기존 test 호환 (serialManaged=false 위임).
     */
    public ProductSummaryResponse(UUID id, String name, String modelName, UUID categoryId,
                                  BigDecimal sellingPrice, ProductStatus status) {
        this(id, name, modelName, null, categoryId, sellingPrice, status, false);
    }

    /**
     * Backward-compatible 생성자 — productCode 있지만 serialManaged 미지원 기존 test 호환.
     */
    public ProductSummaryResponse(UUID id, String name, String modelName, String productCode,
                                  UUID categoryId, BigDecimal sellingPrice, ProductStatus status) {
        this(id, name, modelName, productCode, categoryId, sellingPrice, status, false);
    }

    /**
     * Product 도메인 객체로부터 경량 응답 변환.
     * category LAZY 로딩이 발생하므로 반드시 {@code @Transactional} 내부에서 호출.
     *
     * @param p 활성 Product 엔티티 (soft-delete 필터 적용 후)
     * @return 경량 요약 응답 (serialManaged = category.isSerialManaged())
     */
    public static ProductSummaryResponse from(Product p) {
        return new ProductSummaryResponse(
                p.getId(),
                p.getName(),
                p.getModelName(),
                p.getProductCode(),
                p.getCategory().getId(),
                p.getSellingPrice(),
                p.getStatus(),
                p.getCategory().isSerialManaged());
    }
}
