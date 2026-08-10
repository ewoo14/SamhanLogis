package com.samhanair.logis.product.web.dto;

import com.samhanair.logis.product.domain.Classification;
import com.samhanair.logis.product.domain.EstimateCategory;
import java.math.BigDecimal;
import java.util.UUID;

/** Classification 마스터 응답. UUID 는 관리 API 내부 식별자로만 사용한다. */
public record ClassificationResponse(
        UUID id,
        EstimateCategory estimateCategory,
        Classification.CatLevel catLevel,
        UUID parentId,
        String name,
        int displayOrder,
        boolean active,
        BigDecimal fixedDiscountRate) {

    public static ClassificationResponse from(Classification classification) {
        return new ClassificationResponse(
                classification.getId(),
                classification.getEstimateCategory(),
                classification.getCatLevel(),
                classification.getParent() == null ? null : classification.getParent().getId(),
                classification.getName(),
                classification.getDisplayOrder(),
                classification.isActive(),
                classification.getFixedDiscountRate());
    }
}
