package com.samhanair.logis.groupware.web.collab.dto;

import com.samhanair.logis.collab.CollabSuggestionStatus;
import com.samhanair.logis.groupware.collab.ApprovalCollabSuggestion;
import com.samhanair.logis.common.security.ActorDisplayName;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.UUID;

/**
 * 결재 수정 이력 응답 DTO.
 *
 * <p>UUID 비공개 가드: proposerId/decidedById 는 응답하지 않는다. 사용자 화면에는
 * proposerName/decidedByName 만 표시한다.
 */
public record ApprovalCollabSuggestionResponse(
        UUID id,
        String changeSet,
        String reason,
        String proposerName,
        CollabSuggestionStatus status,
        String decidedByName,
        LocalDateTime decidedAt,
        LocalDateTime createdAt
) {

    public static ApprovalCollabSuggestionResponse from(ApprovalCollabSuggestion suggestion) {
        return new ApprovalCollabSuggestionResponse(
                suggestion.getId(),
                suggestion.getChangeSet(),
                suggestion.getReason(),
                ActorDisplayName.resolve(suggestion.getProposerId() == null ? null : suggestion.getProposerId().toString(), suggestion.getProposerName()),
                suggestion.getStatus(),
                ActorDisplayName.resolve(suggestion.getDecidedById() == null ? null : suggestion.getDecidedById().toString(), suggestion.getDecidedByName()),
                suggestion.getDecidedAt() == null ? null
                        : LocalDateTime.ofInstant(suggestion.getDecidedAt(), ZoneId.systemDefault()),
                suggestion.getCreatedAt());
    }
}
