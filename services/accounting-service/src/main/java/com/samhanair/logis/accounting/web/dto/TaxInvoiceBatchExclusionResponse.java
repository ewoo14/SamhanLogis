package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.domain.TaxInvoiceBatchExclusion;
import com.samhanair.logis.common.security.ActorDisplayName;
import java.time.LocalDateTime;

/**
 * 제외 거래처 응답 DTO.
 */
public record TaxInvoiceBatchExclusionResponse(
        /** 거래처 코드 (사용자 노출 식별자). */
        String partnerCode,
        /** 거래처 명칭 스냅샷. */
        String partnerName,
        /** 제외 사유. */
        String reason,
        /** 등록 시각. */
        LocalDateTime createdAt,
        /** 등록자. */
        String createdBy
) {
    /**
     * entity → 응답 변환.
     *
     * @param ex 제외 거래처 entity
     * @return 응답 DTO
     */
    public static TaxInvoiceBatchExclusionResponse of(TaxInvoiceBatchExclusion ex) {
        return new TaxInvoiceBatchExclusionResponse(
                ex.getPartnerCode(),
                ex.getPartnerName(),
                ex.getReason(),
                ex.getCreatedAt(),
                ActorDisplayName.resolve(ex.getCreatedBy(), null)
        );
    }
}
