package com.samhanair.logis.dcconfig.audit.web.dto;

import com.samhanair.logis.dcconfig.audit.domain.DcConfigAuditLog;
import com.samhanair.logis.common.security.ActorDisplayName;
import java.time.LocalDateTime;
import java.util.UUID;

/** 거래처 DC 설정 audit timeline 응답 DTO. */
public record DcConfigAuditLogResponse(
        UUID id,
        UUID entityId,
        int revisionNo,
        UUID actorId,
        String actorName,
        String actorColor,
        String fieldName,
        String oldValue,
        String newValue,
        LocalDateTime changedAt
) {

    public static DcConfigAuditLogResponse from(DcConfigAuditLog log) {
        return new DcConfigAuditLogResponse(
                log.getId(),
                log.getEntityId(),
                log.getRevisionNo(),
                log.getActorId(),
                ActorDisplayName.resolve(log.getActorId() == null ? null : log.getActorId().toString(), log.getActorName()),
                log.getActorColor(),
                log.getFieldName(),
                log.getOldValue(),
                log.getNewValue(),
                log.getChangedAt());
    }
}
