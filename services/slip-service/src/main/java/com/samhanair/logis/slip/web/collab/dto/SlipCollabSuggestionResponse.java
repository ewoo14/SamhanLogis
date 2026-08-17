package com.samhanair.logis.slip.web.collab.dto;

import com.samhanair.logis.collab.CollabSuggestionStatus;
import com.samhanair.logis.common.security.ActorDisplayName;
import com.samhanair.logis.slip.collab.SlipCollabSuggestion;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.UUID;

/**
 * 전표 수정 이력 응답 DTO.
 *
 * <p>UUID 비공개 가드: proposerId/decidedById 는 응답하지 않는다. 사용자 화면에는
 * proposerName/decidedByName 만 표시한다. 1-인 수정완료 모델에서는 둘 다 같은 수정자다.
 *
 * <p>{@code decidedAt} 은 collab-core 가 {@code Instant} 로 기록하나, {@code createdAt}
 * (BaseEntity {@code LocalDateTime}) 과 화면 표기를 일치시키기 위해 시스템 기본 타임존
 * {@code LocalDateTime} 으로 변환해 응답한다 (UTC/로컬 9시간 어긋남 방지).
 */
public record SlipCollabSuggestionResponse(
        UUID id,
        String changeSet,
        String reason,
        String proposerName,
        CollabSuggestionStatus status,
        String decidedByName,
        LocalDateTime decidedAt,
        LocalDateTime createdAt
) {

    public static SlipCollabSuggestionResponse from(SlipCollabSuggestion suggestion) {
        return new SlipCollabSuggestionResponse(
                suggestion.getId(),
                suggestion.getChangeSet(),
                suggestion.getReason(),
                ActorDisplayName.resolveNullable(
                        suggestion.getProposerId() == null ? null : suggestion.getProposerId().toString(),
                        suggestion.getProposerName()),
                suggestion.getStatus(),
                ActorDisplayName.resolveNullable(
                        suggestion.getDecidedById() == null ? null : suggestion.getDecidedById().toString(),
                        suggestion.getDecidedByName()),
                suggestion.getDecidedAt() == null ? null
                        : LocalDateTime.ofInstant(suggestion.getDecidedAt(), ZoneId.systemDefault()),
                suggestion.getCreatedAt());
    }
}
