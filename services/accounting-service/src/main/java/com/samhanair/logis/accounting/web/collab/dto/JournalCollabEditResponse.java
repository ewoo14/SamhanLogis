package com.samhanair.logis.accounting.web.collab.dto;

import com.samhanair.logis.accounting.web.dto.JournalDetailResponse;

/**
 * 회계전표 수정완료 응답.
 *
 * @param edit ACCEPTED 상태로 닫힌 수정 이력
 * @param journal 수정 후 회계전표 상세
 */
public record JournalCollabEditResponse(
        JournalCollabSuggestionResponse edit,
        JournalDetailResponse journal
) {
}
