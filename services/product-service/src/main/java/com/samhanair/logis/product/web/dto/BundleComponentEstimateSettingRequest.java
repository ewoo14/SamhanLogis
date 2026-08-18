package com.samhanair.logis.product.web.dto;

import com.samhanair.logis.product.domain.BundleComponent;
import jakarta.validation.constraints.NotBlank;

/** 카테고리별 구성품 설정 저장 요청. 구성품 추가·삭제·가격은 포함하지 않는다. */
public record BundleComponentEstimateSettingRequest(
        @NotBlank String componentProductCode,
        BundleComponent.QtyMode qtyMode,
        BundleComponent.ComponentKind componentKind,
        String componentVariant,
        String componentShape,
        Boolean isDefault) {
}
