package com.samhanair.logis.product.web.dto;

import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.UsageScope;
import java.math.BigDecimal;

/**
 * 카탈로그 endpoint 응답 — UUID 비공개 원칙 (feedback_uuid_no_user_visibility.md) 충족.
 * 사용자 화면에는 modelCode (사용자 노출 식별자) 만 노출, internal id (UUID) 미노출.
 *
 * <p>이카운트 품목 신원은 품목코드({@code model_code})와 품목명/모델명({@code model_name})이
 * 별도이며, 운영 실데이터에는 {@code model_code} 가 비어 있고 {@code model_name} 만
 * 채워진 행이 있다. 따라서 응답 {@code modelCode} 는 {@code model_code ?? model_name}
 * 규칙으로 채우며, 카탈로그 mutation path 도 동일 규칙으로 조회되어야 한다.
 *
 * <p>PR-B(2026-06-11) 추가 필드:
 * <ul>
 *   <li>{@code usageScopeManual} — 수동 override 여부. true 이면 sync 가 덮어쓰지 않음.</li>
 *   <li>{@code displayOrder} — 시트 노출 순서 (null 이면 정렬 후순위).</li>
 * </ul>
 */
public record ProductCatalogResponse(
        String modelCode,
        String name,
        UsageScope usageScope,
        EstimateCategory estimateCategory,
        boolean usageScopeManual,
        Integer displayOrder,
        BigDecimal releasePrice,
        BigDecimal deliveryPrice,
        boolean hasVariableDiscount,
        boolean legacyDiscountFlag,
        String discountFlags
) {
    public static ProductCatalogResponse from(Product p) {
        return new ProductCatalogResponse(
                p.getModelCode() == null ? p.getModelName() : p.getModelCode(),
                p.getName(),
                p.getUsageScope(),
                p.getEstimateCategory(),
                p.isUsageScopeManual(),
                p.getDisplayOrder(),
                p.getReleasePrice(),
                p.getDeliveryPrice(),
                Boolean.TRUE.equals(p.getHasVariableDiscount()),
                Boolean.TRUE.equals(p.getLegacyDiscountFlag()),
                p.getDiscountFlags()
        );
    }
}
