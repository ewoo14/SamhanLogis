package com.samhanair.logis.accounting.editrequest.web.dto;

import com.samhanair.logis.accounting.editrequest.domain.AccountingEditRequest;
import com.samhanair.logis.common.security.ActorDisplayName;
import com.samhanair.logis.shared.realtime.editrequest.EditRequestStatus;
import com.samhanair.logis.shared.realtime.editrequest.EditRequestType;
import com.samhanair.logis.shared.realtime.editrequest.EditTargetRole;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 회계 수정 요청 응답 DTO — PR-H4b.
 *
 * <p>UUID 비공개 가드: requesterId / decidedById 는 FE 색상 hash 결정성 용도. 화면 표시는
 * requesterName / decidedByName 만 사용.
 */
public record AccountingEditRequestResponse(
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
    public static AccountingEditRequestResponse from(AccountingEditRequest req) {
        return new AccountingEditRequestResponse(
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
