package com.samhanair.logis.slip.web.collab.dto;

import com.samhanair.logis.collab.CollabSuggestionRecord;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 전표 수정 제안 등록 요청.
 *
 * @param changeSet path → {before, after} JSON 문자열. 1차 범위는 overlay 필드 path.
 * @param reason 제안 사유.
 */
public record CreateSlipCollabSuggestionRequest(
        @NotBlank(message = "changeSet 은 필수입니다")
        String changeSet,
        @Size(max = CollabSuggestionRecord.MAX_REASON_LENGTH, message = "사유는 최대 500자입니다")
        String reason
) {
}
