package com.samhanair.logis.groupware.web.collab.dto;

import com.samhanair.logis.groupware.dto.ApprovalLineAdminResponse;

/**
 * 결재 수정완료 응답.
 *
 * @param edit ACCEPTED 상태로 닫힌 수정 이력
 * @param approval 수정 후 결재 상세
 */
public record ApprovalCollabEditResponse(
        ApprovalCollabSuggestionResponse edit,
        ApprovalLineAdminResponse approval
) {
}
