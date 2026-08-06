package com.samhanair.logis.slip.web.collab.dto;

import com.samhanair.logis.collab.CollabSuggestionRecord;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 전표 협업 수정완료 요청.
 *
 * @param changeSet path -> {before, after} JSON 문자열. 편집 시작 시점의 필드별 baseline을
 *                    포함해야 하며 overlay 필드만 허용한다.
 * @param reason 수정 사유. 빈 값이면 이력에 null 로 보존한다.
 */
public record CommitSlipCollabEditRequest(
        @NotBlank(message = "changeSet 은 필수입니다")
        String changeSet,
        @Size(max = CollabSuggestionRecord.MAX_REASON_LENGTH, message = "사유는 최대 500자입니다")
        String reason
) {
}
