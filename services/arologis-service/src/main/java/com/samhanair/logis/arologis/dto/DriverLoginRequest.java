package com.samhanair.logis.arologis.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/**
 * arologis-mobile 기사 로그인 요청 — 2026-05-14 분리 (passwordless).
 *
 * <p>사전 등록된 phoneNumber 만 허용. 미등록 시 401. 본 PR scope 내에서 OTP SMS 없음.
 * 사용자 노출 식별자 = phoneNumber 자체.
 *
 * <p>format: 01[016789] 로 시작하는 10~11자리 휴대번호. 하이픈 표기(010-1234-5678)와 숫자-only
 * 표기(01012345678)를 허용하되, 로그인 조회 전에 하이픈 외 문자를 제거하지 않는다.
 */
public record DriverLoginRequest(
        @NotBlank
        @Pattern(regexp = "^01[016789](?:-\\d{3,4}-\\d{4}|\\d{7,8})$", message = "휴대번호 형식이 올바르지 않습니다")
        String phoneNumber
) {}
