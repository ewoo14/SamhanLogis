package com.samhanair.logis.accounting.web.collab.dto;

import com.samhanair.logis.accounting.collab.JournalCollabComment;
import com.samhanair.logis.common.security.ActorDisplayName;
import com.samhanair.logis.collab.CollabCommentStatus;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 회계전표 협업 댓글 응답 DTO.
 *
 * <p>UUID 비공개 가드: authorId 는 응답하지 않는다. id/parentId 는 댓글 key 용도로만 제공하고,
 * 사용자 표시 식별자는 authorName 만 사용한다.
 */
public record JournalCollabCommentResponse(
        String anchor,
        String authorName,
        String body,
        CollabCommentStatus status,
        LocalDateTime createdAt
) {

    public static JournalCollabCommentResponse from(JournalCollabComment comment) {
        return new JournalCollabCommentResponse(
                comment.getAnchor(),
                ActorDisplayName.resolve(comment.getAuthorId() == null ? null : comment.getAuthorId().toString(), comment.getAuthorName()),
                comment.getBody(),
                comment.getStatus(),
                comment.getCreatedAt());
    }
}
