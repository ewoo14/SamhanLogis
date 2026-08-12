package com.samhanair.logis.slip.estimate.web.collab.dto;

import com.samhanair.logis.collab.CollabCommentStatus;
import com.samhanair.logis.common.security.ActorDisplayName;
import com.samhanair.logis.slip.estimate.collab.EstimateCollabComment;
import java.time.LocalDateTime;
import java.util.UUID;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.samhanair.logis.slip.estimate.web.dto.OpaqueUuidSerializer;

/**
 * 견적 협업 댓글 응답 DTO.
 *
 * <p>UUID 비공개 가드: authorId 는 응답하지 않는다. id/parentId 는 댓글 key 용도로만 제공하고,
 * 사용자 표시 식별자는 authorName 만 사용한다.
 */
public record EstimateCollabCommentResponse(
        @JsonSerialize(using = OpaqueUuidSerializer.class) UUID id,
        String anchor,
        String authorName,
        String body,
        @JsonSerialize(using = OpaqueUuidSerializer.class) UUID parentId,
        CollabCommentStatus status,
        LocalDateTime createdAt
) {

    public static EstimateCollabCommentResponse from(EstimateCollabComment comment) {
        return new EstimateCollabCommentResponse(
                comment.getId(),
                comment.getAnchor(),
                ActorDisplayName.resolveNullable(
                        comment.getAuthorId() == null ? null : comment.getAuthorId().toString(),
                        comment.getAuthorName()),
                comment.getBody(),
                comment.getParentId(),
                comment.getStatus(),
                comment.getCreatedAt());
    }
}
