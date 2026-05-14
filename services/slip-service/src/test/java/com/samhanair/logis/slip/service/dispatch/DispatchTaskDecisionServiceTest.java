package com.samhanair.logis.slip.service.dispatch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.dispatch.DispatchTask;
import com.samhanair.logis.slip.domain.dispatch.DispatchTaskStatus;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroup;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroupSlip;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleType;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchTaskRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchVehicleGroupRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchVehicleGroupSlipRepository;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * {@link DispatchTaskModificationDecisionService} + {@link DispatchTaskCancellationDecisionService}
 * 단위 검증 — Phase C BE Task B5.
 */
@ExtendWith(MockitoExtension.class)
class DispatchTaskDecisionServiceTest {

    @Mock DispatchTaskRepository taskRepo;
    @Mock DispatchVehicleGroupRepository groupRepo;
    @Mock DispatchVehicleGroupSlipRepository slipMapRepo;
    @Mock SlipRepository slipRepo;
    @Mock NotificationClient notificationClient;

    // ---------- Modification ----------

    @Test
    void modification_accept_marks_MODIFICATION_ACCEPTED() throws Exception {
        DispatchTaskModificationDecisionService svc = new DispatchTaskModificationDecisionService(
                taskRepo, notificationClient);
        UUID taskId = UUID.randomUUID();
        DispatchTask task = dispatchedTask(taskId, UUID.randomUUID());
        task.markModificationRequested("슬립 추가");
        when(taskRepo.findById(taskId)).thenReturn(Optional.of(task));

        DispatchTask res = svc.accept(taskId, "arologis-master");
        assertThat(res.getStatus()).isEqualTo(DispatchTaskStatus.MODIFICATION_ACCEPTED);
        assertThat(res.getModificationDecidedAt()).isNotNull();
    }

