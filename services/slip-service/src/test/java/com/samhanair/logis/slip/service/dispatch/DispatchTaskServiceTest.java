package com.samhanair.logis.slip.service.dispatch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.shared.realtime.collection.CollectionRealtimePublisher;
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
import com.samhanair.logis.slip.realtime.DispatchBoardRealtime;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import java.time.LocalDateTime;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
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
    @Mock CollectionRealtimePublisher collectionPublisher;
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
        stubAdvisoryLock();
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
        verifyBoardChanged("UPDATED");
    }

    @Test
    void addVehicleGroup_uses_max_sequence_plus_one_when_active_sequences_have_gap() {
        stubAdvisoryLock();
        UUID taskId = UUID.randomUUID();
        when(taskRepo.findById(taskId)).thenReturn(
                Optional.of(DispatchTask.create("2026/05/14-9", LocalDate.now())));
        when(groupRepo.findByDispatchTaskIdAndIsDeletedFalseOrderBySequenceAsc(taskId))
                .thenReturn(List.of(
                        DispatchVehicleGroup.create(taskId, 1, DispatchVehicleType.TONNAGE_1),
                        DispatchVehicleGroup.create(taskId, 3, DispatchVehicleType.TONNAGE_1)));
        when(groupRepo.save(any(DispatchVehicleGroup.class))).thenAnswer(inv -> inv.getArgument(0));

        DispatchVehicleGroup added = svc.addVehicleGroup(taskId, DispatchVehicleType.TONNAGE_1);

        assertThat(added.getSequence()).isEqualTo(4);
    }

    /**
     * #725 H-1 — {@code requireDraftTask} 위반(비-DRAFT 배차 작업 편집 시도) 은 409 로 승격되어야 하며,
     * 메시지는 {@link com.samhanair.logis.slip.domain.dispatch.DispatchTaskStatus#getDisplayName()}
     * 한국어 라벨만 사용해야 한다 — DRAFT/DISPATCHING 원어 노출은 FE
     * {@code dispatchErrorMessage.ts} 가 BusinessException message 를 그대로 배너에 노출하므로
     * 사용자 노출 결함이다.
     */
    @Test
    void addVehicleGroup_non_draft_task_throws_conflict_with_korean_displayname_only() {
        stubAdvisoryLock();
        UUID taskId = UUID.randomUUID();
        DispatchTask task = draftTask();
        task.markDispatching();
        when(taskRepo.findById(taskId)).thenReturn(Optional.of(task));

        assertThatThrownBy(() -> svc.addVehicleGroup(taskId, DispatchVehicleBodyType.CARGO, DispatchTonnage.T_1))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("작성 중")
                .hasMessageContaining("발송 완료, 매칭 대기")
                .hasMessageNotContaining("DRAFT")
                .hasMessageNotContaining("DISPATCHING");
        verify(groupRepo, never()).save(any());
    }

    @Test
    void removeVehicleGroup_soft_deletes_group_and_slips_and_publishes_deleted() {
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        UUID slipId = UUID.randomUUID();
        DispatchVehicleGroup group = DispatchVehicleGroup.create(
                taskId, 1, DispatchVehicleBodyType.CARGO, DispatchTonnage.T_1);
        DispatchVehicleGroupSlip mapping = DispatchVehicleGroupSlip.create(groupId, slipId, 1);
        when(groupRepo.findById(groupId)).thenReturn(Optional.of(group));
        when(taskRepo.findById(taskId)).thenReturn(Optional.of(draftTask()));
        when(slipMapRepo.findByVehicleGroupIdAndIsDeletedFalseOrderBySequenceAsc(groupId))
                .thenReturn(List.of(mapping));
        when(groupRepo.save(any(DispatchVehicleGroup.class))).thenAnswer(inv -> inv.getArgument(0));
        when(slipMapRepo.save(any(DispatchVehicleGroupSlip.class))).thenAnswer(inv -> inv.getArgument(0));

        svc.removeVehicleGroup(taskId, groupId, "ewoo", "홍길동");

        assertThat(group.getIsDeleted()).isTrue();
        assertThat(group.getDeletedBy()).isEqualTo("ewoo");
        assertThat(group.getDeletedByName()).isEqualTo("홍길동");
        assertThat(mapping.getIsDeleted()).isTrue();
        assertThat(mapping.getDeletedBy()).isEqualTo("ewoo");
        assertThat(mapping.getDeletedByName()).isEqualTo("홍길동");
        verifyBoardChanged("DELETED");
    }

    @Test
    void removeVehicleGroup_hides_uuid_actor_name() {
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        UUID callerNameUuid = UUID.randomUUID();
        DispatchVehicleGroup group = DispatchVehicleGroup.create(
                taskId, 1, DispatchVehicleBodyType.CARGO, DispatchTonnage.T_1);
        when(groupRepo.findById(groupId)).thenReturn(Optional.of(group));
        when(taskRepo.findById(taskId)).thenReturn(Optional.of(draftTask()));
        when(slipMapRepo.findByVehicleGroupIdAndIsDeletedFalseOrderBySequenceAsc(groupId))
                .thenReturn(List.of());
        when(groupRepo.save(any(DispatchVehicleGroup.class))).thenAnswer(inv -> inv.getArgument(0));

        svc.removeVehicleGroup(taskId, groupId, "ewoo", callerNameUuid.toString());

        assertThat(group.getDeletedBy()).isEqualTo("ewoo");
        assertThat(group.getDeletedByName()).isNull();
    }

    @Test
    void removeVehicleGroup_dispatched_group_throws_conflict() {
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        DispatchVehicleGroup group = DispatchVehicleGroup.create(
                taskId, 1, DispatchVehicleBodyType.CARGO, DispatchTonnage.T_1);
        group.markDispatched();
        when(groupRepo.findById(groupId)).thenReturn(Optional.of(group));

        assertThatThrownBy(() -> svc.removeVehicleGroup(taskId, groupId, "ewoo", "홍길동"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("이미 발송된 차량 그룹은 삭제할 수 없습니다.");
        verify(slipMapRepo, never()).findByVehicleGroupIdAndIsDeletedFalseOrderBySequenceAsc(any());
        verify(groupRepo, never()).save(any());
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
        verifyBoardChanged("UPDATED");
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

        // #725 H-1 — slip.getDispatchStatus() 는 displayName 으로만 노출한다 (원어 DISPATCHING 유출 금지).
        // FE dispatchErrorMessage.ts 가 BusinessException message 를 그대로 배너에 노출한다.
        assertThatThrownBy(() -> svc.assignSlip(taskId, groupId, slipId))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("미배차 전표만 배차 그룹에 추가할 수 있습니다")
                .hasMessageContaining("발송 완료, 매칭 대기")
                .hasMessageNotContaining("DISPATCHING");
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
        verifyBoardChanged("UPDATED");
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

        svc.removeSlipFromGroup(groupId, slipId, "ewoo", "홍길동");

        assertThat(m.getIsDeleted()).isTrue();
        assertThat(m.getDeletedBy()).isEqualTo("ewoo");
        assertThat(m.getDeletedByName()).isEqualTo("홍길동");
        verifyBoardChanged("DELETED");
    }

    @Test
    void removeSlipFromGroup_dispatched_group_throws_conflict() {
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        DispatchVehicleGroup group = DispatchVehicleGroup.create(
                taskId, 1, DispatchVehicleBodyType.CARGO, DispatchTonnage.T_1);
        group.markDispatched();
        when(groupRepo.findById(groupId)).thenReturn(Optional.of(group));

        assertThatThrownBy(() -> svc.removeSlipFromGroup(groupId, UUID.randomUUID(), "ewoo", "홍길동"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("이미 발송된 차량 그룹의 전표는 제거할 수 없습니다.");
        verify(slipMapRepo, never()).save(any());
    }

    @Test
    void removeVehicleGroup_stamps_shared_deletedAt_on_group_and_mappings() {
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        DispatchVehicleGroup group = DispatchVehicleGroup.create(
                taskId, 1, DispatchVehicleBodyType.CARGO, DispatchTonnage.T_1);
        DispatchVehicleGroupSlip m1 = DispatchVehicleGroupSlip.create(groupId, UUID.randomUUID(), 1);
        DispatchVehicleGroupSlip m2 = DispatchVehicleGroupSlip.create(groupId, UUID.randomUUID(), 2);
        when(groupRepo.findById(groupId)).thenReturn(Optional.of(group));
        when(taskRepo.findById(taskId)).thenReturn(Optional.of(draftTask()));
        when(slipMapRepo.findByVehicleGroupIdAndIsDeletedFalseOrderBySequenceAsc(groupId))
                .thenReturn(List.of(m1, m2));
        when(groupRepo.save(any(DispatchVehicleGroup.class))).thenAnswer(inv -> inv.getArgument(0));
        when(slipMapRepo.save(any(DispatchVehicleGroupSlip.class))).thenAnswer(inv -> inv.getArgument(0));

        svc.removeVehicleGroup(taskId, groupId, "ewoo", "홍길동");

        // cascade 복원 등호 매칭의 전제 — 그룹/매핑 삭제 시각이 완전 동일해야 한다.
        assertThat(group.getDeletedAt()).isNotNull();
        assertThat(m1.getDeletedAt()).isEqualTo(group.getDeletedAt());
        assertThat(m2.getDeletedAt()).isEqualTo(group.getDeletedAt());
    }

    @Test
    void restoreVehicleGroup_restores_group_and_cascade_deleted_mappings() {
        stubAdvisoryLock();
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        UUID slipId = UUID.randomUUID();
        DispatchVehicleGroup group = DispatchVehicleGroup.create(
                taskId, 1, DispatchVehicleBodyType.CARGO, DispatchTonnage.T_1);
        DispatchVehicleGroupSlip mapping = DispatchVehicleGroupSlip.create(groupId, slipId, 1);
        LocalDateTime deletedAt = LocalDateTime.now();
        group.markDeletedWithName("deleter", "삭제자", deletedAt);
        mapping.markDeletedWithName("deleter", "삭제자", deletedAt);
        Slip slip = org.mockito.Mockito.mock(Slip.class);
        when(slip.getDispatchStatus()).thenReturn(SlipDispatchStatus.UNDISPATCHED);
        when(groupRepo.findByIdIncludingDeleted(groupId)).thenReturn(Optional.of(group));
        when(taskRepo.findById(taskId)).thenReturn(Optional.of(draftTask()));
        when(groupRepo.findByDispatchTaskIdAndIsDeletedFalseOrderBySequenceAsc(taskId))
                .thenReturn(List.of());
        when(slipMapRepo.findDeletedCascadeMappings(eq(groupId), eq("deleter"), eq(deletedAt)))
                .thenReturn(List.of(mapping));
        when(slipMapRepo.findBySlipIdAndIsDeletedFalse(slipId)).thenReturn(List.of());
        when(slipRepo.findById(slipId)).thenReturn(Optional.of(slip));
        when(groupRepo.save(any(DispatchVehicleGroup.class))).thenAnswer(inv -> inv.getArgument(0));
        when(slipMapRepo.saveAll(any())).thenAnswer(inv -> inv.getArgument(0));

        svc.restoreVehicleGroup(taskId, groupId, "restorer", "복원자");

        assertThat(group.getIsDeleted()).isFalse();
        assertThat(group.getDeletedAt()).isNull();
        assertThat(group.getDeletedByName()).isNull();
        assertThat(mapping.getIsDeleted()).isFalse();
        assertThat(mapping.getDeletedAt()).isNull();
        assertThat(mapping.getDeletedByName()).isNull();
        verifyBoardChanged("RESTORED");
    }

    @Test
    void restoreVehicleGroup_idempotent_when_group_already_active() {
        // 락 이후 조회한 그룹이 이미 활성(다른 복원이 먼저 커밋)이면 조기 return — 순번 미변경·미발화.
        // (락 이전 stale 스냅샷을 쓰면 2차 요청이 순번을 밀고 RESTORED 를 중복 발화하던 결함 회귀 가드.)
        stubAdvisoryLock();
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        DispatchVehicleGroup group = DispatchVehicleGroup.create(
                taskId, 1, DispatchVehicleBodyType.CARGO, DispatchTonnage.T_1);
        when(groupRepo.findByIdIncludingDeleted(groupId)).thenReturn(Optional.of(group));
        when(taskRepo.findById(taskId)).thenReturn(Optional.of(draftTask()));

        svc.restoreVehicleGroup(taskId, groupId, "restorer", "복원자");

        verify(groupRepo, never()).save(any());
        verify(collectionPublisher, never()).publishChange(any(), any(), any());
    }

    @Test
    void restoreVehicleGroup_dispatched_group_throws_conflict() {
        // 결함계열 일관 — 발송(부분발송 포함) 그룹은 복원 불가(removeVehicleGroup·restoreSlipFromGroup 동일 가드).
        stubAdvisoryLock();
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        DispatchVehicleGroup group = DispatchVehicleGroup.create(
                taskId, 1, DispatchVehicleBodyType.CARGO, DispatchTonnage.T_1);
        group.markDeletedWithName("deleter", "삭제자");
        group.markDispatched();
        when(groupRepo.findByIdIncludingDeleted(groupId)).thenReturn(Optional.of(group));
        when(taskRepo.findById(taskId)).thenReturn(Optional.of(draftTask()));

        assertThatThrownBy(() -> svc.restoreVehicleGroup(taskId, groupId, "restorer", "복원자"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("이미 발송된 차량 그룹은 복원할 수 없습니다");
        verify(groupRepo, never()).save(any());
    }

    @Test
    void restoreVehicleGroup_reassigns_sequence_when_taken_by_new_group() {
        stubAdvisoryLock();
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        DispatchVehicleGroup group = DispatchVehicleGroup.create(
                taskId, 1, DispatchVehicleBodyType.CARGO, DispatchTonnage.T_1);
        group.markDeletedWithName("deleter", "삭제자", LocalDateTime.now());
        // 삭제 후 추가된 활성 그룹이 sequence 1 을 재사용 중 — (task, sequence) 활성 unique 충돌 상황.
        DispatchVehicleGroup occupant = DispatchVehicleGroup.create(
                taskId, 1, DispatchVehicleBodyType.DAMAS, null);
        DispatchVehicleGroup tail = DispatchVehicleGroup.create(
                taskId, 2, DispatchVehicleBodyType.CARGO, DispatchTonnage.T_5);
        when(groupRepo.findByIdIncludingDeleted(groupId)).thenReturn(Optional.of(group));
        when(taskRepo.findById(taskId)).thenReturn(Optional.of(draftTask()));
        when(groupRepo.findByDispatchTaskIdAndIsDeletedFalseOrderBySequenceAsc(taskId))
                .thenReturn(List.of(occupant, tail));
        when(slipMapRepo.findDeletedCascadeMappings(any(), anyString(), any())).thenReturn(List.of());
        when(groupRepo.save(any(DispatchVehicleGroup.class))).thenAnswer(inv -> inv.getArgument(0));
        when(slipMapRepo.saveAll(any())).thenAnswer(inv -> inv.getArgument(0));

        svc.restoreVehicleGroup(taskId, groupId, "restorer", "복원자");

        assertThat(group.getIsDeleted()).isFalse();
        assertThat(group.getSequence()).isEqualTo(3);
    }

    @Test
    void restoreVehicleGroup_excludes_mappings_reassigned_elsewhere() {
        stubAdvisoryLock();
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        UUID slipId = UUID.randomUUID();
        DispatchVehicleGroup group = DispatchVehicleGroup.create(
                taskId, 1, DispatchVehicleBodyType.CARGO, DispatchTonnage.T_1);
        DispatchVehicleGroupSlip mapping = DispatchVehicleGroupSlip.create(groupId, slipId, 1);
        LocalDateTime deletedAt = LocalDateTime.now();
        group.markDeletedWithName("deleter", "삭제자", deletedAt);
        mapping.markDeletedWithName("deleter", "삭제자", deletedAt);
        when(groupRepo.findByIdIncludingDeleted(groupId)).thenReturn(Optional.of(group));
        when(taskRepo.findById(taskId)).thenReturn(Optional.of(draftTask()));
        when(groupRepo.findByDispatchTaskIdAndIsDeletedFalseOrderBySequenceAsc(taskId))
                .thenReturn(List.of());
        when(slipMapRepo.findDeletedCascadeMappings(eq(groupId), eq("deleter"), eq(deletedAt)))
                .thenReturn(List.of(mapping));
        // 취소선 기간 동안 같은 전표가 다른 그룹에 재배정됨 → 부활 시 이중 배차.
        when(slipMapRepo.findBySlipIdAndIsDeletedFalse(slipId))
                .thenReturn(List.of(DispatchVehicleGroupSlip.create(UUID.randomUUID(), slipId, 1)));
        when(groupRepo.save(any(DispatchVehicleGroup.class))).thenAnswer(inv -> inv.getArgument(0));
        when(slipMapRepo.saveAll(any())).thenAnswer(inv -> inv.getArgument(0));

        svc.restoreVehicleGroup(taskId, groupId, "restorer", "복원자");

        assertThat(group.getIsDeleted()).isFalse();
        assertThat(mapping.getIsDeleted()).isTrue();
        verifyBoardChanged("RESTORED");
    }

    @Test
    void restoreSlipFromGroup_restores_single_deleted_mapping() {
        stubAdvisoryLock();
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        UUID slipId = UUID.randomUUID();
        DispatchVehicleGroup group = DispatchVehicleGroup.create(
                taskId, 1, DispatchVehicleBodyType.CARGO, DispatchTonnage.T_1);
        DispatchVehicleGroupSlip mapping = DispatchVehicleGroupSlip.create(groupId, slipId, 1);
        mapping.markDeletedWithName("deleter", "삭제자");
        Slip slip = org.mockito.Mockito.mock(Slip.class);
        when(slip.getDispatchStatus()).thenReturn(SlipDispatchStatus.UNDISPATCHED);
        when(groupRepo.findByIdIncludingDeleted(groupId)).thenReturn(Optional.of(group));
        when(taskRepo.findById(taskId)).thenReturn(Optional.of(draftTask()));
        when(slipMapRepo.findDeletedByVehicleGroupIdAndSlipId(groupId, slipId))
                .thenReturn(List.of(mapping));
        when(slipMapRepo.findBySlipIdAndIsDeletedFalse(slipId)).thenReturn(List.of());
        when(slipRepo.findById(slipId)).thenReturn(Optional.of(slip));
        when(slipMapRepo.save(any(DispatchVehicleGroupSlip.class))).thenAnswer(inv -> inv.getArgument(0));

        svc.restoreSlipFromGroup(taskId, groupId, slipId, null, "restorer", "복원자");

        assertThat(mapping.getIsDeleted()).isFalse();
        assertThat(mapping.getDeletedAt()).isNull();
        assertThat(mapping.getDeletedByName()).isNull();
        verifyBoardChanged("RESTORED");
    }

    @Test
    void restoreSlipFromGroup_wrong_task_throws() {
        stubAdvisoryLock();
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        DispatchVehicleGroup group = DispatchVehicleGroup.create(
                UUID.randomUUID(), 1, DispatchVehicleBodyType.CARGO, DispatchTonnage.T_1);
        when(groupRepo.findByIdIncludingDeleted(groupId)).thenReturn(Optional.of(group));

        assertThatThrownBy(() -> svc.restoreSlipFromGroup(taskId, groupId, UUID.randomUUID(), null, "restorer", "복원자"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("group 이 task 에 속하지 않습니다");
        verify(slipMapRepo, never()).save(any());
    }

    @Test
    void restoreSlipFromGroup_active_duplicate_throws_conflict() {
        stubAdvisoryLock();
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        UUID slipId = UUID.randomUUID();
        DispatchVehicleGroup group = DispatchVehicleGroup.create(
                taskId, 1, DispatchVehicleBodyType.CARGO, DispatchTonnage.T_1);
        DispatchVehicleGroupSlip tombstone = DispatchVehicleGroupSlip.create(groupId, slipId, 1);
        tombstone.markDeletedWithName("deleter", "삭제자");
        when(groupRepo.findByIdIncludingDeleted(groupId)).thenReturn(Optional.of(group));
        when(taskRepo.findById(taskId)).thenReturn(Optional.of(draftTask()));
        when(slipMapRepo.findDeletedByVehicleGroupIdAndSlipId(groupId, slipId))
                .thenReturn(List.of(tombstone));
        // 제거 후 같은 전표를 재추가해 활성 매핑이 이미 존재 — 복원 강행 시 활성 unique 위반.
        when(slipMapRepo.findBySlipIdAndIsDeletedFalse(slipId))
                .thenReturn(List.of(DispatchVehicleGroupSlip.create(groupId, slipId, 2)));

        assertThatThrownBy(() -> svc.restoreSlipFromGroup(taskId, groupId, slipId, null, "restorer", "복원자"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("이미 활성 배차 매핑이 있는 전표입니다");
        verify(slipMapRepo, never()).save(any());
    }

    @Test
    void restoreSlipFromGroup_non_undispatched_slip_throws_conflict() {
        stubAdvisoryLock();
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        UUID slipId = UUID.randomUUID();
        DispatchVehicleGroup group = DispatchVehicleGroup.create(
                taskId, 1, DispatchVehicleBodyType.CARGO, DispatchTonnage.T_1);
        DispatchVehicleGroupSlip tombstone = DispatchVehicleGroupSlip.create(groupId, slipId, 1);
        tombstone.markDeletedWithName("deleter", "삭제자");
        Slip slip = org.mockito.Mockito.mock(Slip.class);
        when(slip.getDispatchStatus()).thenReturn(SlipDispatchStatus.DISPATCHING);
        when(groupRepo.findByIdIncludingDeleted(groupId)).thenReturn(Optional.of(group));
        when(taskRepo.findById(taskId)).thenReturn(Optional.of(draftTask()));
        when(slipMapRepo.findDeletedByVehicleGroupIdAndSlipId(groupId, slipId))
                .thenReturn(List.of(tombstone));
        when(slipMapRepo.findBySlipIdAndIsDeletedFalse(slipId)).thenReturn(List.of());
        when(slipRepo.findById(slipId)).thenReturn(Optional.of(slip));

        // #725 H-1 — slip.getDispatchStatus() 는 displayName 으로만 노출한다 (원어 DISPATCHING 유출 금지).
        assertThatThrownBy(() -> svc.restoreSlipFromGroup(taskId, groupId, slipId, null, "restorer", "복원자"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("미배차 전표만 복원할 수 있습니다")
                .hasMessageContaining("발송 완료, 매칭 대기")
                .hasMessageNotContaining("DISPATCHING");
        verify(slipMapRepo, never()).save(any());
    }

    @Test
    void restoreSlipFromGroup_dispatched_group_throws_conflict() {
        // 발송(부분발송 포함)된 그룹의 전표는 복원 불가 — FE/mock 복원 게이트(그룹 dispatchStatus)와 정합.
        // (task 는 DRAFT 지만 선택전송으로 특정 그룹만 DISPATCHED 인 상태의 잔존 tombstone 복원 시도 차단.)
        stubAdvisoryLock();
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        UUID slipId = UUID.randomUUID();
        DispatchVehicleGroup group = DispatchVehicleGroup.create(
                taskId, 1, DispatchVehicleBodyType.CARGO, DispatchTonnage.T_1);
        group.markDispatched();
        when(groupRepo.findByIdIncludingDeleted(groupId)).thenReturn(Optional.of(group));

        assertThatThrownBy(() -> svc.restoreSlipFromGroup(taskId, groupId, slipId, null, "restorer", "복원자"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("이미 발송된 차량 그룹의 전표는 복원할 수 없습니다");
        verify(slipMapRepo, never()).save(any());
    }

    @Test
    void restoreSlipFromGroup_duplicate_tombstones_throw_conflict() {
        stubAdvisoryLock();
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        UUID slipId = UUID.randomUUID();
        DispatchVehicleGroup group = DispatchVehicleGroup.create(
                taskId, 1, DispatchVehicleBodyType.CARGO, DispatchTonnage.T_1);
        DispatchVehicleGroupSlip first = DispatchVehicleGroupSlip.create(groupId, slipId, 1);
        DispatchVehicleGroupSlip second = DispatchVehicleGroupSlip.create(groupId, slipId, 2);
        first.markDeletedWithName("deleter", "삭제자");
        second.markDeletedWithName("deleter", "삭제자");
        when(groupRepo.findByIdIncludingDeleted(groupId)).thenReturn(Optional.of(group));
        when(taskRepo.findById(taskId)).thenReturn(Optional.of(draftTask()));
        when(slipMapRepo.findDeletedByVehicleGroupIdAndSlipId(groupId, slipId))
                .thenReturn(List.of(first, second));

        assertThatThrownBy(() -> svc.restoreSlipFromGroup(taskId, groupId, slipId, null, "restorer", "복원자"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("삭제된 전표 매핑이 여러 건입니다");
        verify(slipMapRepo, never()).save(any());
    }

    @Test
    void restoreSlipFromGroup_with_mappingId_restores_selected_duplicate_tombstone() {
        stubAdvisoryLock();
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        UUID slipId = UUID.randomUUID();
        UUID firstMappingId = UUID.randomUUID();
        UUID secondMappingId = UUID.randomUUID();
        DispatchVehicleGroup group = DispatchVehicleGroup.create(
                taskId, 1, DispatchVehicleBodyType.CARGO, DispatchTonnage.T_1);
        DispatchVehicleGroupSlip first = DispatchVehicleGroupSlip.create(groupId, slipId, 1);
        DispatchVehicleGroupSlip second = DispatchVehicleGroupSlip.create(groupId, slipId, 2);
        org.springframework.test.util.ReflectionTestUtils.setField(first, "id", firstMappingId);
        org.springframework.test.util.ReflectionTestUtils.setField(second, "id", secondMappingId);
        first.markDeletedWithName("deleter", "삭제자");
        second.markDeletedWithName("deleter", "삭제자");
        Slip slip = org.mockito.Mockito.mock(Slip.class);
        when(slip.getDispatchStatus()).thenReturn(SlipDispatchStatus.UNDISPATCHED);
        when(groupRepo.findByIdIncludingDeleted(groupId)).thenReturn(Optional.of(group));
        when(taskRepo.findById(taskId)).thenReturn(Optional.of(draftTask()));
        when(slipMapRepo.findByIdIncludingDeleted(secondMappingId)).thenReturn(Optional.of(second));
        when(slipMapRepo.findBySlipIdAndIsDeletedFalse(slipId)).thenReturn(List.of());
        when(slipRepo.findById(slipId)).thenReturn(Optional.of(slip));
        when(slipMapRepo.save(any(DispatchVehicleGroupSlip.class))).thenAnswer(inv -> inv.getArgument(0));

        svc.restoreSlipFromGroup(taskId, groupId, slipId, secondMappingId, "restorer", "복원자");

        assertThat(first.getIsDeleted()).isTrue();
        assertThat(second.getIsDeleted()).isFalse();
        verify(slipMapRepo).save(second);
        verifyBoardChanged("RESTORED");
    }

    @Test
    void restoreSlipFromGroup_with_mappingId_from_other_group_throws_not_found() {
        stubAdvisoryLock();
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        UUID slipId = UUID.randomUUID();
        UUID mappingId = UUID.randomUUID();
        DispatchVehicleGroup group = DispatchVehicleGroup.create(
                taskId, 1, DispatchVehicleBodyType.CARGO, DispatchTonnage.T_1);
        DispatchVehicleGroupSlip otherGroupMapping =
                DispatchVehicleGroupSlip.create(UUID.randomUUID(), slipId, 1);
        otherGroupMapping.markDeletedWithName("deleter", "삭제자");
        when(groupRepo.findByIdIncludingDeleted(groupId)).thenReturn(Optional.of(group));
        when(taskRepo.findById(taskId)).thenReturn(Optional.of(draftTask()));
        when(slipMapRepo.findByIdIncludingDeleted(mappingId)).thenReturn(Optional.of(otherGroupMapping));

        assertThatThrownBy(() -> svc.restoreSlipFromGroup(
                taskId, groupId, slipId, mappingId, "restorer", "복원자"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("그룹에 매핑된 slip 이 없습니다");
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

    private void verifyBoardChanged(String changeType) {
        verify(collectionPublisher).publishChange(
                eq(DispatchBoardRealtime.CHANNEL_ID),
                eq(DispatchBoardRealtime.EVENT_CHANGED),
                argThat(payload -> hasChangeType(payload, changeType)));
    }

    private static boolean hasChangeType(Map<String, Object> payload, String expected) {
        return expected.equals(payload.get("changeType"));
    }
}
