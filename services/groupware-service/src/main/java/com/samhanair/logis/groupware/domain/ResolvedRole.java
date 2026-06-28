package com.samhanair.logis.groupware.domain;

import com.samhanair.logis.approval.StepType;
import java.util.UUID;

/**
 * 중앙 결재라인 config 를 그룹웨어 결재 단계로 인스턴스화하기 전에 정규화한 역할 값.
 *
 * <p>compact ctor 불변식:
 * <ul>
 *   <li>{@link StepType#USER} — {@code approverUserId} 필수(null 금지)</li>
 *   <li>{@link StepType#GROUP} — {@code approverGroupId} 필수(null 금지)</li>
 *   <li>{@link StepType#CREATOR} — user/group 필드 모두 null 허용</li>
 * </ul>
 *
 * @param sequence 역할 원 순서
 * @param stepType 결재자 식별 방식
 * @param approverUserId USER 단계 결재자. CREATOR/GROUP 에서는 null 가능
 * @param approverGroupId GROUP 단계 권한그룹. USER/CREATOR 에서는 null 가능
 * @param requiredPageCode GROUP 단계 보조 page-code(표시/설정 저장용, 결재 판정 미사용)
 */
public record ResolvedRole(
        int sequence,
        StepType stepType,
        UUID approverUserId,
        UUID approverGroupId,
        String requiredPageCode
) {
    /**
     * compact ctor — stepType 별 필수 식별자를 검증하고 requiredPageCode 를 정규화한다.
     */
    public ResolvedRole {
        if (stepType == null) {
            throw new IllegalArgumentException("stepType 필수");
        }
        if (stepType == StepType.USER && approverUserId == null) {
            throw new IllegalArgumentException("USER 단계는 approverUserId 가 필수입니다");
        }
        if (stepType == StepType.GROUP && approverGroupId == null) {
            throw new IllegalArgumentException("GROUP 단계는 approverGroupId 가 필수입니다");
        }
        requiredPageCode = requiredPageCode == null || requiredPageCode.isBlank()
                ? null
                : requiredPageCode.trim();
    }
}
