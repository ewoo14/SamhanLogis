package com.samhanair.logis.partnerorder.editrequest.web.dto;

import com.samhanair.logis.partnerorder.editrequest.domain.PartnerOrderEditRequest;
import com.samhanair.logis.common.security.ActorDisplayName;
import com.samhanair.logis.shared.realtime.editrequest.EditRequestStatus;
import com.samhanair.logis.shared.realtime.editrequest.EditRequestType;
import com.samhanair.logis.shared.realtime.editrequest.EditTargetRole;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 거래처 주문 수정/삭제 요청 응답 DTO — PR-H4b.
 *
 * <p><b>UUID 비공개 가드</b>: UUID 필드는 admin 작업 (id, partnerOrderId) 또는 FE 색상 hash
 * (requesterId/decidedById) 용도. 사용자 화면 노출은 *Name 필드만 사용.
 */
public record PartnerOrderEditRequestResponse(
        UUID id,
        UUID partnerOrderId,
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

    public static PartnerOrderEditRequestResponse from(PartnerOrderEditRequest request) {
        return new PartnerOrderEditRequestResponse(
                request.getId(),
                request.getPartnerOrderId(),
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
