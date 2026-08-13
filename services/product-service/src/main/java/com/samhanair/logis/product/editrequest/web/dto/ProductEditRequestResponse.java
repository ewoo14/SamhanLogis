package com.samhanair.logis.product.editrequest.web.dto;

import com.samhanair.logis.product.editrequest.domain.ProductEditRequest;
import com.samhanair.logis.common.security.ActorDisplayName;
import com.samhanair.logis.shared.realtime.editrequest.EditRequestStatus;
import com.samhanair.logis.shared.realtime.editrequest.EditRequestType;
import com.samhanair.logis.shared.realtime.editrequest.EditTargetRole;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 제품 수정/삭제 요청 응답 DTO — PR-H4b.
 */
public record ProductEditRequestResponse(
        UUID id,
        UUID productId,
        EditRequestType requestType,
        EditRequestStatus status,
        String reason,
        UUID requesterId,
        String requesterName,
        EditTargetRole targetRole,
        UUID decidedById,
        String decidedByName,
        String decisionReason,
        LocalDateTime requestedAt,
        LocalDateTime decidedAt,
        LocalDateTime expiresAt
) {

    public static ProductEditRequestResponse from(ProductEditRequest request) {
        return new ProductEditRequestResponse(
                request.getId(),
                request.getProductId(),
                request.getRequestType(),
                request.getStatus(),
                request.getReason(),
                request.getRequesterId(),
                ActorDisplayName.resolve(request.getRequesterId() == null ? null : request.getRequesterId().toString(), request.getRequesterName()),
                request.getTargetRole(),
                request.getDecidedById(),
                ActorDisplayName.resolve(request.getDecidedById() == null ? null : request.getDecidedById().toString(), request.getDecidedByName()),
                request.getDecisionReason(),
                request.getRequestedAt(),
                request.getDecidedAt(),
                request.getExpiresAt()
        );
    }
}
