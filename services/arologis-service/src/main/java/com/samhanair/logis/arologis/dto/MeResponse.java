package com.samhanair.logis.arologis.dto;

import java.util.UUID;

/**
 * 현재 인증 사용자 정보 — 2026-05-14 분리 ({@code GET /auth/me}).
 *
 * <p>JWT 검증 후 X-User-Id (UUID) + X-User-Role (admin/driver) 만 노출.
 * loginId / driverCode / phoneNumber 등 사용자 노출 식별자는 client 가 JWT claim 에서 직접 사용.
 */
public record MeResponse(UUID userId, String role) {}
