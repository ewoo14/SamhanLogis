package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.domain.BankDepositorPartnerMapping;
import com.samhanair.logis.accounting.client.PartnerSummary;
import java.time.LocalDateTime;

/** UUID를 숨기고 business key와 거래처 표시값만 반환하는 입금자명 매핑 응답. */
public record BankDepositorPartnerMappingResponse(
        String rawName,
        String normalizedName,
        String partnerCode,
        String partnerName,
        LocalDateTime modifiedAt,
        String actor,
        boolean active
) {
    /** 매핑 entity와 거래처 summary를 응답으로 변환한다. */
    public static BankDepositorPartnerMappingResponse of(BankDepositorPartnerMapping mapping,
                                                         PartnerSummary partner) {
        String modifiedBy = mapping.getModifiedBy();
        String actor = modifiedBy != null && modifiedBy.matches("[0-9a-fA-F-]{36}")
                ? "사용자" : modifiedBy;
        return new BankDepositorPartnerMappingResponse(
                mapping.getRawName(), mapping.getNormalizedName(),
                partner == null ? null : partner.partnerCode(),
                partner == null ? null : partner.name(),
                mapping.getModifiedAt(), actor, !Boolean.TRUE.equals(mapping.getIsDeleted()));
    }
}
