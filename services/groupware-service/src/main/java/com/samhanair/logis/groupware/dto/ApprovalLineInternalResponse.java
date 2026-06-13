package com.samhanair.logis.groupware.dto;

import com.samhanair.logis.groupware.domain.ApprovalLine;
import com.samhanair.logis.groupware.domain.ApprovalStatus;
import java.util.UUID;

/**
 * Internal endpoint 응답 — 형제 service (예: notification-service 가 결재 상태 알림 발송 시
 * 본 endpoint 호출) 가 결재선 단건 lookup.
 *
 * <p>UUID 비공개 가드 — 본 endpoint 응답을 그대로 사용자 화면에 노출하지 않는다.
 * 호출 service 가 별도 user lookup 으로 displayName 보강.
 *
 * @param approvalId 결재선 식별자 (caller 외래 키 보관)
 * @param approvalNo 결재문서번호
 * @param requesterId 요청자 user UUID
 * @param title 제목
 * @param status 종합 상태
 */
public record ApprovalLineInternalResponse(
        UUID approvalId,
        String approvalNo,
        UUID requesterId,
        String title,
        ApprovalStatus status
) {

    public static ApprovalLineInternalResponse from(ApprovalLine line) {
        return new ApprovalLineInternalResponse(line.getId(), line.getApprovalNo(), line.getRequesterId(),
                line.getTitle(), line.getStatus());
    }
}
