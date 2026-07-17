package com.samhanair.logis.accounting.web.dto;

import java.time.LocalDateTime;

/** 입금자명 매핑 append-only 변경 이력 응답. UUID를 반환하지 않는다. */
public record BankDepositorPartnerMappingHistoryResponse(
        String fieldName,
        String oldValue,
        String newValue,
        String actor,
        LocalDateTime changedAt
) {
}
