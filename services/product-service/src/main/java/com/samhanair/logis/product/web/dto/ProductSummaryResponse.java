package com.samhanair.logis.product.web.dto;

import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.ProductGoodsType;
import com.samhanair.logis.product.domain.ProductStatus;
import com.samhanair.logis.product.domain.UsageScope;
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
 *
 * <p>PR-B(2026-06-11) 추가 필드: usageScope/estimateCategory/usageScopeManual/displayOrder.
 * V18 이후 estimateCategory/displayOrder 는 카탈로그 DTO 전용 다중 노출 정보로 이동했으므로
 * 본 요약 DTO 의 deprecated 호환 필드는 null 을 반환한다.
 */
public record ProductSummaryResponse(
        UUID id,
        String name,
        String modelName,
        String productCode,
        UUID categoryId,
        BigDecimal sellingPrice,
        ProductStatus status,
        boolean serialManaged,
        boolean goods,
        String modelCode,
        String productType,
        UsageScope usageScope,
        EstimateCategory estimateCategory,
        boolean usageScopeManual,
        Integer displayOrder,
        String categoryKey,
        BigDecimal fixedDiscountRate,
        String discountFlags,
        BigDecimal releasePrice,
        BigDecimal deliveryPrice,
        Boolean hasVariableDiscount) {

    /**
     * Backward-compatible 생성자 — categoryKey 추가 전 canonical 호출 호환.
     */
    public ProductSummaryResponse(UUID id, String name, String modelName, String productCode,
                                  UUID categoryId, BigDecimal sellingPrice, ProductStatus status,
                                  boolean serialManaged, boolean goods, String modelCode, String productType,
                                  UsageScope usageScope, EstimateCategory estimateCategory,
                                  boolean usageScopeManual, Integer displayOrder) {
        this(id, name, modelName, productCode, categoryId, sellingPrice, status, serialManaged, goods,
                modelCode, productType, usageScope, estimateCategory, usageScopeManual, displayOrder,
                null, null, null, null, null, null);
    }

    /**
     * Backward-compatible 생성자 — productCode 미지원 기존 test 호환 (serialManaged=false 위임).
     */
    public ProductSummaryResponse(UUID id, String name, String modelName, UUID categoryId,
                                  BigDecimal sellingPrice, ProductStatus status) {
        this(id, name, modelName, null, categoryId, sellingPrice, status, false, true, null, null,
                null, null, false, null, null, null, null, null, null, null);
    }

    /**
     * Backward-compatible 생성자 — productCode 있지만 serialManaged 미지원 기존 test 호환.
     */
    public ProductSummaryResponse(UUID id, String name, String modelName, String productCode,
                                  UUID categoryId, BigDecimal sellingPrice, ProductStatus status) {
        this(id, name, modelName, productCode, categoryId, sellingPrice, status, false, true, null, null,
                null, null, false, null, null, null, null, null, null, null);
    }

    /**
     * Backward-compatible 생성자 — modelCode/productType 미지원 기존 호출자 호환.
     */
    public ProductSummaryResponse(UUID id, String name, String modelName, String productCode,
                                  UUID categoryId, BigDecimal sellingPrice, ProductStatus status,
                                  boolean serialManaged) {
        this(id, name, modelName, productCode, categoryId, sellingPrice, status, serialManaged, true, null, null,
                null, null, false, null, null, null, null, null, null, null);
    }

    /**
     * Backward-compatible 생성자 — goods 미지원 기존 호출자 호환.
     */
    public ProductSummaryResponse(UUID id, String name, String modelName, String productCode,
                                  UUID categoryId, BigDecimal sellingPrice, ProductStatus status,
                                  boolean serialManaged, String modelCode, String productType) {
        this(id, name, modelName, productCode, categoryId, sellingPrice, status, serialManaged, true,
                modelCode, productType, null, null, false, null, null, null, null, null, null, null);
    }

    /**
     * Backward-compatible 생성자 — usageScope 미지원 기존 호출자 호환.
     */
    public ProductSummaryResponse(UUID id, String name, String modelName, String productCode,
                                  UUID categoryId, BigDecimal sellingPrice, ProductStatus status,
                                  boolean serialManaged, boolean goods, String modelCode, String productType) {
        this(id, name, modelName, productCode, categoryId, sellingPrice, status, serialManaged, goods,
                modelCode, productType, null, null, false, null, null, null, null, null, null, null);
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
                exposedProductCode(p),
                p.getCategory().getId(),
                p.getSellingPrice(),
                p.getStatus(),
                p.getCategory().isSerialManaged(),
                p.getGoodsType() == ProductGoodsType.GOODS,
                p.getModelCode(),
                p.getProductType() == null ? null : p.getProductType().name(),
                p.getUsageScope(),
                null,
                p.isUsageScopeManual(),
                null,
                categoryKey(p.getProductCategory()),
                p.getFixedDiscountRate(),
                p.getDiscountFlags(),
                p.getReleasePrice(),
                p.getDeliveryPrice(),
                p.getHasVariableDiscount());
    }

    /**
     * 사용자 노출 품목코드. 모델코드가 있으면 모델코드를 사용하고, 모델코드가 없는 기존 품목은
     * 순번코드를 fallback으로 유지해 화면·전표 조회에서 고아가 되지 않도록 한다.
     *
     * @param p 품목
     * @return 모델코드 우선 노출 코드, 없으면 기존 순번코드
     */
    private static String exposedProductCode(Product p) {
        if (p.getModelCode() != null && !p.getModelCode().isBlank()) {
            return p.getModelCode();
        }
        return p.getProductCode();
    }

    private static String categoryKey(ProductCategory productCategory) {
        if (productCategory == null) {
            return null;
        }
        return switch (productCategory) {
            case HOME_MULTI -> "homemulti";
            case SINGLE_SET -> "singleSets";
            case SINGLE_PART -> "singleParts";
            case COMMERCIAL_MULTI -> "commercialMulti";
            case COMMERCIAL_PART -> "commercialParts";
            case OLD -> "oldProducts";
            case MATERIAL -> "singleMatPrices";
        };
    }
}
