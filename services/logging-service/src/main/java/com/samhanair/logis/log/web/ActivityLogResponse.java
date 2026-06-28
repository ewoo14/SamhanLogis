package com.samhanair.logis.log.web;

import java.time.Instant;

/** 활동 로그 화면 응답. 원본 userId(UUID)는 노출하지 않는다. */
public record ActivityLogResponse(
        Instant occurredAt,
        String user,
        String userRole,
        String action,
        String resourceType,
        String resourceId,
        String description,
        String serviceName
) {
}
