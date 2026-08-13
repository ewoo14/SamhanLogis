package com.samhanair.logis.log.web;

import java.time.Instant;

import com.samhanair.logis.log.domain.AuditLog;
import com.samhanair.logis.shared.audit.publisher.AuditSanitizer;

/** 사용자 도달 가능 감사 API의 안전 응답. 내부 UUID·원본 before/after는 포함하지 않는다. */
public record SafeAuditLogResponse(
        String serviceName, String action, String resourceType, String resourceId,
        String description, String userRole, String actorDisplayName, Instant occurredAt) {
    public static SafeAuditLogResponse from(AuditLog row) {
        return new SafeAuditLogResponse(
                row.getServiceName(), row.getAction(), row.getResourceType(),
                AuditSanitizer.display(row.getResourceId()), AuditSanitizer.display(row.getDescription()),
                row.getUserRole(), AuditSanitizer.display(row.getActorDisplayName()), row.getOccurredAt());
    }
}
