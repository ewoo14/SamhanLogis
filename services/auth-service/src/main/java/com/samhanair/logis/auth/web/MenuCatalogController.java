package com.samhanair.logis.auth.web;

import com.samhanair.logis.auth.menu.MenuCatalog;
import com.samhanair.logis.auth.menu.MenuCatalogEntry;
import com.samhanair.logis.auth.service.AccountPermissionService;
import com.samhanair.logis.auth.service.DynamicPermissionService;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.PermissionAction;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 인증 계정이 실제로 볼 수 있는 서버 메뉴 catalog를 제공한다. */
@RestController
@RequestMapping("/auth/admin/menu-catalog")
public class MenuCatalogController {

    private final AccountPermissionService accountPermissionService;
    private final DynamicPermissionService dynamicPermissionService;

    public MenuCatalogController(AccountPermissionService accountPermissionService,
                                 DynamicPermissionService dynamicPermissionService) {
        this.accountPermissionService = accountPermissionService;
        this.dynamicPermissionService = dynamicPermissionService;
    }

    /** 현재 인증 주체의 VIEW 권한과 catalog를 교집합한다. */
    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ApiResponse<List<MenuCatalogEntry>> getMenuCatalog(
            @RequestHeader(value = "X-User-Id", required = false) String userId,
            @RequestHeader(value = "X-Is-System-Master", required = false) String isSystemMaster,
            @RequestHeader(value = "X-Is-Partner", required = false) String isPartner,
            @RequestHeader(value = "X-Arologis-Role", required = false) String arologisRole) {
        if ("true".equalsIgnoreCase(isPartner)) {
            return ApiResponse.ok(List.of());
        }
        if ("true".equalsIgnoreCase(isSystemMaster)) {
            return ApiResponse.ok(MenuCatalog.entries());
        }

        if (arologisRole != null && arologisRole.startsWith("AROLOGIS_")) {
            String centralRole = arologisRole.substring("AROLOGIS_".length());
            return ApiResponse.ok(MenuCatalog.entries().stream()
                    .filter(entry -> "arologis".equals(entry.app()))
                    .filter(entry -> dynamicPermissionService.canView(centralRole, entry.pageCode()))
                    .toList());
        }

        UUID accountId = parseUuid(userId);
        if (accountId == null) {
            return ApiResponse.ok(List.of());
        }
        Map<String, java.util.EnumSet<PermissionAction>> permissions = accountPermissionService.bulkLoad(accountId);
        return ApiResponse.ok(MenuCatalog.entries().stream()
                .filter(entry -> permissions.getOrDefault(entry.pageCode(), java.util.EnumSet.noneOf(PermissionAction.class))
                        .contains(PermissionAction.VIEW))
                .toList());
    }

    private UUID parseUuid(String value) {
        try {
            return value == null ? null : UUID.fromString(value);
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }
}
