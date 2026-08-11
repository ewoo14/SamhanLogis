package com.samhanair.logis.product.audit.web.dto;

import com.samhanair.logis.product.audit.domain.ProductAuditLog;
import com.samhanair.logis.common.security.ActorDisplayName;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 제품 audit overlay log 응답 DTO — PR-H4b.
 *
 * <p><b>UUID 비공개 가드</b>: actorId 는 응답에 포함하지만 FE 색상 hash 결정성 용도. 사용자 화면
 * 노출은 actorName 만 사용.
 */
public record ProductAuditLogResponse(
        UUID id,
        UUID productId,
        int revisionNo,
        UUID actorId,
        String actorName,
        String actorColor,
        String fieldName,
        String oldValue,
        String newValue,
        LocalDateTime changedAt
) {

    public static ProductAuditLogResponse from(ProductAuditLog log) {
        return new ProductAuditLogResponse(
                log.getId(),
                log.getProductId(),
                log.getRevisionNo(),
                log.getActorId(),
                ActorDisplayName.resolve(log.getActorId() == null ? null : log.getActorId().toString(), log.getActorName()),
                log.getActorColor(),
                log.getFieldName(),
                log.getOldValue(),
                log.getNewValue(),
                log.getChangedAt()
        );
    }
}
