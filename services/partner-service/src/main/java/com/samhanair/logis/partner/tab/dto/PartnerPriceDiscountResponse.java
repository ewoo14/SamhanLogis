package com.samhanair.logis.partner.tab.dto;

import com.samhanair.logis.partner.domain.PartnerPriceDiscount;
import java.math.BigDecimal;

/**
 * 거래처 단가/할인 정책 응답 (4탭 탭 2).
 *
 * <p>UUID 비공개 가드 — id 미포함.
 *
 * @param basicDiscountRate 기본 할인율 (%)
 * @param paymentTermDays   결제 조건 일수 (nullable)
 * @param discountMemo      비고 (nullable)
 */
public record PartnerPriceDiscountResponse(
        BigDecimal basicDiscountRate,
        Integer paymentTermDays,
        String discountMemo
) {

    /**
     * PartnerPriceDiscount 엔티티로부터 응답 생성.
     *
     * @param d 단가/할인 정책 엔티티
     * @return PartnerPriceDiscountResponse
     */
    public static PartnerPriceDiscountResponse from(PartnerPriceDiscount d) {
        return new PartnerPriceDiscountResponse(
                d.getBasicDiscountRate(),
                d.getPaymentTermDays(),
                d.getDiscountMemo()
        );
    }

    /** 미등록(null 엔티티) 시 기본값 응답 생성. */
    public static PartnerPriceDiscountResponse empty() {
        return new PartnerPriceDiscountResponse(BigDecimal.ZERO, null, null);
    }
}
