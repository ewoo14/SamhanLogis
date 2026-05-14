package com.samhanair.logis.arologis.domain.auth;

/**
 * RefreshToken 의 사용자 타입 — 2026-05-14 분리.
 *
 * <p>{@code ADMIN} 은 AdminUser (arologis-desktop), {@code DRIVER} 는 Driver (arologis-mobile).
 * polymorphic user_id (UUID) 의 출처 구분.
 */
public enum RefreshTokenUserType {
    ADMIN,
    DRIVER
}
