package com.samhanair.logis.partner.tab.dto;

import java.util.List;

/**
 * 거래처 4탭 일괄 응답 DTO.
 *
 * <p>단일 round-trip 으로 4탭 전체 데이터를 반환.
 * {@code GET /api/v1/partners/{partnerCode}/full} 응답에 사용.
 *
 * @param basic            기본정보 (탭 1)
 * @param priceDiscount    단가/할인 정책 (탭 2)
 * @param shippingAddresses 배송지 목록 (탭 3)
 * @param contacts         담당자 목록 (탭 4)
 */
public record PartnerFullResponse(
        PartnerBasicResponse basic,
        PartnerPriceDiscountResponse priceDiscount,
        List<PartnerShippingAddressResponse> shippingAddresses,
        List<PartnerContactResponse> contacts
) {
}
