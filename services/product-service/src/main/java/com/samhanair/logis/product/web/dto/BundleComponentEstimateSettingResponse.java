package com.samhanair.logis.product.web.dto;

import com.samhanair.logis.product.domain.BundleComponent;
import com.samhanair.logis.product.domain.BundleComponentEstimateSetting;
import com.samhanair.logis.product.domain.EstimateCategory;

/** 카테고리별 구성품 설정 응답 — 내부 UUID를 공개하지 않는다. */
public record BundleComponentEstimateSettingResponse(
        String componentProductCode,
        EstimateCategory estimateCategory,
        BundleComponent.QtyMode qtyMode,
        BundleComponent.ComponentKind componentKind,
        String componentVariant,
        String componentShape,
        boolean isDefault,
        Integer displayOrder,
        boolean configurationOnly) {

    public static BundleComponentEstimateSettingResponse from(
            BundleComponentEstimateSetting setting, String componentProductCode) {
        return new BundleComponentEstimateSettingResponse(componentProductCode,
                setting.getEstimateCategory(), setting.getQtyMode(), setting.getComponentKind(),
                setting.getComponentVariant(), setting.getComponentShape(), setting.isDefault(),
                setting.getSourceDisplayOrder(), setting.isConfigurationOnly());
    }
}
