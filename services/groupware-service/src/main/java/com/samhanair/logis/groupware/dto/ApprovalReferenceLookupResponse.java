package com.samhanair.logis.groupware.dto;

import com.samhanair.logis.approval.ApprovalStatus;
import com.samhanair.logis.groupware.domain.ApprovalLine;

/** 업무문서에서 역방향으로 확인하는 연결 결재 요약. */
public record ApprovalReferenceLookupResponse(
        String approvalNo,
        String title,
        ApprovalStatus status
) {

    /** 결재선에서 사용자 노출용 참조 요약을 만든다. UUID는 반환하지 않는다. */
    public static ApprovalReferenceLookupResponse from(ApprovalLine approval) {
        return new ApprovalReferenceLookupResponse(
                approval.getApprovalNo(), approval.getTitle(), approval.getStatus());
    }
}
