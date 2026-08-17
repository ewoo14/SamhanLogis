package com.samhanair.logis.slip.web.dispatch.dto;

import com.samhanair.logis.collab.CollabCommentStatus;
import com.samhanair.logis.common.security.ActorDisplayName;
import com.samhanair.logis.slip.dispatch.collab.DispatchCollabComment;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 배차 협업 댓글 응답 DTO.
 *
 * <p>UUID 비공개 가드: {@code authorId} 는 응답하지 않는다. {@code id}/{@code parentId} 는
 * 댓글 key 용도로만 제공하고, 사용자 표시 식별자는 {@code authorName} 만 사용한다.
 */
public record DispatchCommentResponse(
        String anchor,
        String authorName,
        String body,
        CollabCommentStatus status,
        LocalDateTime createdAt
) {

    public static DispatchCommentResponse from(DispatchCollabComment comment) {
        return new DispatchCommentResponse(
                comment.getAnchor(),
                ActorDisplayName.resolveNullable(
                        comment.getAuthorId() == null ? null : comment.getAuthorId().toString(),
                        comment.getAuthorName()),
                comment.getBody(),
                comment.getStatus(),
                comment.getCreatedAt()
        );
    }
}
