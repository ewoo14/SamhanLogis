package com.samhanair.logis.auth.menu;

/** 서버가 소유하는 메뉴 표시·권한 계약. UUID와 DB 식별자를 포함하지 않는다. */
public record MenuCatalogEntry(
        String app,
        String category,
        String label,
        String route,
        String pageCode,
        String action,
        boolean visible,
        int order) {
}
