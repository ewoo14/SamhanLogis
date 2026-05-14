package com.samhanair.logis.arologis.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Refresh / Logout 요청 — 2026-05-14 분리.
 *
 * <p>opaque refresh token (UUID.UUID 형태). 서버는 SHA-256 Base64 해시로 lookup.
 */
public record RefreshRequest(
        @NotBlank @Size(max = 200) String refreshToken
) {}
