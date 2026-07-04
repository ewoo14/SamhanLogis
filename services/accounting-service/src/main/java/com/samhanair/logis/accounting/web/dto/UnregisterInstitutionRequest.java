package com.samhanair.logis.accounting.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * CODEF 등록 기관 해제 요청.
 *
 * @param businessType 업무 구분(BANK/CARD/LOAN)
 * @param organizationCode 기관 코드
 */
public record UnregisterInstitutionRequest(
        @NotBlank String businessType,
        @NotBlank @Size(max = 50) String organizationCode
) {
}
