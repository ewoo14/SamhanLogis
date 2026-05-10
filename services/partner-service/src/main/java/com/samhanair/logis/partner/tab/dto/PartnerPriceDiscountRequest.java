package com.samhanair.logis.partner.tab.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import java.math.BigDecimal;

/**
 * 거래처 단가/할인 정책 등록/수정 요청 DTO (4탭 탭 2).
 *
 * @param basicDiscountRate 기본 할인율 (0.00 ~ 99.99%)
 * @param paymentTermDays   결제 조건 일수 (1 이상, nullable)
 * @param discountMemo      비고 (nullable)
 */
public record PartnerPriceDiscountRequest(
        @DecimalMin(value = "0", inclusive = true)
        @DecimalMax(value = "99.99", inclusive = true)
        BigDecimal basicDiscountRate,

        @Min(1)
        Integer paymentTermDays,

        String discountMemo
) {
}
