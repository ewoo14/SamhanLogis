package com.samhanair.logis.product.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.math.BigDecimal;
import com.samhanair.logis.product.domain.EstimateCategory;

/**
 * 세트 전개 요청 (internal) — slip-service 의 견적/전표 생성 시 라인 품목을 BundleExpander 로 전개.
 *
 * <p>BUNDLE 부모면 옵션(패널/리모컨/자재) 선별 + 가격 재배분된 구성품 라인, 단일/KEEP 이면 1 라인 반환.
 * {@code setUnitOverride} 는 화면 협상 단가(세트 재배분 base / 단일 라인 단가) — 없으면 Product.deliveryPrice.
 */
public record ExpandRequest(
        @NotBlank String parentModelCode,
        @NotNull @Positive BigDecimal setQty,
        BigDecimal setUnitOverride,
        Options options,
        EstimateCategory estimateCategory) {

    public ExpandRequest(String parentModelCode, BigDecimal setQty, BigDecimal setUnitOverride,
                         Options options) {
        this(parentModelCode, setQty, setUnitOverride, options, null);
    }

    /** legacy ss_remote/ss_remote_ex/ss_panel/ss_p360/ss_mat 대응. null 이면 기본. */
    public record Options(String remoteOption, boolean remoteExcluded, String panelOption,
                          String panelShape360, boolean materialIncluded) {
    }
}
