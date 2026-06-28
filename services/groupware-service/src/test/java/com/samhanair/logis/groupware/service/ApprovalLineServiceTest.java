package com.samhanair.logis.groupware.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.approval.ApprovalStatus;
import com.samhanair.logis.approval.ApprovalStepStatus;
import com.samhanair.logis.approval.StepType;
import com.samhanair.logis.groupware.domain.ApprovalLine;
import com.samhanair.logis.groupware.domain.ApprovalStep;
import com.samhanair.logis.groupware.domain.ResolvedRole;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * 결재선 도메인 단위 테스트 — JPA / Spring 부팅 없음. JDK 17 한글 path 환경에서도 PASS.
 *
 * <p>커버 8 case:
 * <ol>
 *   <li>open + appendStep 정상 흐름 (chain 순서 검증)</li>
 *   <li>1번째 step 승인 → IN_PROGRESS</li>
 *   <li>모든 step 승인 → APPROVED</li>
 *   <li>1명 반려 → REJECTED</li>
 *   <li>요청자 본인 결재자 차단</li>
 *   <li>요청자 회수 (PENDING / IN_PROGRESS 모두 가능)</li>
 *   <li>종료된 결재 재호출 차단 (APPROVED 상태 추가 승인 거부)</li>
 *   <li>chain 순서 — 1번째 처리 전 2번째 결재자 호출 거부</li>
 * </ol>
 */
class ApprovalLineServiceTest {

    @Test
    void open_then_appendStep_creates_chain_in_sequence_order() {
        UUID requester = UUID.randomUUID();
        ApprovalLine line = open(requester, "휴가", "본문");

        line.appendStep(UUID.randomUUID());
        line.appendStep(UUID.randomUUID());

        assertThat(line.getStatus()).isEqualTo(ApprovalStatus.PENDING);
        assertThat(line.getStepsView()).hasSize(2);
        assertThat(line.getStepsView().get(0).getSequence()).isEqualTo(0);
        assertThat(line.getStepsView().get(1).getSequence()).isEqualTo(1);
    }

    @Test
    void instantiateFromRoles_은_CREATOR_USER_GROUP을_순서대로_단계화한다() {
        UUID requester = UUID.randomUUID();
        UUID reviewer = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        ApprovalLine line = open(requester, "지출", "본문");

        line.instantiateFromRoles(List.of(
                new ResolvedRole(0, StepType.CREATOR, null, null, null),
                new ResolvedRole(1, StepType.USER, reviewer, null, null),
                new ResolvedRole(2, StepType.GROUP, null, groupId, "groupware.approvals")));

        assertThat(line.getStepsView()).hasSize(3);
        assertThat(line.getStepsView().get(0).getStepType()).isEqualTo(StepType.USER);
        assertThat(line.getStepsView().get(0).getApproverUserId()).isEqualTo(requester);
        assertThat(line.getStepsView().get(1).getApproverUserId()).isEqualTo(reviewer);
        assertThat(line.getStepsView().get(2).getStepType()).isEqualTo(StepType.GROUP);
        assertThat(line.getStepsView().get(2).getApproverGroupId()).isEqualTo(groupId);
        assertThat(line.getStepsView()).extracting(ApprovalStep::getSequence)
                .containsExactly(0, 1, 2);
    }

    @Test
    void appendGroupStep_은_GROUP단계를_추가하고_그룹멤버_승인을_허용한다() {
        UUID requester = UUID.randomUUID();
        UUID actor = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        ApprovalLine line = open(requester, "결재", null);

        line.appendGroupStep(groupId, "groupware.approvals");

        assertThat(line.currentStep().getStepType()).isEqualTo(StepType.GROUP);
        assertThatThrownBy(() -> line.approve(actor))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("현재 결재 단계");

        line.approve(actor, Set.of(groupId), Set.of());

        assertThat(line.getStatus()).isEqualTo(ApprovalStatus.APPROVED);
    }

