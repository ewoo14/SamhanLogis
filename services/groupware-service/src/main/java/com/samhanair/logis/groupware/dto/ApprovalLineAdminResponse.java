package com.samhanair.logis.groupware.dto;

import com.samhanair.logis.approval.ApprovalStatus;
import com.samhanair.logis.approval.ApprovalStepStatus;
import com.samhanair.logis.approval.StepType;
import com.samhanair.logis.groupware.domain.ApprovalLine;
import com.samhanair.logis.groupware.domain.ApprovalStep;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 관리자용 결재선 응답 DTO. admin 화면이 chain 전체를 시각화하므로 step 별 처리 상태 노출.
 *
 * <p>UUID 비공개 가드 — 사용자 화면 직접 노출이 아닌 admin 패널 한정. 일반 사용자 화면은
 * 사용자 표시명 (user-service lookup 결과) 으로 추가 매핑하는 것이 후속 슬라이스 책임.
 *
 * @param approvalId 결재선 식별자 (form hidden / 후속 호출 path)
 * @param approvalNo 결재문서번호 ({@code yyyy/MM/dd-N})
 * @param requesterId 요청자
 * @param requesterName 요청자 표시명
 * @param title 제목
 * @param content 본문
 * @param templateId 결재유형 템플릿 UUID
 * @param templateName 결재유형 이름
 * @param documentType 문서 레이아웃 docType
 * @param documentTemplateId 승인 당시 문서 레이아웃 template UUID(API 연동 전용, 미pin이면 null)
 * @param documentTemplateRevision 승인 당시 문서 레이아웃 revision(미pin이면 null)
 * @param documentTemplateDefaultPinned 승인 순간 ACTIVE 양식이 없어 기본 양식을 사용했다는 사실 각인
 * @param fieldValues 템플릿 동적 필드 값
 * @param status 종합 상태
 * @param steps chain 단계
 */
public record ApprovalLineAdminResponse(
        UUID approvalId,
        String approvalNo,
        UUID requesterId,
        String requesterName,
        String title,
        String content,
        UUID templateId,
        String templateName,
        String documentType,
        UUID documentTemplateId,
        Integer documentTemplateRevision,
        boolean documentTemplateDefaultPinned,
        Map<String, String> fieldValues,
        ApprovalStatus status,
        List<StepView> steps
) {

    /**
     * 결재 chain 단계 뷰.
     *
     * <p>USER 단계 — {@code approverId}/{@code approverName} = 지정 결재자.
     * GROUP 단계 — {@code approverGroupId} = 결재 그룹 UUID,
     * {@code approverId}/{@code approverName} = null(지정 개인 없음; 승인 후 실처리자는
     * 별도 audit 로 추적).
     * 그룹 표시명은 A2-G2 FE 가 {@code approverGroupId} 로 그룹 카탈로그에서 해석한다.
     *
     * @param sequence          chain 순서(0-base)
     * @param stepType          결재자 식별 방식
     * @param approverGroupId   GROUP 단계 권한그룹 UUID (USER 단계 null)
     * @param approverId        USER 단계 지정 결재자 UUID (GROUP 단계 null)
     * @param approverName      USER 단계 지정 결재자 표시명 (GROUP 단계 null)
     * @param status            단계 처리 상태
     * @param decidedAt         승인/반려 처리 시각
     * @param reason            반려 사유 (반려 시만 의미)
     */
    public record StepView(
            int sequence,
            StepType stepType,
            UUID approverGroupId,
            UUID approverId,
            String approverName,
            ApprovalStepStatus status,
            LocalDateTime decidedAt,
            String reason
    ) {

        static StepView from(ApprovalStep s, Map<UUID, String> nameMap) {
            boolean isGroup = s.getStepType() == StepType.GROUP;
            UUID approverId = isGroup ? null : s.getApproverUserId();
            return new StepView(
                    s.getSequence(),
                    s.getStepType(),
                    s.getApproverGroupId(),
                    approverId,
                    displayName(nameMap, approverId),
                    s.getStatus(),
                    s.getDecidedAt(),
                    s.getReason()
            );
        }
    }

    public static ApprovalLineAdminResponse from(ApprovalLine line) {
        return from(line, null, Map.of());
    }

    /** 결재선 + 템플릿 표시 정보로 응답 DTO 를 만든다. */
    public static ApprovalLineAdminResponse from(ApprovalLine line, String templateName,
                                                 Map<String, String> fieldValues) {
        return from(line, templateName, fieldValues, null);
    }

    /** 결재선 + 템플릿 표시 정보 + 사용자 표시명으로 응답 DTO 를 만든다. */
    public static ApprovalLineAdminResponse from(ApprovalLine line, String templateName,
                                                 Map<String, String> fieldValues,
                                                 Map<UUID, String> nameMap) {
        Map<UUID, String> safeNameMap = nameMap == null ? Map.of() : nameMap;
        List<StepView> steps = line.getStepsView().stream().map(step -> StepView.from(step, safeNameMap)).toList();
        return new ApprovalLineAdminResponse(line.getId(), line.getApprovalNo(), line.getRequesterId(),
                displayName(safeNameMap, line.getRequesterId()), line.getTitle(), line.getContent(),
                line.getTemplateId(), templateName, line.getDocumentType(),
                line.getDocumentTemplateId(), line.getDocumentTemplateRevision(),
                line.isDocumentTemplateDefaultPinned(),
                fieldValues == null ? Map.of() : fieldValues, line.getStatus(), steps);
    }

    private static String displayName(Map<UUID, String> nameMap, UUID userId) {
        if (nameMap == null || userId == null) {
            return null;
        }
        return nameMap.get(userId);
    }
}
