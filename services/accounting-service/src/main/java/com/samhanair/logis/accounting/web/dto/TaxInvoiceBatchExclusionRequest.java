package com.samhanair.logis.accounting.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 제외 거래처 등록 요청 DTO.
 */
public record TaxInvoiceBatchExclusionRequest(
        /** 거래처 코드 (필수). */
        @NotBlank @Size(max = 100, message = "partnerCode 는 최대 100자입니다") String partnerCode,
        /** 거래처 명칭 스냅샷 (nullable). */
        String partnerName,
        /** 제외 사유 (nullable). */
        String reason
) {
}
