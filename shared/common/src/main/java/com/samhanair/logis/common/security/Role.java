package com.samhanair.logis.common.security;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/** 10-role taxonomy with Korean display names for UI rendering. */
@Getter
@RequiredArgsConstructor
public enum Role {
    MASTER("마스터"),
    DEVELOPER("개발자"),
    MANAGER("매니저"),
    DISPATCH("배차담당자"),
    SALES("영업원"),
    ACCOUNTANT("회계원"),
    WAREHOUSE("창고원"),
    INVENTORY("재고원"),
    STAFF("사원"),
    DRIVER("기사");

    private static final String AUTHORITY_PREFIX = "ROLE_";

    private final String displayName;

    public static Role fromAuthority(String authority) {
        if (authority == null || !authority.startsWith(AUTHORITY_PREFIX)) {
            throw new IllegalArgumentException("Invalid authority: " + authority);
        }
        String name = authority.substring(AUTHORITY_PREFIX.length());
        try {
            return Role.valueOf(name);
        } catch (IllegalArgumentException ex) {
            throw new IllegalArgumentException("Unknown role authority: " + authority, ex);
        }
    }
}
