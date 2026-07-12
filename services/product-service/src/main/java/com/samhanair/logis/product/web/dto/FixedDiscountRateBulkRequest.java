package com.samhanair.logis.product.web.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

/** #773 S1c 고정DC율 productId 벌크 조회 요청. */
public record FixedDiscountRateBulkRequest(
        @NotEmpty(message = "productIds는 필수입니다")
        @Size(max = 500, message = "productIds는 최대 500개입니다")
        List<@NotNull UUID> productIds) {
}
