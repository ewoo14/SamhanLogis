package com.samhanair.logis.product.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;

/** modelCode batch 조회 — 한 번에 최대 100개. */
public record LookupByModelCodesRequest(
        @NotEmpty(message = "modelCodes는 필수입니다")
        @Size(max = 100, message = "modelCodes는 최대 100개입니다")
        List<@NotBlank(message = "modelCode는 필수입니다") @Size(max = 100) String> modelCodes) {
}
