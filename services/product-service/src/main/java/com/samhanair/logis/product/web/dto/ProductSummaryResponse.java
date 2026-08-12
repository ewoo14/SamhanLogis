package com.samhanair.logis.product.web.dto;

import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.ProductGoodsType;
import com.samhanair.logis.product.domain.ProductStatus;
import com.samhanair.logis.product.domain.ProductEstimateExposure;
import com.samhanair.logis.product.domain.UsageScope;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import java.math.BigDecimal;
import java.util.List;
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
 * 품목 검색 모달의 규격 열을 채우기 위해 {@code specification} 도 함께 반환한다.
 */
public record ProductSummaryResponse(
        @JsonSerialize(using = OpaqueUuidSerializer.class) UUID id,
        String name,
        String modelName,
        String productCode,
        @JsonSerialize(using = OpaqueUuidSerializer.class) UUID categoryId,
        BigDecimal sellingPrice,
        ProductStatus status,
        boolean serialManaged,
        boolean goods,
        String modelCode,
        String productType,
        String bundleMode,
        UsageScope usageScope,
        EstimateCategory estimateCategory,
        boolean usageScopeManual,
        Integer displayOrder,
        String categoryKey,
        BigDecimal fixedDiscountRate,
        String discountFlags,
        BigDecimal releasePrice,
        BigDecimal deliveryPrice,
        Boolean hasVariableDiscount,
        String parentSetModelCode,
        String specification,
        List<EstimateCategory> estimateCategories,
        ProductCategory productCategory,
        String fixedDiscountSource,
        String physicalCategoryCode,
        String discountOption,
        @JsonIgnore boolean classificationAssigned) {

    /** fixedDiscountSource 추가 전 canonical 호출 호환 생성자. */
    public ProductSummaryResponse(UUID id, String name, String modelName, String productCode,
                                  UUID categoryId, BigDecimal sellingPrice, ProductStatus status,
                                  boolean serialManaged, boolean goods, String modelCode, String productType,
                                  String bundleMode, UsageScope usageScope, EstimateCategory estimateCategory,
                                  boolean usageScopeManual, Integer displayOrder, String categoryKey,
                                  BigDecimal fixedDiscountRate, String discountFlags,
                                  BigDecimal releasePrice, BigDecimal deliveryPrice,
                                  Boolean hasVariableDiscount, String parentSetModelCode,
                                  String specification, List<EstimateCategory> estimateCategories,
                                  ProductCategory productCategory) {
        this(id, name, modelName, productCode, categoryId, sellingPrice, status, serialManaged, goods,
                modelCode, productType, bundleMode, usageScope, estimateCategory, usageScopeManual, displayOrder,
                categoryKey, fixedDiscountRate, discountFlags, releasePrice, deliveryPrice,
                hasVariableDiscount, parentSetModelCode, specification, estimateCategories, productCategory, null, null, null, false);
    }

    /** parentSetModelCode 추가 전 canonical 호출 호환 생성자. */
    public ProductSummaryResponse(UUID id, String name, String modelName, String productCode,
                                  UUID categoryId, BigDecimal sellingPrice, ProductStatus status,
                                  boolean serialManaged, boolean goods, String modelCode, String productType,
                                  UsageScope usageScope, EstimateCategory estimateCategory,
                                  boolean usageScopeManual, Integer displayOrder, String categoryKey,
                                  BigDecimal fixedDiscountRate, String discountFlags,
                                  BigDecimal releasePrice, BigDecimal deliveryPrice,
                                  Boolean hasVariableDiscount) {
        this(id, name, modelName, productCode, categoryId, sellingPrice, status, serialManaged, goods,
                modelCode, productType, null, usageScope, estimateCategory, usageScopeManual, displayOrder,
                categoryKey, fixedDiscountRate, discountFlags, releasePrice, deliveryPrice,
                hasVariableDiscount, null, null, null, null, null, null, null, false);
    }

    /**
     * Backward-compatible 생성자 — categoryKey 추가 전 canonical 호출 호환.
     */
    public ProductSummaryResponse(UUID id, String name, String modelName, String productCode,
                                  UUID categoryId, BigDecimal sellingPrice, ProductStatus status,
                                  boolean serialManaged, boolean goods, String modelCode, String productType,
                                  UsageScope usageScope, EstimateCategory estimateCategory,
                                  boolean usageScopeManual, Integer displayOrder) {
        this(id, name, modelName, productCode, categoryId, sellingPrice, status, serialManaged, goods,
                modelCode, productType, null, usageScope, estimateCategory, usageScopeManual, displayOrder,
                null, null, null, null, null, null, null, null, null, null, null, null, null, false);
    }

    /**
     * Backward-compatible 생성자 — productCode 미지원 기존 test 호환 (serialManaged=false 위임).
     */
    public ProductSummaryResponse(UUID id, String name, String modelName, UUID categoryId,
                                  BigDecimal sellingPrice, ProductStatus status) {
        this(id, name, modelName, (String) null, categoryId, sellingPrice, status);
    }

    /**
     * Backward-compatible 생성자 — productCode 있지만 serialManaged 미지원 기존 test 호환.
     */
    public ProductSummaryResponse(UUID id, String name, String modelName, String productCode,
                                  UUID categoryId, BigDecimal sellingPrice, ProductStatus status) {
        this(id, name, modelName, productCode, categoryId, sellingPrice, status, false);
    }

    /**
     * Backward-compatible 생성자 — modelCode/productType 미지원 기존 호출자 호환.
     */
    public ProductSummaryResponse(UUID id, String name, String modelName, String productCode,
                                  UUID categoryId, BigDecimal sellingPrice, ProductStatus status,
                                  boolean serialManaged) {
        this(id, name, modelName, productCode, categoryId, sellingPrice, status, serialManaged, true, null, null,
                null, null, null, false, null, null, null, null, null, null, null, null, null, null, null);
    }

    /**
     * Backward-compatible 생성자 — goods 미지원 기존 호출자 호환.
     */
    public ProductSummaryResponse(UUID id, String name, String modelName, String productCode,
                                  UUID categoryId, BigDecimal sellingPrice, ProductStatus status,
                                  boolean serialManaged, String modelCode, String productType) {
        this(id, name, modelName, productCode, categoryId, sellingPrice, status, serialManaged, true,
                modelCode, productType, null, null, null, false, null, null, null, null, null, null, null, null, null, null, null);
    }

    /**
     * Backward-compatible 생성자 — usageScope 미지원 기존 호출자 호환.
     */
    public ProductSummaryResponse(UUID id, String name, String modelName, String productCode,
                                  UUID categoryId, BigDecimal sellingPrice, ProductStatus status,
                                  boolean serialManaged, boolean goods, String modelCode, String productType) {
        this(id, name, modelName, productCode, categoryId, sellingPrice, status, serialManaged, goods,
                modelCode, productType, null, null, null, false, null, null, null, null, null, null, null, null, null, null, null);
    }

    /**
     * Product 도메인 객체로부터 경량 응답 변환.
     * category LAZY 로딩이 발생하므로 반드시 {@code @Transactional} 내부에서 호출.
     *
     * @param p 활성 Product 엔티티 (soft-delete 필터 적용 후)
     * @return 경량 요약 응답 (serialManaged = category.isSerialManaged())
     */
    public static ProductSummaryResponse from(Product p) {
        return from(p, List.of());
    }

    /** Product 검색 페이지의 활성 견적 노출을 벌크 조회 결과로 주입한다. */
    public static ProductSummaryResponse from(Product p, List<ProductEstimateExposure> exposures) {
        Product.FixedDiscountResolution fixedDiscount = p.resolveFixedDiscount();
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
                p.getModelCode() == null || p.getModelCode().isBlank() ? p.getModelName() : p.getModelCode(),
                p.getProductType() == null ? null : p.getProductType().name(),
                p.getBundleMode() == null ? null : p.getBundleMode().name(),
                p.getUsageScope(),
                null,
                p.isUsageScopeManual(),
                null,
                categoryKey(p),
                fixedDiscount == null ? null : fixedDiscount.rate(),
                p.getDiscountFlags(),
                p.getReleasePrice(),
                p.getDeliveryPrice(),
                p.getHasVariableDiscount(),
                null,
                p.getSpecification(),
                exposures == null ? List.of() : exposures.stream()
                        .map(ProductEstimateExposure::getEstimateCategory)
                        .distinct()
                        .toList(),
                p.getProductCategory(),
                fixedDiscount == null || fixedDiscount.source() == null
                        ? null : fixedDiscount.source().name(),
                p.getCategory() == null ? null : p.getCategory().getCode(),
                p.getDiscountOption() == null ? null : p.getDiscountOption().name(),
                p.getCatL() != null || p.getCatM() != null || p.getCatS() != null);
    }

    /** 내부 소비자가 구성품의 레거시 세트 매칭명을 함께 보존할 때 사용하는 변환. */
    public static ProductSummaryResponse from(Product p, String parentSetModelCode) {
        ProductSummaryResponse base = from(p);
        return new ProductSummaryResponse(
                base.id(), base.name(), base.modelName(), base.productCode(), base.categoryId(),
                base.sellingPrice(), base.status(), base.serialManaged(), base.goods(), base.modelCode(),
                base.productType(), base.bundleMode(), base.usageScope(), base.estimateCategory(), base.usageScopeManual(),
                base.displayOrder(), base.categoryKey(), base.fixedDiscountRate(), base.discountFlags(),
                base.releasePrice(), base.deliveryPrice(), base.hasVariableDiscount(), parentSetModelCode,
                base.specification(), base.estimateCategories(), base.productCategory(), base.fixedDiscountSource(),
                base.physicalCategoryCode(), base.discountOption(), base.classificationAssigned());
    }

    /** 검색 응답의 레거시 goods boolean을 견적 라인 계약인 goodsType으로 노출한다. */
    @JsonProperty("goodsType")
    public ProductGoodsType goodsType() {
        return goods ? ProductGoodsType.GOODS : ProductGoodsType.NON_GOODS;
    }

    /**
     * 사용자 노출 품목코드. 사용자 계약상 노출값은 Product의 모델명이다.
     * 순번코드 alias 조회는 {@link com.samhanair.logis.product.service.ProductService}가 담당한다.
     *
     * @param p 품목
     * @return 모델명
     */
    private static String exposedProductCode(Product p) {
        return p.getModelName();
    }

    private static String categoryKey(Product p) {
        ProductCategory productCategory = p.getProductCategory();
        if (productCategory == null) {
            return categoryKeyFromPhysicalCategory(p.getCategory());
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

    /**
     * native ECOUNT/HVAC 적재처럼 product_category 없이 category_id만 채워진 품목의
     * 레거시 화면용 카테고리 키를 물리 카테고리에서 파생한다.
     * 명시적인 product_category가 있으면 위의 시트 분류를 우선한다.
     */
    private static String categoryKeyFromPhysicalCategory(com.samhanair.logis.product.domain.Category category) {
        if (category == null || category.getCode() == null) {
            return null;
        }
        return switch (category.getCode()) {
            case "INDOOR_WALL" -> "homemulti";
            case "OUTDOOR", "INDOOR_CEILING" -> "commercialMulti";
            default -> null;
        };
    }
}
