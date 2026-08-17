package com.samhanair.logis.slip.web.dispatch.dto;

import com.samhanair.logis.collab.CollabSuggestionStatus;
import com.samhanair.logis.common.security.ActorDisplayName;
import com.samhanair.logis.slip.dispatch.collab.DispatchCollabSuggestion;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.UUID;

/**
 * 배차 수정 이력 응답 DTO.
 *
 * <p>UUID 비공개 가드: proposerId/decidedById 는 응답하지 않는다. 사용자 화면에는
 * proposerName/decidedByName 만 표시한다. 1-인 수정완료 모델에서는 둘 다 같은 수정자다.
 */
public record DispatchCollabSuggestionResponse(
        String changeSet,
        String reason,
        String proposerName,
        CollabSuggestionStatus status,
        String decidedByName,
        LocalDateTime decidedAt,
        LocalDateTime createdAt
) {

    public static DispatchCollabSuggestionResponse from(DispatchCollabSuggestion suggestion) {
        return new DispatchCollabSuggestionResponse(
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
