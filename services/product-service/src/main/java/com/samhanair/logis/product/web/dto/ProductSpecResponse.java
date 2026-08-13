package com.samhanair.logis.product.web.dto;

import com.samhanair.logis.product.domain.ProductSpec;
import java.util.UUID;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;

/**
 * ProductSpec endpoint 응답 — id 는 spec 단위 PATCH/DELETE 대상 (관리자 UI 한정).
 * Frontend 카드/모달에서는 specKey/specValue/unit/displayOrder 만 사용.
 */
public record ProductSpecResponse(
        @JsonSerialize(using = OpaqueUuidSerializer.class) UUID id,
        String specKey,
        String specValue,
        String unit,
        Integer displayOrder
) {
    public static ProductSpecResponse from(ProductSpec s) {
        return new ProductSpecResponse(s.getId(), s.getSpecKey(), s.getSpecValue(),
                s.getUnit(), s.getDisplayOrder());
    }
}
