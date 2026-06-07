package com.samhanair.logis.slip.service.dispatch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.slip.domain.dispatch.DispatchTask;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroup;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroupSlip;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleType;
import com.samhanair.logis.slip.repository.dispatch.DispatchTaskRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchVehicleGroupRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchVehicleGroupSlipRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
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
 * {@link DispatchTaskService} 단위 검증 — BE Task B6.
 */
@ExtendWith(MockitoExtension.class)
class DispatchTaskServiceTest {

    @Mock DispatchTaskRepository taskRepo;
    @Mock DispatchVehicleGroupRepository groupRepo;
    @Mock DispatchVehicleGroupSlipRepository slipMapRepo;
    @Mock EntityManager entityManager;
    @Mock Query advisoryLockQuery;
    @InjectMocks DispatchTaskService svc;

    @Test
    void createTask_generates_daily_counter_code() {
        stubAdvisoryLock();
        when(taskRepo.existsByTaskCodeAndIsDeletedFalse(anyString())).thenReturn(false);
        when(taskRepo.save(any(DispatchTask.class))).thenAnswer(inv -> inv.getArgument(0));

        DispatchTask t = svc.createTask(LocalDate.of(2026, 5, 14));
        assertThat(t.getTaskCode()).isEqualTo("2026/05/14-1");
    }

    @Test
    void createTask_increments_when_first_taken() {
        stubAdvisoryLock();
        when(taskRepo.existsByTaskCodeAndIsDeletedFalse("2026/05/14-1")).thenReturn(true);
        when(taskRepo.existsByTaskCodeAndIsDeletedFalse("2026/05/14-2")).thenReturn(false);
        when(taskRepo.save(any(DispatchTask.class))).thenAnswer(inv -> inv.getArgument(0));

        DispatchTask t = svc.createTask(LocalDate.of(2026, 5, 14));
        assertThat(t.getTaskCode()).isEqualTo("2026/05/14-2");
    }

    @Test
    void addVehicleGroup_assigns_next_sequence() {
        UUID taskId = UUID.randomUUID();
        when(taskRepo.findById(taskId)).thenReturn(
                Optional.of(DispatchTask.create("2026/05/14-9", LocalDate.now())));
        when(groupRepo.findByDispatchTaskIdAndIsDeletedFalseOrderBySequenceAsc(any()))
                .thenReturn(List.of(
                        DispatchVehicleGroup.create(taskId, 1, DispatchVehicleType.TONNAGE_1),
                        DispatchVehicleGroup.create(taskId, 2, DispatchVehicleType.DAMAS)));
        when(groupRepo.save(any(DispatchVehicleGroup.class))).thenAnswer(inv -> inv.getArgument(0));

        DispatchVehicleGroup added = svc.addVehicleGroup(taskId, DispatchVehicleType.TONNAGE_5);
        assertThat(added.getSequence()).isEqualTo(3);
        assertThat(added.getVehicleType()).isEqualTo(DispatchVehicleType.TONNAGE_5);
    }

    @Test
    void assignSlip_appends_next_sequence_in_group() {
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        UUID slipId = UUID.randomUUID();
        DispatchVehicleGroup group = DispatchVehicleGroup.create(taskId, 1, DispatchVehicleType.TONNAGE_1);
        when(groupRepo.findById(groupId)).thenReturn(Optional.of(group));
        when(slipMapRepo.findByVehicleGroupIdAndIsDeletedFalseOrderBySequenceAsc(any()))
                .thenReturn(List.of(DispatchVehicleGroupSlip.create(groupId, UUID.randomUUID(), 1)));
        when(slipMapRepo.save(any(DispatchVehicleGroupSlip.class)))
                .thenAnswer(inv -> inv.getArgument(0));

        // group 의 dispatchTaskId 가 taskId 와 일치하지 않으면 Mock 객체에서 비교가 어렵다 → 별도 검증
        // group.getDispatchTaskId() 는 taskId 그대로 - 정상 케이스
        DispatchVehicleGroupSlip mapping = svc.assignSlip(taskId, groupId, slipId);
        assertThat(mapping.getSequence()).isEqualTo(2);
        assertThat(mapping.getSlipId()).isEqualTo(slipId);
    }

    @Test
    void assignSlip_wrong_task_throws() {
        UUID taskId = UUID.randomUUID();
        UUID otherTaskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        DispatchVehicleGroup group = DispatchVehicleGroup.create(otherTaskId, 1, DispatchVehicleType.TONNAGE_1);
        when(groupRepo.findById(groupId)).thenReturn(Optional.of(group));

        assertThatThrownBy(() -> svc.assignSlip(taskId, groupId, UUID.randomUUID()))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void reorderSlips_updates_sequence() {
        UUID groupId = UUID.randomUUID();
        UUID slip1 = UUID.randomUUID();
        UUID slip2 = UUID.randomUUID();
        UUID slip3 = UUID.randomUUID();
        DispatchVehicleGroupSlip m1 = DispatchVehicleGroupSlip.create(groupId, slip1, 1);
        DispatchVehicleGroupSlip m2 = DispatchVehicleGroupSlip.create(groupId, slip2, 2);
        DispatchVehicleGroupSlip m3 = DispatchVehicleGroupSlip.create(groupId, slip3, 3);
        when(slipMapRepo.findByVehicleGroupIdAndIsDeletedFalseOrderBySequenceAsc(groupId))
                .thenReturn(List.of(m1, m2, m3));

        svc.reorderSlips(groupId, List.of(slip3, slip1, slip2));

        assertThat(m3.getSequence()).isEqualTo(1);
        assertThat(m1.getSequence()).isEqualTo(2);
        assertThat(m2.getSequence()).isEqualTo(3);
    }

    @Test
    void removeSlipFromGroup_soft_deletes() {
        UUID groupId = UUID.randomUUID();
        UUID slipId = UUID.randomUUID();
        DispatchVehicleGroupSlip m = DispatchVehicleGroupSlip.create(groupId, slipId, 1);
        when(slipMapRepo.findByVehicleGroupIdAndIsDeletedFalseOrderBySequenceAsc(groupId))
                .thenReturn(List.of(m));
        when(slipMapRepo.save(any(DispatchVehicleGroupSlip.class))).thenAnswer(inv -> inv.getArgument(0));

        svc.removeSlipFromGroup(groupId, slipId, "ewoo");

        assertThat(m.getIsDeleted()).isTrue();
    }

    private void stubAdvisoryLock() {
        when(entityManager.createNativeQuery("SELECT pg_advisory_xact_lock(hashtext(?1))"))
                .thenReturn(advisoryLockQuery);
        when(advisoryLockQuery.setParameter(anyInt(), any())).thenReturn(advisoryLockQuery);
        when(advisoryLockQuery.getSingleResult()).thenReturn(0L);
    }
}
