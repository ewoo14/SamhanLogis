package com.samhanair.logis.partnerauth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** POST /api/v1/auth/partner-register 요청 — 가입 신청 (PENDING). */
public record PartnerRegisterRequest(
        @NotBlank @Pattern(regexp = "\\d{10,12}", message = "bizNo 는 10~12자 숫자만 허용")
        String bizNo,
        @Size(max = 30) String partnerCode,
        @Size(max = 500) String memo
) {}
