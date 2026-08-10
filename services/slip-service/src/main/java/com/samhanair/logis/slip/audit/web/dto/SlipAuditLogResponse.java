package com.samhanair.logis.slip.audit.web.dto;

import com.samhanair.logis.slip.audit.domain.SlipAuditLog;
import com.samhanair.logis.slip.security.ActorNameSanitizer;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 슬립 audit overlay log 응답 DTO — PR-H2.
 *
 * <p><b>UUID 비공개 가드</b> ({@code feedback_uuid_no_user_visibility}): {@code actorId} 는
 * 응답에 포함하지만 FE 색상 hash 결정성 용도. 사용자 화면 노출은 {@link #actorName} 만 사용.
 * id 자체는 admin 작업 (revert 등) 에 필요.
 *
 * @param id audit log PK (admin 작업용)
 * @param slipId 소속 슬립 UUID
 * @param revisionNo 슬립별 단조 증가 수정 번호
 * @param actorId 수정자 UUID (FE 색상 hash 용 — 직접 표시 금지)
 * @param actorName 수정자 표시명 (사용자 화면 노출)
 * @param actorColor FE userIdToColor 결과 (HSL hex, 선택)
 * @param fieldName 변경된 필드 식별자
 * @param oldValue 이전 값 (취소선 표시용)
 * @param newValue 새 값
 * @param changedAt 변경 시각
 */
public record SlipAuditLogResponse(
        UUID id,
        UUID slipId,
        int revisionNo,
        UUID actorId,
        String actorName,
        String actorColor,
        String fieldName,
        String oldValue,
        String newValue,
        LocalDateTime changedAt
) {

    private static final String UNKNOWN_ACTOR_NAME = "변경자 미상";
    public static SlipAuditLogResponse from(SlipAuditLog log) {
        return new SlipAuditLogResponse(
                log.getId(),
                log.getSlipId(),
                log.getRevisionNo(),
                log.getActorId(),
                safeActorName(log.getActorName(), log.getActorId()),
                log.getActorColor(),
                log.getFieldName(),
                log.getOldValue(),
                log.getNewValue(),
                log.getChangedAt()
        );
    }

    /** 기존 오염 행의 UUID actorName 이 사용자 응답으로 나가지 않도록 최종 방어한다. */
    private static String safeActorName(String actorName, UUID actorId) {
        if (actorName == null || actorName.isBlank()
                || ActorNameSanitizer.representsActorId(actorName, actorId)) {
            return UNKNOWN_ACTOR_NAME;
        }
        return actorName;
    }
}
