package com.samhanair.logis.partner.dto;

import com.samhanair.logis.partner.domain.Partner;
import java.util.List;
import java.util.UUID;

/** partnerId 목록 기반 internal 거래처명 batch lookup 응답. */
public record PartnerLookupByIdsResponse(List<PartnerName> partners) {

    public static PartnerLookupByIdsResponse from(List<Partner> partners) {
        return new PartnerLookupByIdsResponse(partners.stream()
                .map(PartnerName::from)
                .toList());
    }

    /** accounting-service admin 목록 표시용 최소 거래처명 DTO. */
    public record PartnerName(UUID id, String name) {

        public static PartnerName from(Partner partner) {
            return new PartnerName(partner.getId(), partner.getName());
        }
    }
}
