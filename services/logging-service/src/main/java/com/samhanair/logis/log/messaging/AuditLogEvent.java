package com.samhanair.logis.log.messaging;

import java.time.Instant;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.samhanair.logis.shared.audit.contract.AuditEnums;

/**
 * Wire-format audit log event published by other services to RabbitMQ
 * exchange {@code samhan.audit.exchange} with routing key {@code audit.<...>}.
 *
 * Mirrors {@link com.samhanair.logis.log.domain.AuditLog} minus
 * {@code ingestedAt} (set on the consumer side at write time).
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record AuditLogEvent(
        String id,
        String serviceName,
        String userId,
        String userRole,
        String action,
        String resourceType,
        String resourceId,
        String description,
        Map<String, Object> beforeData,
        Map<String, Object> afterData,
        String ipAddress,
        String userAgent,
        Instant occurredAt,
        String schemaVersion,
        AuditEnums.RetentionClass retentionClass,
        AuditEnums.EventKind eventKind,
        AuditEnums.Outcome outcome,
        AuditEnums.AuditAction auditAction,
        String requestId,
        String traceId,
        String parentService,
        String httpMethod,
        String routeTemplate,
        Integer httpStatus,
        Long durationMs,
        String actorDisplayName,
        String internalResourceId,
        String errorCode,
        String errorClass,
        String rootCauseClass,
        String errorSummary,
        String stackFingerprint
) {
    public AuditLogEvent(String id, String serviceName, String userId, String userRole, String action,
                         String resourceType, String resourceId, String description,
                         Map<String, Object> beforeData, Map<String, Object> afterData,
                         String ipAddress, String userAgent, Instant occurredAt) {
        this(id, serviceName, userId, userRole, action, resourceType, resourceId, description,
                beforeData, afterData, ipAddress, userAgent, occurredAt,
                null, /* schema */ null, /* retention */ null, /* kind */ null, /* outcome */ null,
                /* action */ null, /* request */ null, /* trace */ null, /* parent */ null,
                /* method */ null, /* route */ null, /* status */ null, /* duration */ null,
                /* actor */ null, /* internal */ null, /* error code */ null,
                /* root */ null, /* summary */ null, /* fingerprint */ null);
    }
}
