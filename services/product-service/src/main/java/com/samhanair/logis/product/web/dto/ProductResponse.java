package com.samhanair.logis.product.web.dto;

import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.BundleComponent;
import com.samhanair.logis.product.domain.BundleMode;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.ProductGoodsType;
import com.samhanair.logis.product.domain.ProductStatus;
import com.samhanair.logis.product.domain.UsageScope;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * 제품 단건 상세 응답 — BaseEntity 의 audit 필드 + 노출 범위 필드까지 노출.
 *
 * <p>PR-B(2026-06-11) 추가 필드:
 * <ul>
 *   <li>{@code usageScope} — 현재 노출 범위 ({@link UsageScope})</li>
 *   <li>{@code estimateCategory} — 견적 카테고리 (scope ESTIMATE/BOTH 인 경우만 non-null)</li>
 *   <li>{@code usageScopeManual} — 수동 override 여부 (true 면 sync 가 덮어쓰지 않음)</li>
 *   <li>{@code displayOrder} — 시트 노출 순서 (null 이면 정렬 후순위)</li>
 *   <li>{@code modelCode} — 사용자 노출 비즈니스 식별자</li>
 * </ul>
 */
public record ProductResponse(
        UUID id,
        String name,
        String modelName,
        String modelCode,
        UUID categoryId,
        String categoryName,
        BigDecimal sellingPrice,
        BigDecimal purchasePrice,
        String currency,
        ProductStatus status,
        Map<String, String> tags,
        String description,
        ProductCategory productCategory,
        ProductItemKind itemKind,
        BundleMode bundleMode,
        String parentSetModelCode,
        BundleComponent.ComponentKind componentKind,
        String unit,
        BigDecimal releasePrice,
        BigDecimal deliveryPrice,
        ProductGoodsType goodsType,
        UsageScope usageScope,
        EstimateCategory estimateCategory,
        boolean usageScopeManual,
        Integer displayOrder,
        LocalDateTime createdAt,
        String createdBy,
        LocalDateTime modifiedAt,
        String modifiedBy) {

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
                itemKind,
                p.getBundleMode(),
                parentSetModelCode,
                componentKind,
                p.getUnit(),
                p.getReleasePrice(),
                p.getDeliveryPrice(),
                p.getGoodsType(),
                p.getUsageScope(),
                p.getEstimateCategory(),
                p.isUsageScopeManual(),
                p.getDisplayOrder(),
                p.getCreatedAt(),
                p.getCreatedBy(),
                p.getModifiedAt(),
                p.getModifiedBy());
    }
}
