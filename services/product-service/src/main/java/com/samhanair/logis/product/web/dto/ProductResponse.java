package com.samhanair.logis.product.web.dto;

import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.BundleComponent;
import com.samhanair.logis.product.domain.BundleMode;
import com.samhanair.logis.product.domain.Classification;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.ProductGoodsType;
import com.samhanair.logis.product.domain.ProductStatus;
import com.samhanair.logis.product.domain.UsageScope;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 제품 단건 상세 응답 — BaseEntity 의 audit 시각과 사용자 표시명 + 노출 범위 필드까지 노출.
 * {@code createdBy}/{@code modifiedBy}는 내부 사용자 UUID가 아닌 user-service의 fullName이다.
 *
 * <p>PR-B(2026-06-11) 추가 필드:
 * <ul>
 *   <li>{@code usageScope} — 현재 노출 범위 ({@link UsageScope})</li>
 *   <li>{@code estimateCategory}/{@code displayOrder} — V18 이후 카탈로그 DTO 전용 정보로 이동.
 *       본 상세 DTO 에서는 deprecated 호환 필드로 null 을 반환한다.</li>
 *   <li>{@code usageScopeManual} — 수동 override 여부 (true 면 sync 가 덮어쓰지 않음)</li>
 *   <li>{@code displayOrder} — 시트 노출 순서 (null 이면 정렬 후순위)</li>
 *   <li>{@code modelCode} — 사용자 노출 비즈니스 식별자</li>
 * </ul>
 */
public record ProductResponse(
        @JsonSerialize(using = OpaqueUuidSerializer.class) UUID id,
        String name,
        String modelName,
        String modelCode,
        @JsonSerialize(using = OpaqueUuidSerializer.class) UUID categoryId,
        String categoryName,
        BigDecimal sellingPrice,
        BigDecimal purchasePrice,
        String currency,
        ProductStatus status,
        Map<String, String> tags,
        String description,
        ProductCategory productCategory,
        ClassificationRef catL,
        ClassificationRef catM,
        ClassificationRef catS,
        ProductItemKind itemKind,
        BundleMode bundleMode,
        String parentSetModelCode,
        BundleComponent.ComponentKind componentKind,
        String unit,
        BigDecimal releasePrice,
        BigDecimal deliveryPrice,
        BigDecimal fixedDiscountRate,
        ProductGoodsType goodsType,
        UsageScope usageScope,
        EstimateCategory estimateCategory,
        boolean usageScopeManual,
        Integer displayOrder,
        LocalDateTime createdAt,
        String createdBy,
        LocalDateTime modifiedAt,
        String modifiedBy,
        List<ProductSpecResponse> specs) {

    public static ProductResponse from(Product p) {
        ProductItemKind itemKind = p.getProductType() == com.samhanair.logis.product.domain.ProductType.BUNDLE
                ? ProductItemKind.SET
                : ProductItemKind.GENERAL;
        return from(p, itemKind, null, null);
    }

    public static ProductResponse from(Product p,
                                       ProductItemKind itemKind,
                                       String parentSetModelCode,
                                       BundleComponent.ComponentKind componentKind) {
        return from(p, itemKind, parentSetModelCode, componentKind, List.of());
    }

    public static ProductResponse from(Product p,
                                       ProductItemKind itemKind,
                                       String parentSetModelCode,
                                       BundleComponent.ComponentKind componentKind,
                                       List<ProductSpecResponse> specs) {
        return from(p, itemKind, parentSetModelCode, componentKind, specs,
                displayNameOrNull(p.getCreatedBy()), displayNameOrNull(p.getModifiedBy()));
    }

    public static ProductResponse from(Product p,
                                       ProductItemKind itemKind,
                                       String parentSetModelCode,
                                       BundleComponent.ComponentKind componentKind,
                                       List<ProductSpecResponse> specs,
                                       String createdBy,
                                       String modifiedBy) {
        return new ProductResponse(
                p.getId(),
                p.getName(),
                p.getModelName(),
                p.getModelCode(),
                p.getCategory().getId(),
                p.getCategory().getName(),
                p.getSellingPrice(),
                p.getPurchasePrice(),
                p.getCurrency(),
                p.getStatus(),
                p.getTags(),
                p.getDescription(),
                p.getProductCategory(),
                ClassificationRef.from(p.getCatL()),
                ClassificationRef.from(p.getCatM()),
                ClassificationRef.from(p.getCatS()),
                itemKind,
                p.getBundleMode(),
                parentSetModelCode,
                componentKind,
                p.getUnit(),
                p.getReleasePrice(),
                p.getDeliveryPrice(),
                p.resolveFixedDiscount().rate(),
                p.getGoodsType(),
                p.getUsageScope(),
                null,
                p.isUsageScopeManual(),
                null,
                p.getCreatedAt(),
                createdBy,
                p.getModifiedAt(),
                modifiedBy,
                specs == null ? List.of() : specs);
    }

    private static String displayNameOrNull(String auditValue) {
        if (auditValue == null || auditValue.isBlank()) return null;
        try {
            UUID.fromString(auditValue);
            return null;
        } catch (IllegalArgumentException ignored) {
            return auditValue;
        }
    }

    /** 품목 상세 화면용 분류 참조. */
    public record ClassificationRef(@JsonSerialize(using = OpaqueUuidSerializer.class) UUID id, String name) {
        public static ClassificationRef from(Classification classification) {
            if (classification == null) {
                return null;
            }
            return new ClassificationRef(classification.getId(), classification.getName());
        }
    }
}