    @Test
    void approve_first_step_transitions_to_in_progress() {
        UUID requester = UUID.randomUUID();
        UUID a1 = UUID.randomUUID();
        UUID a2 = UUID.randomUUID();
        ApprovalLine line = open(requester, "결재", null);
        line.appendStep(a1);
        line.appendStep(a2);

        line.approve(a1);

        assertThat(line.getStatus()).isEqualTo(ApprovalStatus.IN_PROGRESS);
        assertThat(line.getStepsView().get(0).getStatus()).isEqualTo(ApprovalStepStatus.APPROVED);
        assertThat(line.getStepsView().get(1).getStatus()).isEqualTo(ApprovalStepStatus.PENDING);
    }

    @Test
    void approve_all_steps_transitions_to_approved() {
        UUID requester = UUID.randomUUID();
        UUID a1 = UUID.randomUUID();
        UUID a2 = UUID.randomUUID();
        ApprovalLine line = open(requester, "결재", null);
        line.appendStep(a1);
        line.appendStep(a2);

        line.approve(a1);
        line.approve(a2);

        assertThat(line.getStatus()).isEqualTo(ApprovalStatus.APPROVED);
        assertThat(line.getStepsView()).allMatch(s -> s.getStatus() == ApprovalStepStatus.APPROVED);
    }

    @Test
    void reject_first_step_terminates_to_rejected() {
        UUID requester = UUID.randomUUID();
        UUID a1 = UUID.randomUUID();
        UUID a2 = UUID.randomUUID();
        ApprovalLine line = open(requester, "결재", null);
        line.appendStep(a1);
        line.appendStep(a2);

        line.reject(a1, "사유 미흡");

        assertThat(line.getStatus()).isEqualTo(ApprovalStatus.REJECTED);
        assertThat(line.getStepsView().get(0).getStatus()).isEqualTo(ApprovalStepStatus.REJECTED);
        assertThat(line.getStepsView().get(0).getReason()).isEqualTo("사유 미흡");
    }

    @Test
    void appendStep_blocks_requester_self_as_approver() {
        UUID requester = UUID.randomUUID();
        ApprovalLine line = open(requester, "결재", null);

        assertThatThrownBy(() -> line.appendStep(requester))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("요청자 본인");
    }

    @Test
    void withdraw_by_requester_terminates_to_withdrawn() {
        UUID requester = UUID.randomUUID();
        UUID a1 = UUID.randomUUID();
        ApprovalLine line = open(requester, "결재", null);
        line.appendStep(a1);

        line.withdraw(requester);

        assertThat(line.getStatus()).isEqualTo(ApprovalStatus.WITHDRAWN);
    }

    @Test
    void approve_after_terminal_state_is_rejected() {
        UUID requester = UUID.randomUUID();
        UUID a1 = UUID.randomUUID();
        ApprovalLine line = open(requester, "결재", null);
        line.appendStep(a1);
        line.approve(a1); // chain 종료 → APPROVED

        assertThatThrownBy(() -> line.approve(a1))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("이미 종료된");
    }

    @Test
    void approve_out_of_order_blocks_second_step_when_first_pending() {
        UUID requester = UUID.randomUUID();
        UUID a1 = UUID.randomUUID();
        UUID a2 = UUID.randomUUID();
        ApprovalLine line = open(requester, "결재", null);
        line.appendStep(a1);
        line.appendStep(a2);

        // 1번째 결재 처리 전에 2번째 결재자 호출 → currentStep 의 approverId 와 불일치
        assertThatThrownBy(() -> line.approve(a2))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("현재 결재 단계");

        // currentStep snapshot 도 1번째 step (PENDING) 인지 확인
        ApprovalStep current = line.currentStep();
        assertThat(current).isNotNull();
        assertThat(current.getApproverUserId()).isEqualTo(a1);
    }

    private ApprovalLine open(UUID requester, String title, String content) {
        return ApprovalLine.open("2099/01/01-1", requester, title, content);
    }
}
