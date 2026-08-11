package com.samhanair.logis.partner.editrequest.web.dto;

import com.samhanair.logis.partner.editrequest.domain.PartnerEditRequest;
import com.samhanair.logis.common.security.ActorDisplayName;
import com.samhanair.logis.shared.realtime.editrequest.EditRequestStatus;
import com.samhanair.logis.shared.realtime.editrequest.EditRequestType;
import com.samhanair.logis.shared.realtime.editrequest.EditTargetRole;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 거래처 수정 요청 응답 DTO — PR-H4b.
 *
 * <p>UUID 비공개 가드: requesterId / decidedById 는 FE 색상 hash 결정성용.
 */
public record PartnerEditRequestResponse(
        UUID requestId,
        UUID entityId,
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
    public static PartnerEditRequestResponse from(PartnerEditRequest req) {
        return new PartnerEditRequestResponse(
                req.getId(),
                req.getEntityId(),
                req.getRequestType(),
                req.getStatus(),
                req.getReason(),
                req.getRequesterId(),
                ActorDisplayName.resolve(req.getRequesterId() == null ? null : req.getRequesterId().toString(), req.getRequesterName()),
                req.getTargetRole(),
                req.getDecidedById(),
                ActorDisplayName.resolve(req.getDecidedById() == null ? null : req.getDecidedById().toString(), req.getDecidedByName()),
                req.getDecisionReason(),
                req.getRequestedAt(),
                req.getDecidedAt(),
                req.getExpiresAt()
        );
    }
}
