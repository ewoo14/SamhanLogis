package com.samhanair.logis.slip.comment.web.dto;

import com.samhanair.logis.common.security.ActorDisplayName;
import com.samhanair.logis.slip.comment.domain.SlipComment;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 슬립 댓글 응답 DTO — PR-H1.
 *
 * <p><b>UUID 비공개 가드</b> ({@code feedback_uuid_no_user_visibility}): {@code authorId} 는 응답에
 * 포함하지 않는다. 사용자 화면 노출 식별자 = {@link #authorName} 만. id (댓글 PK) 는
 * delete/update 시 필요하므로 포함 (admin path 한정).
 *
 * @param id 댓글 PK (admin 작업용 — UI 직접 노출 금지)
 * @param slipId 소속 슬립 UUID
 * @param authorName 작성자 표시명 (사용자 노출)
 * @param body 본문 (≤500자)
 * @param createdAt 작성 시각 (audit createdAt)
 */
public record SlipCommentResponse(
        String authorName,
        String body,
        LocalDateTime createdAt
) {

    public static SlipCommentResponse from(SlipComment comment) {
        return new SlipCommentResponse(
                ActorDisplayName.resolveNullable(
                        comment.getAuthorId() == null ? null : comment.getAuthorId().toString(),
                        comment.getAuthorName()),
                comment.getBody(),
                comment.getCreatedAt()
        );
    }
}
