package com.samhanair.logis.groupware.dto;

import com.samhanair.logis.approval.ApprovalStatus;
import com.samhanair.logis.approval.ApprovalStepStatus;
import com.samhanair.logis.approval.StepType;
import java.util.List;

/** Claude 도구용 결재 요약. 식별 UUID·본문·내부 필드는 포함하지 않는다. */
public record ClaudeApprovalSummary(
        String approvalNo,
        String requesterName,
        String title,
        String documentType,
        ApprovalStatus status,
        List<StepSummary> steps) {
    public record StepSummary(int sequence, StepType type, String approverName, ApprovalStepStatus status) {}
}
