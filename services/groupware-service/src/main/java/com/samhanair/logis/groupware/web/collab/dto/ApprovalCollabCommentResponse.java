package com.samhanair.logis.groupware.web.collab.dto;

import com.samhanair.logis.collab.CollabCommentStatus;
import com.samhanair.logis.groupware.collab.ApprovalCollabComment;
import com.samhanair.logis.common.security.ActorDisplayName;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 결재 협업 댓글 응답 DTO.
 *
 * <p>UUID 비공개 가드: authorId 는 응답하지 않는다. 사용자 표시 식별자는 authorName 만 사용한다.
 */
public record ApprovalCollabCommentResponse(
        UUID id,
        String anchor,
        String authorName,
        String body,
        UUID parentId,
        CollabCommentStatus status,
        LocalDateTime createdAt
) {

    public static ApprovalCollabCommentResponse from(ApprovalCollabComment comment) {
        return new ApprovalCollabCommentResponse(
                comment.getId(),
                comment.getAnchor(),
                ActorDisplayName.resolve(comment.getAuthorId() == null ? null : comment.getAuthorId().toString(), comment.getAuthorName()),
                comment.getBody(),
                comment.getParentId(),
                comment.getStatus(),
                comment.getCreatedAt());
    }
}
