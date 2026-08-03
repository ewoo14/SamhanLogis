package com.samhanair.logis.product.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;

/** 모델명 batch 조회 — 한 번에 최대 100개. */
public record LookupByModelNamesRequest(
        @NotEmpty(message = "modelNames는 필수입니다")
        @Size(max = 100, message = "modelNames는 최대 100개입니다")
        List<@NotBlank(message = "modelName은 필수입니다") @Size(max = 100) String> modelNames) {
}
