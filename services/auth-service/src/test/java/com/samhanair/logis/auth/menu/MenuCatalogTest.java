package com.samhanair.logis.auth.menu;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class MenuCatalogTest {

    @Test
    @DisplayName("서버 catalog는 본체 메뉴 93개와 아로로지스 5개 공식 메뉴를 가진다")
    void containsOfficialMenusOnly() {
        assertThat(MenuCatalog.entries()).hasSize(107);
        assertThat(MenuCatalog.entries().stream().filter(entry -> entry.app().equals("samhan-public")))
                .hasSize(102);
        assertThat(MenuCatalog.entries().stream().filter(entry -> entry.app().equals("arologis")))
                .hasSize(5);
        assertThat(MenuCatalog.entries().stream().map(MenuCatalogEntry::route).collect(Collectors.toSet()))
                .doesNotContain("/arologis/manual");
        assertThat(MenuCatalog.entries().stream().map(MenuCatalogEntry::route).collect(Collectors.toSet()))
                .doesNotContain("/chat");
        assertThat(MenuCatalog.entries().stream().map(MenuCatalogEntry::route).collect(Collectors.toSet()))
                .contains("/admin/chat-rooms");
        assertThat(MenuCatalog.entries().stream().map(MenuCatalogEntry::route).collect(Collectors.toSet()))
                .contains("/admin/app-notices", "/admin/activity-logs");
    }

    @Test
    @DisplayName("동일 pageCode가 여러 메뉴를 덮어도 route와 label은 독립 catalog 항목이다")
    void preservesMenuIdentityBeyondPageCode() {
        Set<String> dispatchBoardRoutes = MenuCatalog.entries().stream()
                .filter(entry -> entry.pageCode().equals("dispatch.board"))
                .map(MenuCatalogEntry::route)
                .collect(Collectors.toSet());

        assertThat(dispatchBoardRoutes)
                .containsExactlyInAnyOrder("/dispatch-board/history", "/admin/dispatch-groups");
    }

    @Test
    @DisplayName("catalog 항목은 UUID나 내부 식별자를 노출하지 않는 문자열 계약이다")
    void exposesNoUuidFields() {
        assertThat(MenuCatalogEntry.class.getDeclaredFields())
                .extracting(field -> field.getName())
                .containsExactlyInAnyOrder(
                        "app", "category", "label", "route", "pageCode", "action", "visible", "order");
    }
}
