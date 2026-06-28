package com.samhanair.logis.approval;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ApprovalLineBaseTest {

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

    /** steps 컬렉션을 자체 보유하는 테스트 전용 concrete(= concrete @Entity 역할 모사). */
    static class FakeLine extends ApprovalLineBase {
        final List<FakeStep> steps = new ArrayList<>();
        static FakeLine open(String no, UUID requester, String title) {
            FakeLine l = new FakeLine();
            l.initBase(no, requester, title);
            return l;
        }
        FakeStep appendUser(UUID approverUserId) {
            FakeStep s = FakeStep.user(approverUserId, steps.size());
            steps.add(s);
            return s;
        }
        FakeStep appendGroup(UUID approverGroupId, String requiredPageCode) {
            FakeStep s = FakeStep.group(approverGroupId, requiredPageCode, steps.size());
            steps.add(s);
            return s;
        }
        @Override
        protected List<? extends ApprovalStepBase> stepsView() {
            return steps;
        }
    }

    @Test
    void open_은_PENDING_으로_시작하고_currentStep_은_첫_PENDING_이다() {
        UUID requester = UUID.randomUUID();
        UUID a1 = UUID.randomUUID();
        UUID a2 = UUID.randomUUID();
        FakeLine line = FakeLine.open("2026/06/21-1", requester, "지출결의");
        line.appendUser(a1);
        line.appendUser(a2);
        assertThat(line.getStatus()).isEqualTo(ApprovalStatus.PENDING);
        assertThat(line.currentStep().getApproverUserId()).isEqualTo(a1);
    }

    @Test
    void approve_순차_종합전이_IN_PROGRESS_그리고_APPROVED() {
        UUID requester = UUID.randomUUID();
        UUID a1 = UUID.randomUUID();
        UUID a2 = UUID.randomUUID();
        FakeLine line = FakeLine.open("2026/06/21-1", requester, "지출결의");
        line.appendUser(a1);
        line.appendUser(a2);

        line.approve(a1);
        assertThat(line.getStatus()).isEqualTo(ApprovalStatus.IN_PROGRESS);
        assertThat(line.currentStep().getApproverUserId()).isEqualTo(a2);

        line.approve(a2);
        assertThat(line.getStatus()).isEqualTo(ApprovalStatus.APPROVED);
        assertThat(line.currentStep()).isNull();
    }

    @Test
    void 현재단계_결재자가_아니면_거부한다() {
        UUID requester = UUID.randomUUID();
        UUID a1 = UUID.randomUUID();
        FakeLine line = FakeLine.open("2026/06/21-1", requester, "지출결의");
        line.appendUser(a1);
        assertThatThrownBy(() -> line.approve(UUID.randomUUID()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("결재자가 아닙니다");
    }

    @Test
    void approve_는_GROUP단계에서_그룹멤버십_컨텍스트를_사용한다() {
        UUID requester = UUID.randomUUID();
        UUID actor = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        FakeLine line = FakeLine.open("2026/06/21-1", requester, "지출결의");
        line.appendGroup(groupId, "groupware.approvals");

        assertThatThrownBy(() -> line.approve(actor))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("결재자가 아닙니다");

        line.approve(actor, Set.of(groupId), Set.of());

        assertThat(line.getStatus()).isEqualTo(ApprovalStatus.APPROVED);
        assertThat(line.steps.get(0).getApprovedByUserId()).isEqualTo(actor);
    }

    @Test
    void reject_은_즉시_REJECTED_이고_종료상태는_재처리_거부() {
        UUID requester = UUID.randomUUID();
        UUID a1 = UUID.randomUUID();
        FakeLine line = FakeLine.open("2026/06/21-1", requester, "지출결의");
        line.appendUser(a1);
        line.reject(a1, "보완 필요");
        assertThat(line.getStatus()).isEqualTo(ApprovalStatus.REJECTED);
        assertThatThrownBy(() -> line.approve(a1))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("이미 종료된");
    }

    @Test
    void withdraw_는_요청자_본인만_가능하다() {
        UUID requester = UUID.randomUUID();
        UUID a1 = UUID.randomUUID();
        FakeLine line = FakeLine.open("2026/06/21-1", requester, "지출결의");
        line.appendUser(a1);
        assertThatThrownBy(() -> line.withdraw(UUID.randomUUID()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("요청자 본인만");
        line.withdraw(requester);
        assertThat(line.getStatus()).isEqualTo(ApprovalStatus.WITHDRAWN);
    }
}
