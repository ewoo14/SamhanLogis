package com.samhanair.logis.shared.audit.contract;

import static com.samhanair.logis.shared.audit.contract.AuditEnums.*;

public final class AuditEventValidator {
    private AuditEventValidator() {}

    public static void validate(AuditEventV2 event) {
        require(event.id(), "id");
        require(event.serviceName(), "serviceName");
        require(event.action(), "action");
        require(event.retentionClass(), "retentionClass");
        require(event.eventKind(), "eventKind");
        require(event.outcome(), "outcome");
        if (event.action() == AuditAction.C_READ && event.retentionClass() != RetentionClass.C)
            throw new IllegalArgumentException("C_READ must use retention C");
        if (event.action() == AuditAction.A_CHANGE && event.retentionClass() != RetentionClass.A)
            throw new IllegalArgumentException("A_CHANGE must use retention A");
        if (event.action() == AuditAction.B_FAILURE && event.retentionClass() != RetentionClass.B)
            throw new IllegalArgumentException("B_FAILURE must use retention B");
    }

    private static void require(Object value, String name) {
        if (value == null || (value instanceof String s && s.isBlank()))
            throw new IllegalArgumentException(name + " is required");
    }
}
