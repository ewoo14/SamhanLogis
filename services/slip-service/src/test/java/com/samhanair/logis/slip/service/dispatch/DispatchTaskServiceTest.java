package com.samhanair.logis.slip.service.dispatch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.dispatch.DispatchTask;
import com.samhanair.logis.slip.domain.dispatch.DispatchTonnage;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleBodyType;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroup;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroupSlip;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleType;
import com.samhanair.logis.slip.domain.dispatch.SlipDispatchStatus;
import com.samhanair.logis.slip.repository.SlipRepository;
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
    @Mock SlipRepository slipRepo;
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
                        DispatchVehicleGroup.create(taskId, 1, DispatchVehicleBodyType.CARGO, DispatchTonnage.T_1),
                        DispatchVehicleGroup.create(taskId, 2, DispatchVehicleBodyType.DAMAS, null)));
        when(groupRepo.save(any(DispatchVehicleGroup.class))).thenAnswer(inv -> inv.getArgument(0));

        DispatchVehicleGroup added = svc.addVehicleGroup(taskId, DispatchVehicleBodyType.WINGBODY, DispatchTonnage.T_5);
        assertThat(added.getSequence()).isEqualTo(3);
        assertThat(added.getVehicleBodyType()).isEqualTo(DispatchVehicleBodyType.WINGBODY);
        assertThat(added.getTonnage()).isEqualTo(DispatchTonnage.T_5);
        assertThat(added.getVehicleType()).isEqualTo(DispatchVehicleType.TONNAGE_5);
    }

    @Test
    void assignSlip_appends_next_sequence_in_group() {
        stubAdvisoryLock();
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        UUID slipId = UUID.randomUUID();
        DispatchVehicleGroup group = DispatchVehicleGroup.create(taskId, 1, DispatchVehicleBodyType.CARGO, DispatchTonnage.T_1);
        Slip slip = org.mockito.Mockito.mock(Slip.class);
        when(slip.getDispatchStatus()).thenReturn(SlipDispatchStatus.UNDISPATCHED);
        when(groupRepo.findById(groupId)).thenReturn(Optional.of(group));
        when(taskRepo.findById(taskId)).thenReturn(Optional.of(draftTask()));
        when(slipRepo.findById(slipId)).thenReturn(Optional.of(slip));
        when(slipMapRepo.findBySlipIdAndIsDeletedFalse(slipId)).thenReturn(List.of());
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
    void assignSlip_missing_slip_throws_not_found_before_mapping() {
        stubAdvisoryLock();
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        UUID slipId = UUID.randomUUID();
        DispatchVehicleGroup group = DispatchVehicleGroup.create(
                taskId, 1, DispatchVehicleBodyType.CARGO, DispatchTonnage.T_1);
        when(groupRepo.findById(groupId)).thenReturn(Optional.of(group));
        when(taskRepo.findById(taskId)).thenReturn(Optional.of(draftTask()));
        when(slipRepo.findById(slipId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> svc.assignSlip(taskId, groupId, slipId))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("slip 이 존재하지 않습니다");
        verify(slipMapRepo, never()).save(any());
    }

    @Test
    void assignSlip_dispatching_or_dispatched_slip_throws_conflict() {
        stubAdvisoryLock();
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        UUID slipId = UUID.randomUUID();
        DispatchVehicleGroup group = DispatchVehicleGroup.create(
                taskId, 1, DispatchVehicleBodyType.CARGO, DispatchTonnage.T_1);
        Slip slip = org.mockito.Mockito.mock(Slip.class);
        when(slip.getDispatchStatus()).thenReturn(SlipDispatchStatus.DISPATCHING);
        when(groupRepo.findById(groupId)).thenReturn(Optional.of(group));
        when(taskRepo.findById(taskId)).thenReturn(Optional.of(draftTask()));
        when(slipRepo.findById(slipId)).thenReturn(Optional.of(slip));

        assertThatThrownBy(() -> svc.assignSlip(taskId, groupId, slipId))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("미배차 전표만 배차 그룹에 추가할 수 있습니다");
        verify(slipMapRepo, never()).save(any());
    }

    @Test
    void assignSlip_already_mapped_to_another_task_throws_conflict() {
        stubAdvisoryLock();
        UUID taskId = UUID.randomUUID();
        UUID otherTaskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        UUID otherGroupId = UUID.randomUUID();
        UUID slipId = UUID.randomUUID();
        DispatchVehicleGroup group = DispatchVehicleGroup.create(
                taskId, 1, DispatchVehicleBodyType.CARGO, DispatchTonnage.T_1);
        DispatchVehicleGroup otherTaskGroup = DispatchVehicleGroup.create(
                otherTaskId, 1, DispatchVehicleBodyType.CARGO, DispatchTonnage.T_1);
        Slip slip = org.mockito.Mockito.mock(Slip.class);
        when(slip.getDispatchStatus()).thenReturn(SlipDispatchStatus.UNDISPATCHED);
        when(groupRepo.findById(groupId)).thenReturn(Optional.of(group));
        when(taskRepo.findById(taskId)).thenReturn(Optional.of(draftTask()));
        when(groupRepo.findById(otherGroupId)).thenReturn(Optional.of(otherTaskGroup));
        when(slipRepo.findById(slipId)).thenReturn(Optional.of(slip));
        when(slipMapRepo.findBySlipIdAndIsDeletedFalse(slipId))
                .thenReturn(List.of(DispatchVehicleGroupSlip.create(otherGroupId, slipId, 1)));

        assertThatThrownBy(() -> svc.assignSlip(taskId, groupId, slipId))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("이미 다른 배차 작업에 추가된 전표입니다");
        verify(slipMapRepo, never()).save(any());
    }

    @Test
    void assignSlip_wrong_task_throws() {
        stubAdvisoryLock();
        UUID taskId = UUID.randomUUID();
        UUID otherTaskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        DispatchVehicleGroup group = DispatchVehicleGroup.create(otherTaskId, 1, DispatchVehicleBodyType.CARGO, DispatchTonnage.T_1);
        when(groupRepo.findById(groupId)).thenReturn(Optional.of(group));

        assertThatThrownBy(() -> svc.assignSlip(taskId, groupId, UUID.randomUUID()))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void assignSlip_dispatched_group_throws_conflict() {
        stubAdvisoryLock();
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        DispatchVehicleGroup group = DispatchVehicleGroup.create(
                taskId, 1, DispatchVehicleBodyType.CARGO, DispatchTonnage.T_1);
        group.markDispatched();
        when(groupRepo.findById(groupId)).thenReturn(Optional.of(group));

        assertThatThrownBy(() -> svc.assignSlip(taskId, groupId, UUID.randomUUID()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("이미 발송된 차량 그룹에는 전표를 추가할 수 없습니다.");
        verify(slipRepo, never()).findById(any());
        verify(slipMapRepo, never()).save(any());
    }

    @Test
    void reorderSlips_updates_sequence() {
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        UUID slip1 = UUID.randomUUID();
        UUID slip2 = UUID.randomUUID();
        UUID slip3 = UUID.randomUUID();
        DispatchVehicleGroup group = DispatchVehicleGroup.create(
                taskId, 1, DispatchVehicleBodyType.CARGO, DispatchTonnage.T_1);
        DispatchVehicleGroupSlip m1 = DispatchVehicleGroupSlip.create(groupId, slip1, 1);
        DispatchVehicleGroupSlip m2 = DispatchVehicleGroupSlip.create(groupId, slip2, 2);
        DispatchVehicleGroupSlip m3 = DispatchVehicleGroupSlip.create(groupId, slip3, 3);
        when(groupRepo.findById(groupId)).thenReturn(Optional.of(group));
        when(taskRepo.findById(taskId)).thenReturn(Optional.of(draftTask()));
        when(slipMapRepo.findByVehicleGroupIdAndIsDeletedFalseOrderBySequenceAsc(groupId))
                .thenReturn(List.of(m1, m2, m3));

        svc.reorderSlips(groupId, List.of(slip3, slip1, slip2));

        assertThat(m3.getSequence()).isEqualTo(1);
        assertThat(m1.getSequence()).isEqualTo(2);
        assertThat(m2.getSequence()).isEqualTo(3);
    }

    @Test
    void reorderSlips_dispatched_group_throws_conflict() {
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        DispatchVehicleGroup group = DispatchVehicleGroup.create(
                taskId, 1, DispatchVehicleBodyType.CARGO, DispatchTonnage.T_1);
        group.markDispatched();
        when(groupRepo.findById(groupId)).thenReturn(Optional.of(group));

        assertThatThrownBy(() -> svc.reorderSlips(groupId, List.of(UUID.randomUUID())))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("이미 발송된 차량 그룹의 전표 순서는 변경할 수 없습니다.");
        verify(slipMapRepo, never()).saveAll(any());
    }

    @Test
    void removeSlipFromGroup_soft_deletes() {
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        UUID slipId = UUID.randomUUID();
        DispatchVehicleGroup group = DispatchVehicleGroup.create(
                taskId, 1, DispatchVehicleBodyType.CARGO, DispatchTonnage.T_1);
        DispatchVehicleGroupSlip m = DispatchVehicleGroupSlip.create(groupId, slipId, 1);
        when(groupRepo.findById(groupId)).thenReturn(Optional.of(group));
        when(taskRepo.findById(taskId)).thenReturn(Optional.of(draftTask()));
        when(slipMapRepo.findByVehicleGroupIdAndIsDeletedFalseOrderBySequenceAsc(groupId))
                .thenReturn(List.of(m));
        when(slipMapRepo.save(any(DispatchVehicleGroupSlip.class))).thenAnswer(inv -> inv.getArgument(0));

        svc.removeSlipFromGroup(groupId, slipId, "ewoo");

        assertThat(m.getIsDeleted()).isTrue();
    }

    @Test
    void removeSlipFromGroup_dispatched_group_throws_conflict() {
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        DispatchVehicleGroup group = DispatchVehicleGroup.create(
                taskId, 1, DispatchVehicleBodyType.CARGO, DispatchTonnage.T_1);
        group.markDispatched();
        when(groupRepo.findById(groupId)).thenReturn(Optional.of(group));

        assertThatThrownBy(() -> svc.removeSlipFromGroup(groupId, UUID.randomUUID(), "ewoo"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("이미 발송된 차량 그룹의 전표는 제거할 수 없습니다.");
        verify(slipMapRepo, never()).save(any());
    }

    @Test
    void findOrCreateTodayDraft_returns_latest_draft_when_exists() {
        LocalDate date = LocalDate.of(2026, 6, 12);
        DispatchTask existing = DispatchTask.create("2026/06/12-3", date);
        stubAdvisoryLock();
        when(taskRepo.findFirstByDispatchDateAndStatusAndIsDeletedFalseOrderByCreatedAtDesc(
                date, com.samhanair.logis.slip.domain.dispatch.DispatchTaskStatus.DRAFT))
                .thenReturn(Optional.of(existing));

        DispatchTask result = svc.findOrCreateTodayDraft(date);

        assertThat(result).isSameAs(existing);
        verify(taskRepo, never()).save(any());
    }

    @Test
    void findOrCreateTodayDraft_creates_new_when_no_draft_exists() {
        LocalDate date = LocalDate.of(2026, 6, 12);
        stubAdvisoryLock();
        when(taskRepo.findFirstByDispatchDateAndStatusAndIsDeletedFalseOrderByCreatedAtDesc(
                date, com.samhanair.logis.slip.domain.dispatch.DispatchTaskStatus.DRAFT))
                .thenReturn(Optional.empty());
        when(taskRepo.existsByTaskCodeAndIsDeletedFalse("2026/06/12-1")).thenReturn(false);
        when(taskRepo.save(any(DispatchTask.class))).thenAnswer(inv -> inv.getArgument(0));

        DispatchTask result = svc.findOrCreateTodayDraft(date);

        assertThat(result.getTaskCode()).isEqualTo("2026/06/12-1");
    }

    private void stubAdvisoryLock() {
        org.mockito.Mockito.lenient()
                .when(entityManager.createNativeQuery("SELECT pg_advisory_xact_lock(CAST(hashtext(?1) AS bigint))"))
                .thenReturn(advisoryLockQuery);
        org.mockito.Mockito.lenient().when(advisoryLockQuery.setParameter(anyInt(), any())).thenReturn(advisoryLockQuery);
        org.mockito.Mockito.lenient().when(advisoryLockQuery.getSingleResult()).thenReturn(0L);
    }

    private static DispatchTask draftTask() {
        return DispatchTask.create("2026/05/14-1", LocalDate.of(2026, 5, 14));
    }
}
