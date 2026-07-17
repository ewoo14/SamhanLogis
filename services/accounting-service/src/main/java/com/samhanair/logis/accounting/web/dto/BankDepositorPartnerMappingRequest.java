package com.samhanair.logis.accounting.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 입금자명 매핑 생성·수정 요청. UUID 대신 거래처 business code를 받는다. */
public record BankDepositorPartnerMappingRequest(
        @NotBlank(message = "rawName 은 필수입니다")
        @Size(max = 120, message = "rawName 은 120자 이하여야 합니다")
        String rawName,
        @NotBlank(message = "partnerCode 는 필수입니다")
        String partnerCode,
        @Size(max = 500, message = "reason 은 500자 이하여야 합니다")
        String reason
) {
}
