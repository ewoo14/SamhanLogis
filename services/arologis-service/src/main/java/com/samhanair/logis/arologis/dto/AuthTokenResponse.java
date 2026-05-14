package com.samhanair.logis.arologis.dto;

import java.time.Instant;

/**
 * 인증 토큰 응답 — 2026-05-14 분리.
 *
 * <p>admin / driver 양쪽 공통. accessToken 은 client 의 Authorization Bearer header,
 * refreshToken 은 client 의 secure storage (electron safeStorage / RN SecureStore) 에 저장.
 * expiresAt 은 access token 만료 시각.
 */
public record AuthTokenResponse(
        String accessToken,
        String refreshToken,
        String role,
        Instant expiresAt
) {}
