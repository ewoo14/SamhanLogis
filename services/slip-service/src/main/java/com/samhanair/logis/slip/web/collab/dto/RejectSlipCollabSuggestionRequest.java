package com.samhanair.logis.slip.web.collab.dto;

import com.samhanair.logis.collab.CollabSuggestionRecord;
import jakarta.validation.constraints.Size;

/**
 * 전표 수정 제안 거절 요청.
 *
 * @param reason 거절 사유.
 */
public record RejectSlipCollabSuggestionRequest(
        @Size(max = CollabSuggestionRecord.MAX_REASON_LENGTH, message = "사유는 최대 500자입니다")
        String reason
) {
}
