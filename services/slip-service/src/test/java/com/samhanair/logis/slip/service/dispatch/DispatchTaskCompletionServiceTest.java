package com.samhanair.logis.slip.service.dispatch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.slip.client.ArologisDispatchClient;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.dispatch.DispatchTask;
import com.samhanair.logis.slip.domain.dispatch.DispatchTaskStatus;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroup;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroupSlip;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleType;
import com.samhanair.logis.slip.dto.dispatch.ArologisDispatchRequest;
import com.samhanair.logis.slip.dto.dispatch.ArologisDispatchResponse;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchTaskRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchVehicleGroupRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchVehicleGroupSlipRepository;
import java.lang.reflect.Field;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * {@link DispatchTaskCompletionService} 단위 검증 — BE Task B9.
 */
@ExtendWith(MockitoExtension.class)
class DispatchTaskCompletionServiceTest {

    @Mock DispatchTaskRepository taskRepo;
    @Mock DispatchVehicleGroupRepository groupRepo;
    @Mock DispatchVehicleGroupSlipRepository slipMapRepo;
    @Mock SlipRepository slipRepo;
    @Mock ArologisDispatchClient arologisClient;
    @InjectMocks DispatchTaskCompletionService svc;

    @Test
    void dispatch_transitions_DRAFT_to_DISPATCHING_and_marks_slips() throws Exception {
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        UUID slipId = UUID.randomUUID();

        DispatchTask task = DispatchTask.create("DT-x", LocalDate.now());
        setIdViaReflection(task, taskId);

        DispatchVehicleGroup group = DispatchVehicleGroup.create(taskId, 1, DispatchVehicleType.TONNAGE_1);
        setIdViaReflection(group, groupId);

        DispatchVehicleGroupSlip mapping = DispatchVehicleGroupSlip.create(groupId, slipId, 1);

        Slip slip = mock(Slip.class);
        when(slip.getId()).thenReturn(slipId);
        when(slip.getSlipNo()).thenReturn("SL-001");

        when(taskRepo.findById(taskId)).thenReturn(Optional.of(task));
        when(groupRepo.findByDispatchTaskIdAndIsDeletedFalseOrderBySequenceAsc(taskId))
                .thenReturn(List.of(group));
        when(slipMapRepo.findByVehicleGroupIdAndIsDeletedFalseOrderBySequenceAsc(groupId))
                .thenReturn(List.of(mapping));
        when(slipRepo.findById(slipId)).thenReturn(Optional.of(slip));
        when(arologisClient.send(any(ArologisDispatchRequest.class)))
                .thenReturn(new ArologisDispatchResponse(
                        UUID.randomUUID(), taskId, Instant.now(), Instant.now()));

        DispatchTask result = svc.dispatch(taskId);

        assertThat(result.getStatus()).isEqualTo(DispatchTaskStatus.DISPATCHING);
        verify(slip).markDispatchPending();
        verify(arologisClient).send(any(ArologisDispatchRequest.class));
    }

    @Test
    void dispatch_from_DISPATCHING_throws_CONFLICT() throws Exception {
        UUID taskId = UUID.randomUUID();
        DispatchTask task = DispatchTask.create("DT-x", LocalDate.now());
        setIdViaReflection(task, taskId);
        task.markDispatching();
        when(taskRepo.findById(taskId)).thenReturn(Optional.of(task));

        assertThatThrownBy(() -> svc.dispatch(taskId))
                .isInstanceOf(BusinessException.class);

        verify(arologisClient, never()).send(any());
    }

    @Test
    void dispatch_with_no_groups_throws() throws Exception {
        UUID taskId = UUID.randomUUID();
        DispatchTask task = DispatchTask.create("DT-x", LocalDate.now());
        setIdViaReflection(task, taskId);
        when(taskRepo.findById(taskId)).thenReturn(Optional.of(task));
        when(groupRepo.findByDispatchTaskIdAndIsDeletedFalseOrderBySequenceAsc(taskId))
                .thenReturn(List.of());

        assertThatThrownBy(() -> svc.dispatch(taskId))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void dispatch_task_not_found_throws_NOT_FOUND() {
        UUID taskId = UUID.randomUUID();
        when(taskRepo.findById(taskId)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> svc.dispatch(taskId))
                .isInstanceOf(BusinessException.class);
    }

    // ---- helpers ----

    private static Slip mock(Class<Slip> c) {
        return org.mockito.Mockito.mock(c);
    }

    private static void setIdViaReflection(Object entity, UUID id) throws Exception {
        Field f = entity.getClass().getDeclaredField("id");
        f.setAccessible(true);
        f.set(entity, id);
    }
}
