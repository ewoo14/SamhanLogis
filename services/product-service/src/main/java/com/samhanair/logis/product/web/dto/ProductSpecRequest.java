package com.samhanair.logis.product.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** 제품 등록/수정 화면에서 함께 저장하는 동적 사양 행. */
public record ProductSpecRequest(
        @NotBlank @Size(max = 50) String specKey,
        @NotNull @Size(max = 255) String specValue
) {
}
