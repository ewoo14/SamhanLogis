package com.samhanair.logis.approval;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ApprovalStepBaseTest {

    /** DB 없이 베이스 로직만 검증하기 위한 테스트 전용 concrete. */
    static class FakeStep extends ApprovalStepBase {
        static FakeStep user(UUID approverUserId, int sequence) {
            FakeStep s = new FakeStep();
            s.initUserStep(approverUserId, sequence);
            return s;
        }

        static FakeStep group(UUID approverGroupId, String requiredPageCode, int sequence) {
            FakeStep s = new FakeStep();
            s.initGroupStep(approverGroupId, requiredPageCode, sequence);
            return s;
        }
    }

    @Test
    void initUserStep_은_USER타입_PENDING_으로_생성한다() {
        UUID approver = UUID.randomUUID();
        FakeStep step = FakeStep.user(approver, 0);
        assertThat(step.getStepType()).isEqualTo(StepType.USER);
        assertThat(step.getApproverUserId()).isEqualTo(approver);
        assertThat(step.getSequence()).isZero();
        assertThat(step.getStatus()).isEqualTo(ApprovalStepStatus.PENDING);
        assertThat(step.getApprovedByUserId()).isNull();
    }

    @Test
    void matchesActor_은_USER모드에서_approverUserId_동일성으로_판정한다() {
        UUID approver = UUID.randomUUID();
        FakeStep step = FakeStep.user(approver, 0);
        assertThat(step.matchesActor(approver)).isTrue();
        assertThat(step.matchesActor(UUID.randomUUID())).isFalse();
    }

    @Test
    void initGroupStep_은_GROUP타입_PENDING_으로_생성한다() {
        UUID groupId = UUID.randomUUID();
        FakeStep step = FakeStep.group(groupId, "groupware.approvals", 1);

        assertThat(step.getStepType()).isEqualTo(StepType.GROUP);
        assertThat(step.getApproverGroupId()).isEqualTo(groupId);
        assertThat(step.getRequiredPageCode()).isEqualTo("groupware.approvals");
        assertThat(step.getSequence()).isEqualTo(1);
        assertThat(step.getStatus()).isEqualTo(ApprovalStepStatus.PENDING);
    }

    @Test
    void matchesActor_은_GROUP모드에서_그룹멤버십_또는_pageCode로_판정한다() {
        UUID actor = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        FakeStep step = FakeStep.group(groupId, "groupware.approvals", 0);

        assertThat(step.matchesActor(actor, Set.of(groupId), Set.of())).isTrue();
        assertThat(step.matchesActor(actor, Set.of(), Set.of("groupware.approvals"))).isTrue();
        assertThat(step.matchesActor(actor, Set.of(UUID.randomUUID()), Set.of("other.page"))).isFalse();
        assertThat(step.matchesActor(actor)).isFalse();
    }

    @Test
    void approve_은_APPROVED전이_실승인자_처리시각을_기록한다() {
        UUID approver = UUID.randomUUID();
        FakeStep step = FakeStep.user(approver, 0);
        step.approve(approver);
        assertThat(step.getStatus()).isEqualTo(ApprovalStepStatus.APPROVED);
        assertThat(step.getApprovedByUserId()).isEqualTo(approver);
        assertThat(step.getDecidedAt()).isNotNull();
    }

    @Test
    void reject_은_REJECTED전이_사유를_기록한다() {
        UUID approver = UUID.randomUUID();
        FakeStep step = FakeStep.user(approver, 0);
        step.reject(approver, "보완 필요");
        assertThat(step.getStatus()).isEqualTo(ApprovalStepStatus.REJECTED);
        assertThat(step.getReason()).isEqualTo("보완 필요");
        assertThat(step.getDecidedAt()).isNotNull();
    }

    @Test
    void 이미_처리된_단계는_재처리를_거부한다() {
        UUID approver = UUID.randomUUID();
        FakeStep step = FakeStep.user(approver, 0);
        step.approve(approver);
        assertThatThrownBy(() -> step.approve(approver))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("이미 처리된");
    }
}
