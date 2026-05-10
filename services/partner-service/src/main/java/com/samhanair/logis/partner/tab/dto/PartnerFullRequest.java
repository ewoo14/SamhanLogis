package com.samhanair.logis.partner.tab.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * 거래처 4탭 일괄 등록/수정 요청 DTO.
 *
 * <p>{@code POST /api/v1/partners/full} 및 {@code PATCH /api/v1/partners/{partnerCode}/full} 에 사용.
 * partnerCode / bizNo 는 신규 등록 시 필수, 수정 시 path variable 로 식별하므로 선택.
 *
 * @param partnerCode       거래처 코드 (신규 등록 시 필수)
 * @param bizNo             사업자번호 (신규 등록 시 필수)
 * @param name              거래처 상호 (필수)
 * @param priceDiscount     단가/할인 정책 (nullable — 미입력 시 정책 미설정)
 * @param shippingAddresses 배송지 목록 (nullable — 미입력 시 배송지 미설정)
 * @param contacts          담당자 목록 (nullable — 미입력 시 담당자 미설정)
 */
public record PartnerFullRequest(
        @Size(max = 50) String partnerCode,
        @Size(max = 20) String bizNo,
        @NotBlank @Size(max = 200) String name,
        @Valid PartnerPriceDiscountRequest priceDiscount,
        @Valid List<PartnerShippingAddressRequest> shippingAddresses,
        @Valid List<PartnerContactRequest> contacts
) {
}
