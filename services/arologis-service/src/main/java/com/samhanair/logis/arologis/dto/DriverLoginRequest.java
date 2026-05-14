package com.samhanair.logis.arologis.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/**
 * arologis-mobile 기사 로그인 요청 — 2026-05-14 분리 (passwordless).
 *
 * <p>사전 등록된 phoneNumber 만 허용. 미등록 시 401. 본 PR scope 내에서 OTP SMS 없음.
 * 사용자 노출 식별자 = phoneNumber 자체.
 *
 * <p>format: 010 또는 011~019 로 시작하는 10~11자리 숫자 (하이픈 없음). 0\d{9,10}.
 */
public record DriverLoginRequest(
        @NotBlank
        @Pattern(regexp = "^0\\d{9,10}$", message = "휴대번호 형식이 올바르지 않습니다")
        String phoneNumber
) {}
