package com.samhanair.logis.groupware.dto;

import jakarta.validation.constraints.Size;
import java.util.UUID;

/**
 * 결재 승인/반려 요청 DTO.
 *
 * @param approverId actor=X-User-Id 헤더, 본문 approverId 미사용(deprecated)
 * @param reason 반려 사유 (반려 시 사용, 승인 시 무시)
 */
public record ApprovalDecisionRequest(
        UUID approverId,
        @Size(max = 500) String reason
) {
}
