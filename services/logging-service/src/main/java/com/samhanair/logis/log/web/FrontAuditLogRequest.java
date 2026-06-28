package com.samhanair.logis.log.web;

import java.time.Instant;
import java.util.Map;

/** 프론트엔드 감사 이벤트 수집 요청. DEV-3 MENU_ACCESS 는 이 계약을 재사용한다. */
public record FrontAuditLogRequest(
        String action,
        String resourceType,
        String resourceId,
        String userId,
        String userRole,
        String description,
        Instant occurredAt,
        String group,
        String message,
        Boolean isMobile,
        String manager
) {
    Map<String, Object> afterData() {
        if (isMobile == null && isBlank(group) && isBlank(manager)) {
            return null;
        }
        return Map.of(
                "group", blankToDash(group),
                "manager", blankToDash(manager),
                "isMobile", Boolean.TRUE.equals(isMobile));
    }

    private static String blankToDash(String value) {
        return isBlank(value) ? "-" : value.trim();
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
