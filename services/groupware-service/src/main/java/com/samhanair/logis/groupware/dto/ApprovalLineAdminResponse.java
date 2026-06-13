package com.samhanair.logis.groupware.dto;

import com.samhanair.logis.groupware.domain.ApprovalLine;
import com.samhanair.logis.groupware.domain.ApprovalStatus;
import com.samhanair.logis.groupware.domain.ApprovalStep;
import com.samhanair.logis.groupware.domain.ApprovalStepStatus;
import java.time.LocalDateTime;
import java.util.List;
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
 * @param title 제목
 * @param content 본문
 * @param status 종합 상태
 * @param steps chain 단계
 */
public record ApprovalLineAdminResponse(
        UUID approvalId,
        String approvalNo,
        UUID requesterId,
        String title,
        String content,
        ApprovalStatus status,
        List<StepView> steps
) {

    public record StepView(
            int sequence,
            UUID approverId,
            ApprovalStepStatus status,
            LocalDateTime decidedAt,
            String reason
    ) {

        static StepView from(ApprovalStep s) {
            return new StepView(s.getSequence(), s.getApproverId(), s.getStatus(),
                    s.getDecidedAt(), s.getReason());
        }
    }

    public static ApprovalLineAdminResponse from(ApprovalLine line) {
        List<StepView> steps = line.getStepsView().stream().map(StepView::from).toList();
        return new ApprovalLineAdminResponse(line.getId(), line.getApprovalNo(), line.getRequesterId(), line.getTitle(),
                line.getContent(), line.getStatus(), steps);
    }
}
