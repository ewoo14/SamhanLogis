package com.samhanair.logis.partnerorder.audit.web.dto;

import com.samhanair.logis.partnerorder.audit.domain.PartnerOrderAuditLog;
import com.samhanair.logis.common.security.ActorDisplayName;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 거래처 주문 audit overlay log 응답 DTO — PR-H4b.
 *
 * <p><b>UUID 비공개 가드</b>: actorId 는 응답에 포함하지만 FE 색상 hash 결정성 용도. 사용자 화면
 * 노출은 actorName 만 사용.
 *
 * @param id audit log PK (admin 작업용)
 * @param partnerOrderId 소속 주문 UUID
 * @param revisionNo 주문별 단조 증가 수정 번호
 * @param actorId 수정자 UUID (FE 색상 hash 용 — 직접 표시 금지)
 * @param actorName 수정자 표시명 (사용자 화면 노출)
 * @param actorColor FE userIdToColor 결과 (HSL hex, 선택)
 * @param fieldName 변경된 필드 식별자
 * @param oldValue 이전 값 (취소선 표시용)
 * @param newValue 새 값
 * @param changedAt 변경 시각
 */
public record PartnerOrderAuditLogResponse(
        UUID id,
        UUID partnerOrderId,
        int revisionNo,
        UUID actorId,
        String actorName,
        String actorColor,
        String fieldName,
        String oldValue,
        String newValue,
        LocalDateTime changedAt
) {

    public static PartnerOrderAuditLogResponse from(PartnerOrderAuditLog log) {
        return new PartnerOrderAuditLogResponse(
                log.getId(),
                log.getPartnerOrderId(),
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
