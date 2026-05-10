package com.samhanair.logis.partner.tab.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 거래처 담당자 등록/수정 요청 DTO (4탭 탭 4).
 *
 * @param contactName 담당자명 (필수)
 * @param position    직책/직위 (nullable)
 * @param phone       직통 전화 (nullable)
 * @param email       이메일 (nullable)
 * @param isPrimary   주 담당자 여부 (null 시 false)
 * @param memo        비고 (nullable)
 */
public record PartnerContactRequest(
        @NotBlank @Size(max = 50) String contactName,
        @Size(max = 50) String position,
        @Size(max = 30) String phone,
        @Email @Size(max = 120) String email,
        Boolean isPrimary,
        @Size(max = 500) String memo
) {
}
