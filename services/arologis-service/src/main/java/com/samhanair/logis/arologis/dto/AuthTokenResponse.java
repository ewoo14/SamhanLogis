package com.samhanair.logis.arologis.dto;

import java.time.Instant;

/**
 * 인증 토큰 응답 — 2026-05-14 분리.
 *
 * <p>admin / driver 양쪽 공통. accessToken 은 client 의 Authorization Bearer header,
 * refreshToken 은 client 의 secure storage (electron safeStorage / RN SecureStore) 에 저장.
 * expiresAt 은 access token 만료 시각. 공개 식별자는 role 별로 admin loginId/fullName 또는
 * driverCode/phoneNumber 만 채운다.
 */
public record AuthTokenResponse(
        String accessToken,
        String refreshToken,
        String role,
        Instant expiresAt,
        String loginId,
        String fullName,
        String driverCode,
        String phoneNumber
) {

    public AuthTokenResponse(String accessToken, String refreshToken, String role, Instant expiresAt) {
        this(accessToken, refreshToken, role, expiresAt, null, null, null, null);
    }

    /** Admin 로그인/refresh 응답 — 화면 노출 식별자는 loginId/fullName 만 제공한다. */
    public static AuthTokenResponse admin(
            String accessToken,
            String refreshToken,
            String role,
            Instant expiresAt,
            String loginId,
            String fullName
    ) {
        return new AuthTokenResponse(
                accessToken, refreshToken, role, expiresAt, loginId, fullName, null, null);
    }

    /** Driver 로그인/refresh 응답 — UUID 대신 driverCode/phoneNumber 만 제공한다. */
    public static AuthTokenResponse driver(
            String accessToken,
            String refreshToken,
            String role,
            Instant expiresAt,
            String driverCode,
            String phoneNumber
    ) {
        return new AuthTokenResponse(
                accessToken, refreshToken, role, expiresAt, null, null, driverCode, phoneNumber);
    }
}
