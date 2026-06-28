package com.samhanair.logis.auth.web.dto;

import com.samhanair.logis.approval.StepType;
import java.util.List;
import java.util.UUID;

/**
 * 서비스 간 결재선 인스턴스화용 역할 응답.
 *
 * @param sequence 역할 순서
 * @param label 역할 라벨
 * @param stepType 결재자 식별 방식
 * @param approverGroupId GROUP 결재 권한그룹
 * @param approverUserIds USER 결재자 후보
 * @param requiredPageCode GROUP 단계 보조 page-code
 * @param required 필수 단계 여부
 */
public record ApprovalLineRoleResolutionItem(
        int sequence,
        String label,
        StepType stepType,
        UUID approverGroupId,
        List<UUID> approverUserIds,
        String requiredPageCode,
        boolean required
) {
    public ApprovalLineRoleResolutionItem {
        approverUserIds = approverUserIds == null ? List.of() : List.copyOf(approverUserIds);
    }
}
