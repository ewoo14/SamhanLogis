package com.samhanair.logis.arologis.realtime.web.dto;

import com.samhanair.logis.arologis.realtime.domain.ArologisAuditLog;
import com.samhanair.logis.common.security.ActorDisplayName;
import java.time.LocalDateTime;

/**
 * arologis audit overlay 응답 DTO — PR-H4b (Phase 12 Step 4b).
 */
public record ArologisAuditLogResponse(
        int revisionNo,
        String actorName,
        String actorColor,
        String fieldName,
        String oldValue,
        String newValue,
        LocalDateTime changedAt) {

    public static ArologisAuditLogResponse from(ArologisAuditLog row) {
        return new ArologisAuditLogResponse(
                row.getRevisionNo(),
                ActorDisplayName.resolve(row.getActorId() == null ? null : row.getActorId().toString(), row.getActorName()),
                row.getActorColor(),
                row.getFieldName(),
                row.getOldValue(),
                row.getNewValue(),
                row.getChangedAt());
    }
}
