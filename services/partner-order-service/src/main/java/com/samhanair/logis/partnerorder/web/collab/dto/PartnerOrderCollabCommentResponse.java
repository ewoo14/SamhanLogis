package com.samhanair.logis.partnerorder.web.collab.dto;

import com.samhanair.logis.collab.CollabCommentStatus;
import com.samhanair.logis.partnerorder.collab.PartnerOrderCollabComment;
import com.samhanair.logis.common.security.ActorDisplayName;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 주문 협업 댓글 응답 DTO.
 *
 * <p>UUID 비공개 가드: authorId 는 응답하지 않는다. id/parentId 는 댓글 key 용도로만 제공하고,
 * 사용자 표시 식별자는 authorName 만 사용한다.
 */
public record PartnerOrderCollabCommentResponse(
        UUID id,
        String anchor,
        String authorName,
        String body,
        UUID parentId,
        CollabCommentStatus status,
        LocalDateTime createdAt
) {

    public static PartnerOrderCollabCommentResponse from(PartnerOrderCollabComment comment) {
        return new PartnerOrderCollabCommentResponse(
                comment.getId(),
                comment.getAnchor(),
                ActorDisplayName.resolve(comment.getAuthorId() == null ? null : comment.getAuthorId().toString(), comment.getAuthorName()),
                comment.getBody(),
                comment.getParentId(),
                comment.getStatus(),
                comment.getCreatedAt());
    }
}
