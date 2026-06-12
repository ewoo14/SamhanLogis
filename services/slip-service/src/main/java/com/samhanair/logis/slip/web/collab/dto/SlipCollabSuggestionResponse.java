package com.samhanair.logis.slip.web.collab.dto;

import com.samhanair.logis.collab.CollabSuggestionStatus;
import com.samhanair.logis.slip.collab.SlipCollabSuggestion;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 전표 수정 제안 응답 DTO.
 *
 * <p>UUID 비공개 가드: proposerId/decidedById 는 응답하지 않는다. 사용자 화면에는
 * proposerName/decidedByName 만 표시한다.
 */
public record SlipCollabSuggestionResponse(
        UUID id,
        String changeSet,
        String reason,
        String proposerName,
        CollabSuggestionStatus status,
        String decidedByName,
        Instant decidedAt,
        LocalDateTime createdAt
) {

    public static SlipCollabSuggestionResponse from(SlipCollabSuggestion suggestion) {
        return new SlipCollabSuggestionResponse(
                suggestion.getId(),
                suggestion.getChangeSet(),
                suggestion.getReason(),
                suggestion.getProposerName(),
                suggestion.getStatus(),
                suggestion.getDecidedByName(),
                suggestion.getDecidedAt(),
                suggestion.getCreatedAt());
    }
}
