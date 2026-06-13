package com.samhanair.logis.accounting.web.collab.dto;

import com.samhanair.logis.collab.CollabCommentRecord;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.UUID;

/**
 * 회계전표 협업 댓글 등록 요청.
 *
 * @param body 본문. 500자 이하.
 * @param parentId 부모 댓글 ID. 없으면 최상위 댓글.
 * @param anchor 필드/행 anchor. 없으면 전표 전체 댓글.
 */
public record AddJournalCollabCommentRequest(
        @NotBlank(message = "본문은 필수입니다")
        @Size(max = CollabCommentRecord.MAX_BODY_LENGTH, message = "본문은 최대 500자까지 허용됩니다")
        String body,
        UUID parentId,
        @Size(max = CollabCommentRecord.MAX_ANCHOR_LENGTH, message = "anchor 는 최대 120자까지 허용됩니다")
        String anchor
) {
}
