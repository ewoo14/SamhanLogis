package com.samhanair.logis.slip.web.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.math.BigDecimal;
import com.samhanair.logis.slip.estimate.web.dto.BundleSetOptions;

/** 판매전표 입력 화면이 저장 경로와 같은 세트 전개를 미리 수행하기 위한 요청. */
public record ExpandSlipLineRequest(
        @NotBlank String parentModelCode,
        @NotNull @Positive Integer quantity,
        @NotNull @DecimalMin("0.00") BigDecimal unitPrice,
        BundleSetOptions setOptions) {
}
