package com.samhanair.logis.partner.dto;

import com.samhanair.logis.partner.domain.Partner;
import java.util.UUID;

/** 모바일 영업 화면의 거래처 자동완성 응답. */
public record PartnerQuickSearchResponse(
        UUID id,
        String partnerCode,
        String partnerName,
        String representativeName,
        String phone) {

    public static PartnerQuickSearchResponse from(Partner partner) {
        return new PartnerQuickSearchResponse(
                partner.getId(),
                partner.getPartnerCode(),
                partner.getName(),
                partner.getRepresentative(),
                partner.getPhone());
    }
}
