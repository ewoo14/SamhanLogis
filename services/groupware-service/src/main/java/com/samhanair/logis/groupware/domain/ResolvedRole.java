package com.samhanair.logis.groupware.domain;

import com.samhanair.logis.approval.StepType;
import java.util.UUID;

/**
 * 중앙 결재라인 config 를 그룹웨어 결재 단계로 인스턴스화하기 전에 정규화한 역할 값.
 *
 * @param sequence 역할 원 순서
 * @param stepType 결재자 식별 방식
 * @param approverUserId USER 단계 결재자. CREATOR/GROUP 에서는 null 가능
 * @param approverGroupId GROUP 단계 권한그룹
 * @param requiredPageCode GROUP 단계 보조 page-code
 */
public record ResolvedRole(
        int sequence,
        StepType stepType,
        UUID approverUserId,
        UUID approverGroupId,
        String requiredPageCode
) {
    public ResolvedRole {
        if (stepType == null) {
            throw new IllegalArgumentException("stepType 필수");
        }
        requiredPageCode = requiredPageCode == null || requiredPageCode.isBlank()
                ? null
                : requiredPageCode.trim();
    }
}
