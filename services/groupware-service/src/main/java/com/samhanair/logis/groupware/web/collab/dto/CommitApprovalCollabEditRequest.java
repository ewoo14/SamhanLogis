package com.samhanair.logis.groupware.web.collab.dto;

import com.samhanair.logis.collab.CollabSuggestionRecord;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 결재 협업 수정완료 요청.
 *
 * @param changeSet path -> {after} JSON 문자열. title/content 만 허용한다.
 * @param reason 수정 사유. 빈 값이면 이력에 null 로 보존한다.
 */
public record CommitApprovalCollabEditRequest(
        @NotBlank(message = "changeSet 은 필수입니다")
        String changeSet,
        @Size(max = CollabSuggestionRecord.MAX_REASON_LENGTH, message = "사유는 최대 500자입니다")
        String reason
) {
}
