package com.samhanair.logis.inventory.realtime.web.dto;

import com.samhanair.logis.inventory.realtime.domain.InventoryAuditLog;
import com.samhanair.logis.common.security.ActorDisplayName;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * inventory audit overlay 응답 DTO — PR-H4b (Phase 12 Step 4b).
 *
 * <p>UUID 비공개 가드 — actorName / fieldName 만 사용자 화면 노출. actorId 는 FE 색상 hash 결정성 용.
 */
public record InventoryAuditLogResponse(
        UUID id,
        UUID entityId,
        int revisionNo,
        UUID actorId,
        String actorName,
        String actorColor,
        String fieldName,
        String oldValue,
        String newValue,
        LocalDateTime changedAt) {

    public static InventoryAuditLogResponse from(InventoryAuditLog row) {
        return new InventoryAuditLogResponse(
                row.getId(),
                row.getEntityId(),
                row.getRevisionNo(),
                row.getActorId(),
                ActorDisplayName.resolve(row.getActorId() == null ? null : row.getActorId().toString(), row.getActorName()),
                row.getActorColor(),
                row.getFieldName(),
                row.getOldValue(),
                row.getNewValue(),
                row.getChangedAt());
    }
}
