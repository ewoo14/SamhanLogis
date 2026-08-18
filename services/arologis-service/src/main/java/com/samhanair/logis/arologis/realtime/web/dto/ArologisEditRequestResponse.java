package com.samhanair.logis.arologis.realtime.web.dto;

import com.samhanair.logis.arologis.realtime.domain.ArologisEditRequest;
import com.samhanair.logis.common.security.ActorDisplayName;
import com.samhanair.logis.shared.realtime.editrequest.EditRequestStatus;
import com.samhanair.logis.shared.realtime.editrequest.EditRequestType;
import com.samhanair.logis.shared.realtime.editrequest.EditTargetRole;
import java.time.LocalDateTime;

/**
 * arologis 수정 요청 응답 DTO — PR-H4b (Phase 12 Step 4b).
 */
public record ArologisEditRequestResponse(
        String requesterName,
        EditRequestType requestType,
        String reason,
        EditRequestStatus status,
        EditTargetRole targetRole,
        String decidedByName,
        String decisionReason,
        LocalDateTime requestedAt,
        LocalDateTime decidedAt,
        LocalDateTime expiresAt) {

    public static ArologisEditRequestResponse from(ArologisEditRequest r) {
        return new ArologisEditRequestResponse(
                ActorDisplayName.resolve(r.getRequesterId() == null ? null : r.getRequesterId().toString(), r.getRequesterName()),
                r.getRequestType(),
                r.getReason(),
                r.getStatus(),
                r.getTargetRole(),
                ActorDisplayName.resolve(r.getDecidedById() == null ? null : r.getDecidedById().toString(), r.getDecidedByName()),
                r.getDecisionReason(),
                r.getRequestedAt(),
                r.getDecidedAt(),
                r.getExpiresAt());
    }
}
