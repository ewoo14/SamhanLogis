package com.samhanair.logis.arologis.dto;

import java.util.UUID;

/**
 * 현재 인증 사용자 정보 — 2026-05-14 분리 ({@code GET /auth/me}).
 *
 * <p>JWT 검증 후 X-User-Id (UUID) + X-User-Role (admin/driver) 을 기준으로 현재 DB row 를 다시 조회한다.
 * 화면 노출 식별자는 admin loginId/fullName 또는 driverCode/phoneNumber 로 제한한다.
 */
public record MeResponse(
        UUID userId,
        String role,
        String loginId,
        String fullName,
        String driverCode,
        String phoneNumber
) {

    public MeResponse(UUID userId, String role) {
        this(userId, role, null, null, null, null);
    }

    /** Admin 현재 사용자 응답 — UUID 는 내부 저장용, 화면 식별자는 loginId/fullName. */
    public static MeResponse admin(UUID userId, String role, String loginId, String fullName) {
        return new MeResponse(userId, role, loginId, fullName, null, null);
    }

    /** Driver 현재 사용자 응답 — 화면 식별자는 driverCode/phoneNumber. */
    public static MeResponse driver(UUID userId, String role, String driverCode, String phoneNumber) {
        return new MeResponse(userId, role, null, null, driverCode, phoneNumber);
    }
}
