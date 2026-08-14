package com.samhanair.logis.auth.menu;

import java.util.List;

/** 본체와 아로로지스 데스크톱이 공유하는 공식 메뉴 정본. */
public final class MenuCatalog {

    private static final List<MenuCatalogEntry> ENTRIES = List.of(
            entry("samhan-public", "배차현황", "/dispatch-board/history", "dispatch.board", 1),
            entry("samhan-public", "배차 그룹", "/admin/dispatch-groups", "dispatch.board", 2),
            entry("samhan-public", "가배차리스트", "/arologis/pre-classify", "arologis.dispatch.ops", 3),
            entry("samhan-public", "미배차리스트", "/arologis/unassigned", "arologis.dispatch.ops", 4),
            entry("samhan-public", "배차안내 SMS", "/arologis/dispatch-sms", "notification.dispatch-sms.display", 5),
            entry("samhan-public", "실배차 비교", "/arologis/dispatch-reconcile", "arologis.dispatch.ops", 6),
            entry("samhan-public", "배차지역 관리", "/admin/regions", "arologis.region", 7),
            entry("samhan-public", "외부기사/배송사", "/admin/external-carriers", "dispatch.external-carriers", 8),
            entry("samhan-public", "자동 매칭", "/arologis/admin/auto-dispatch", "arologis.admin", 9),
            entry("samhan-public", "배차 관리", "/arologis/admin/manual-dispatch", "arologis.admin", 10),
            entry("samhan-public", "기사 배정", "/arologis/admin/driver-assignment", "arologis.admin", 11),
            entry("arologis", "수동 배차", "/dispatches/manual", "arologis.dispatch.admin", 1),
            entry("arologis", "가배차 분류", "/dispatches/pre-classify", "arologis.dispatch.ops", 2),
            entry("arologis", "미배차", "/dispatches/unassigned", "arologis.dispatch.ops", 3),
            entry("arologis", "실배차 비교", "/dispatches/reconcile", "arologis.dispatch.ops", 4),
            entry("arologis", "수신 배차 그룹", "/dispatches/received-groups", "arologis.dispatch.ops", 5));

    private MenuCatalog() {
    }

    public static List<MenuCatalogEntry> entries() {
        return ENTRIES;
    }

    private static MenuCatalogEntry entry(String app, String label, String route, String pageCode, int order) {
        return new MenuCatalogEntry(app, "배차", label, route, pageCode, "VIEW", true, order);
    }
}
