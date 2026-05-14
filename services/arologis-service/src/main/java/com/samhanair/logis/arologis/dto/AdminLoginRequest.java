package com.samhanair.logis.arologis.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * arologis-desktop admin 로그인 요청 — 2026-05-14 분리.
 *
 * <p>loginId + password (BCrypt strength 10). UUID 비공개 — loginId 가 사용자 노출 식별자.
 */
public record AdminLoginRequest(
        @NotBlank @Size(max = 64) String loginId,
        @NotBlank @Size(max = 200) String password
) {}
