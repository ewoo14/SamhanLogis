package com.samhanair.logis.arologis.domain.auth;

/**
 * 아로로지스 admin 사용자 역할 — 2026-05-14 분리.
 *
 * <p>arologis-desktop 사용자 권한. {@code AROLOGIS_MASTER} 는 모든 admin endpoint + master 전용
 * 운영 작업, {@code AROLOGIS_MANAGER} 는 일반 admin endpoint 만.
 */
public enum AdminUserRole {
    AROLOGIS_MASTER,
    AROLOGIS_MANAGER
}
