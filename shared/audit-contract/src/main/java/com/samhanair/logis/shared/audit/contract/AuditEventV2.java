package com.samhanair.logis.shared.audit.contract;

import static com.samhanair.logis.shared.audit.contract.AuditEnums.*;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record AuditEventV2(
        String schemaVersion, String id, String serviceName,
        RetentionClass retentionClass, EventKind eventKind, Outcome outcome, AuditAction action,
        String requestId, String traceId, String parentService,
        String httpMethod, String routeTemplate, Integer httpStatus, Long durationMs,
        String userId, String actorDisplayName, String userRole,
        String resourceType, String resourceId, String internalResourceId,
        String description, Map<String, Object> beforeData, Map<String, Object> afterData,
        String errorCode, String errorClass, String rootCauseClass, String errorSummary,
        String stackFingerprint, String ipAddress, String userAgent, Instant occurredAt) {

    public static final String VERSION = "v2";

    public AuditEventV2 {
        if (schemaVersion == null || schemaVersion.isBlank()) schemaVersion = VERSION;
        if (id == null || id.isBlank()) id = UUID.randomUUID().toString();
        if (occurredAt == null) occurredAt = Instant.now();
    }

    public static AuditEventV2 mutation(String serviceName, String method, String route,
                                       String actor, String resourceType, String resourceId,
                                       String internalResourceId, String description,
                                       Map<String, Object> afterData) {
        return new AuditEventV2(
                "v2", UUID.randomUUID().toString(), serviceName,
                RetentionClass.A, EventKind.MUTATION, Outcome.SUCCESS, AuditAction.A_CHANGE,
                null, // requestId
                null, // traceId
                null, // parentService
                method, route, 200, null,
                null, actor, null,
                resourceType, resourceId, internalResourceId,
                description, null, afterData,
                null, null, null, null, null,
                null, null, Instant.now());
    }

    public static AuditEventV2 authentication(String serviceName, boolean success, String route,
                                              String message, String ipAddress, String userAgent) {
        return new AuditEventV2("v2", UUID.randomUUID().toString(), serviceName,
                success ? RetentionClass.A : RetentionClass.B, EventKind.AUTH,
                success ? Outcome.SUCCESS : Outcome.FAILURE,
                success ? AuditAction.A_CHANGE : AuditAction.B_FAILURE,
                null, null, null, "POST", route, 200, null,
                null, "비인증 거래처", null, "AUTH", "거래처 인증", null, "로그인 결과",
                null, null, null, null, null, success ? null : message, null,
                ipAddress, userAgent, Instant.now());
    }

    public String routingKey() {
        return AuditTopology.routingKey(action, serviceName);
    }
}
