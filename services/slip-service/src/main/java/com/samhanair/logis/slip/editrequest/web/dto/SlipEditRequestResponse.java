package com.samhanair.logis.slip.editrequest.web.dto;

import com.samhanair.logis.common.security.ActorDisplayName;
import com.samhanair.logis.slip.editrequest.domain.SlipEditRequest;
import com.samhanair.logis.slip.editrequest.domain.SlipEditRequestStatus;
import com.samhanair.logis.slip.editrequest.domain.SlipEditRequestType;
import com.samhanair.logis.slip.editrequest.domain.SlipEditTargetRole;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 슬립 수정/삭제 요청 응답 DTO — PR-H3.
 *
 * <p><b>UUID 비공개 가드</b> ({@code feedback_uuid_no_user_visibility}): UUID 필드는 admin 작업
 * (id, slipId) 또는 FE 색상 hash (requesterId/decidedById) 용도. 사용자 화면 노출은 *Name 필드만 사용.
 *
 * @param id 요청 PK (admin 작업용)
 * @param slipId 소속 슬립 UUID
 * @param requestType EDIT / DELETE
 * @param status PENDING / APPROVED / REJECTED / EXPIRED
 * @param reason 요청 사유
 * @param requesterId 요청자 UUID (FE 색상 hash 용 — 직접 표시 금지)
 * @param requesterName 요청자 표시명 (사용자 화면 노출)
 * @param targetRole 수락 권한자 그룹
 * @param decidedById 결정자 UUID (선택)
 * @param decidedByName 결정자 표시명 (사용자 화면 노출)
 * @param decisionReason 거절 사유 / 수락 메모
 * @param requestedAt 요청 시각
 * @param decidedAt 결정 시각
 * @param expiresAt 자동 만료 시각
 */
public record SlipEditRequestResponse(
        UUID id,
        UUID slipId,
        SlipEditRequestType requestType,
        SlipEditRequestStatus status,
        String reason,
        UUID requesterId,
        String requesterName,
        SlipEditTargetRole targetRole,
        UUID decidedById,
        String decidedByName,
        String decisionReason,
        LocalDateTime requestedAt,
        LocalDateTime decidedAt,
        LocalDateTime expiresAt
) {

    public static SlipEditRequestResponse from(SlipEditRequest request) {
        return new SlipEditRequestResponse(
                request.getId(),
                request.getSlipId(),
                request.getRequestType(),
                request.getStatus(),
                request.getReason(),
                request.getRequesterId(),
                ActorDisplayName.resolveNullable(
                        request.getRequesterId() == null ? null : request.getRequesterId().toString(),
                        request.getRequesterName()),
                request.getTargetRole(),
                request.getDecidedById(),
                ActorDisplayName.resolveNullable(
                        request.getDecidedById() == null ? null : request.getDecidedById().toString(),
                        request.getDecidedByName()),
                request.getDecisionReason(),
                request.getRequestedAt(),
                request.getDecidedAt(),
                request.getExpiresAt()
        );
    }
}