    @Test
    void modification_accept_from_DISPATCHED_throws_CONFLICT() throws Exception {
        DispatchTaskModificationDecisionService svc = new DispatchTaskModificationDecisionService(
                taskRepo, notificationClient);
        UUID taskId = UUID.randomUUID();
        DispatchTask task = dispatchedTask(taskId, UUID.randomUUID());  // DISPATCHED 그대로
        when(taskRepo.findById(taskId)).thenReturn(Optional.of(task));

        assertThatThrownBy(() -> svc.accept(taskId, "x"))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void modification_reject_marks_MODIFICATION_REJECTED_with_reason() throws Exception {
        DispatchTaskModificationDecisionService svc = new DispatchTaskModificationDecisionService(
                taskRepo, notificationClient);
        UUID taskId = UUID.randomUUID();
        DispatchTask task = dispatchedTask(taskId, UUID.randomUUID());
        task.markModificationRequested(null);
        when(taskRepo.findById(taskId)).thenReturn(Optional.of(task));

        DispatchTask res = svc.reject(taskId, "운영 불가 — 기사 일정 충돌", "arologis-master");
        assertThat(res.getStatus()).isEqualTo(DispatchTaskStatus.MODIFICATION_REJECTED);
        assertThat(res.getRejectionReason()).isEqualTo("운영 불가 — 기사 일정 충돌");
    }

    @Test
    void modification_not_found_throws_NOT_FOUND() {
        DispatchTaskModificationDecisionService svc = new DispatchTaskModificationDecisionService(
                taskRepo, notificationClient);
        when(taskRepo.findById(any())).thenReturn(Optional.empty());
        assertThatThrownBy(() -> svc.accept(UUID.randomUUID(), "x"))
                .isInstanceOf(BusinessException.class);
    }

    // ---------- Cancellation ----------

    @Test
    void cancellation_accept_marks_CANCELLED_and_undispatch_slips() throws Exception {
        DispatchTaskCancellationDecisionService svc = new DispatchTaskCancellationDecisionService(
                taskRepo, groupRepo, slipMapRepo, slipRepo, notificationClient);

        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        UUID slipId = UUID.randomUUID();
        DispatchTask task = dispatchedTask(taskId, UUID.randomUUID());
        task.markCancelRequested("거래처 일정 변경");

        DispatchVehicleGroup group = DispatchVehicleGroup.create(taskId, 1, DispatchVehicleType.TONNAGE_1);
        setId(group, groupId);
        DispatchVehicleGroupSlip mapping = DispatchVehicleGroupSlip.create(groupId, slipId, 1);
        Slip slip = org.mockito.Mockito.mock(Slip.class);

        when(taskRepo.findById(taskId)).thenReturn(Optional.of(task));
        when(groupRepo.findByDispatchTaskIdAndIsDeletedFalseOrderBySequenceAsc(taskId))
                .thenReturn(List.of(group));
        when(slipMapRepo.findByVehicleGroupIdAndIsDeletedFalseOrderBySequenceAsc(groupId))
                .thenReturn(List.of(mapping));
        when(slipRepo.findById(slipId)).thenReturn(Optional.of(slip));

        DispatchTask res = svc.accept(taskId, "arologis-master");

        assertThat(res.getStatus()).isEqualTo(DispatchTaskStatus.CANCELLED);
        verify(slip).markDispatchCancelled();
    }

    @Test
    void cancellation_accept_from_DISPATCHED_throws_CONFLICT() throws Exception {
        DispatchTaskCancellationDecisionService svc = new DispatchTaskCancellationDecisionService(
                taskRepo, groupRepo, slipMapRepo, slipRepo, notificationClient);
        UUID taskId = UUID.randomUUID();
        DispatchTask task = dispatchedTask(taskId, UUID.randomUUID());  // DISPATCHED 그대로
        when(taskRepo.findById(taskId)).thenReturn(Optional.of(task));

        assertThatThrownBy(() -> svc.accept(taskId, "x"))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void cancellation_reject_marks_CANCEL_REJECTED_with_reason() throws Exception {
        DispatchTaskCancellationDecisionService svc = new DispatchTaskCancellationDecisionService(
                taskRepo, groupRepo, slipMapRepo, slipRepo, notificationClient);
        UUID taskId = UUID.randomUUID();
        DispatchTask task = dispatchedTask(taskId, UUID.randomUUID());
        task.markCancelRequested(null);
        when(taskRepo.findById(taskId)).thenReturn(Optional.of(task));

        DispatchTask res = svc.reject(taskId, "이미 운송 중", "arologis-master");
        assertThat(res.getStatus()).isEqualTo(DispatchTaskStatus.CANCEL_REJECTED);
        assertThat(res.getRejectionReason()).isEqualTo("이미 운송 중");
    }

    @Test
    void cancellation_accept_with_no_groups_succeeds() throws Exception {
        DispatchTaskCancellationDecisionService svc = new DispatchTaskCancellationDecisionService(
                taskRepo, groupRepo, slipMapRepo, slipRepo, notificationClient);
        UUID taskId = UUID.randomUUID();
        DispatchTask task = dispatchedTask(taskId, UUID.randomUUID());
        task.markCancelRequested(null);
        when(taskRepo.findById(taskId)).thenReturn(Optional.of(task));
        when(groupRepo.findByDispatchTaskIdAndIsDeletedFalseOrderBySequenceAsc(taskId))
                .thenReturn(List.of());

        DispatchTask res = svc.accept(taskId, "arologis-master");
        assertThat(res.getStatus()).isEqualTo(DispatchTaskStatus.CANCELLED);
    }

    // ---------- 헬퍼 ----------

    private static DispatchTask dispatchedTask(UUID taskId, UUID arologisId) throws Exception {
        DispatchTask task = DispatchTask.create("DT-x", LocalDate.now());
        setId(task, taskId);
        task.markDispatching();
        task.markDispatched(arologisId);
        return task;
    }

    private static void setId(Object entity, UUID id) throws Exception {
        Field f = entity.getClass().getDeclaredField("id");
        f.setAccessible(true);
        f.set(entity, id);
    }
}
