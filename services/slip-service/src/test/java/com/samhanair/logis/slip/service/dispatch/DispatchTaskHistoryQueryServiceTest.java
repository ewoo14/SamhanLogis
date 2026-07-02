package com.samhanair.logis.slip.service.dispatch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.dispatch.DispatchTask;
import com.samhanair.logis.slip.domain.dispatch.DispatchTonnage;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleBodyType;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroup;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroupSlip;
import com.samhanair.logis.slip.dto.dispatch.DispatchTaskDetailResponse;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchTaskRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchVehicleGroupRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchVehicleGroupSlipRepository;
import com.samhanair.logis.slip.repository.dispatch.MatchedDriverRepository;
import java.lang.reflect.Field;
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
 * 배차 task 상세 read model 검증.
 */
@ExtendWith(MockitoExtension.class)
class DispatchTaskHistoryQueryServiceTest {

    @Mock DispatchTaskRepository taskRepo;
    @Mock DispatchVehicleGroupRepository groupRepo;
    @Mock DispatchVehicleGroupSlipRepository groupSlipRepo;
    @Mock MatchedDriverRepository driverRepo;
    @Mock SlipRepository slipRepo;
    @InjectMocks DispatchTaskHistoryQueryService svc;

    @Test
    void detail_marks_slip_ids_that_appear_in_multiple_vehicle_groups_as_duplicate() throws Exception {
        UUID taskId = UUID.randomUUID();
        UUID groupAId = UUID.randomUUID();
        UUID groupBId = UUID.randomUUID();
        UUID duplicateSlipId = UUID.randomUUID();

        DispatchTask task = DispatchTask.create("2026/06/12-1", LocalDate.of(2026, 6, 12));
        setId(task, taskId);
        DispatchVehicleGroup groupA = DispatchVehicleGroup.create(
                taskId, 1, DispatchVehicleBodyType.CARGO, DispatchTonnage.T_1);
        setId(groupA, groupAId);
        DispatchVehicleGroup groupB = DispatchVehicleGroup.create(
                taskId, 2, DispatchVehicleBodyType.WINGBODY, DispatchTonnage.T_1);
        setId(groupB, groupBId);
        DispatchVehicleGroupSlip mappingA = DispatchVehicleGroupSlip.create(groupAId, duplicateSlipId, 1);
        DispatchVehicleGroupSlip mappingB = DispatchVehicleGroupSlip.create(groupBId, duplicateSlipId, 1);

        Slip slip = org.mockito.Mockito.mock(Slip.class);
        when(slip.getId()).thenReturn(duplicateSlipId);
        when(slip.getSlipNo()).thenReturn("2026/06/12-SPD-001");
        when(slip.getPartnerCode()).thenReturn("P-001");
        when(slip.getPartnerName()).thenReturn("중복거래처");

        when(taskRepo.findById(taskId)).thenReturn(Optional.of(task));
        when(groupRepo.findByDispatchTaskIdInIncludingDeleted(List.of(taskId)))
                .thenReturn(List.of(groupA, groupB));
        when(groupSlipRepo.findByVehicleGroupIdInIncludingDeleted(List.of(groupAId, groupBId)))
                .thenReturn(List.of(mappingA, mappingB));
        when(slipRepo.findAllByIdInAndIsDeletedFalse(java.util.Set.of(duplicateSlipId)))
                .thenReturn(List.of(slip));
        when(driverRepo.findByVehicleGroupIdInAndIsDeletedFalse(List.of(groupAId, groupBId)))
                .thenReturn(List.of());

        var detail = svc.detail(taskId);

        assertThat(detail.duplicateSlipIds()).containsExactly(duplicateSlipId);
    }

    @Test
    void detail_keeps_duplicateSlipIds_empty_when_vehicle_groups_have_distinct_slips() throws Exception {
        UUID taskId = UUID.randomUUID();
        UUID groupAId = UUID.randomUUID();
        UUID groupBId = UUID.randomUUID();
        UUID slipAId = UUID.randomUUID();
        UUID slipBId = UUID.randomUUID();

        DispatchTask task = DispatchTask.create("2026/06/12-2", LocalDate.of(2026, 6, 12));
        setId(task, taskId);
        DispatchVehicleGroup groupA = DispatchVehicleGroup.create(
                taskId, 1, DispatchVehicleBodyType.CARGO, DispatchTonnage.T_1);
        setId(groupA, groupAId);
        DispatchVehicleGroup groupB = DispatchVehicleGroup.create(
                taskId, 2, DispatchVehicleBodyType.WINGBODY, DispatchTonnage.T_1);
        setId(groupB, groupBId);
        DispatchVehicleGroupSlip mappingA = DispatchVehicleGroupSlip.create(groupAId, slipAId, 1);
        DispatchVehicleGroupSlip mappingB = DispatchVehicleGroupSlip.create(groupBId, slipBId, 1);

        Slip slipA = org.mockito.Mockito.mock(Slip.class);
        when(slipA.getId()).thenReturn(slipAId);
        when(slipA.getSlipNo()).thenReturn("2026/06/12-SPD-001");
        when(slipA.getPartnerCode()).thenReturn("P-001");
        when(slipA.getPartnerName()).thenReturn("거래처A");
        Slip slipB = org.mockito.Mockito.mock(Slip.class);
        when(slipB.getId()).thenReturn(slipBId);
        when(slipB.getSlipNo()).thenReturn("2026/06/12-SPD-002");
        when(slipB.getPartnerCode()).thenReturn("P-002");
        when(slipB.getPartnerName()).thenReturn("거래처B");

        when(taskRepo.findById(taskId)).thenReturn(Optional.of(task));
        when(groupRepo.findByDispatchTaskIdInIncludingDeleted(List.of(taskId)))
                .thenReturn(List.of(groupA, groupB));
        when(groupSlipRepo.findByVehicleGroupIdInIncludingDeleted(List.of(groupAId, groupBId)))
                .thenReturn(List.of(mappingA, mappingB));
        when(slipRepo.findAllByIdInAndIsDeletedFalse(java.util.Set.of(slipAId, slipBId)))
                .thenReturn(List.of(slipA, slipB));
        when(driverRepo.findByVehicleGroupIdInAndIsDeletedFalse(List.of(groupAId, groupBId)))
                .thenReturn(List.of());

        var detail = svc.detail(taskId);

        assertThat(detail.duplicateSlipIds()).isEmpty();
    }

    @Test
    void detail_includes_deleted_groups_and_slips_after_active_rows_with_delete_metadata() throws Exception {
        UUID taskId = UUID.randomUUID();
        UUID activeGroupId = UUID.randomUUID();
        UUID deletedGroupId = UUID.randomUUID();
        UUID activeSlipId = UUID.randomUUID();
        UUID deletedSlipId = UUID.randomUUID();

        DispatchTask task = DispatchTask.create("2026/07/02-1", LocalDate.of(2026, 7, 2));
        setId(task, taskId);
        DispatchVehicleGroup deletedGroup = DispatchVehicleGroup.create(
                taskId, 1, DispatchVehicleBodyType.CARGO, DispatchTonnage.T_1);
        setId(deletedGroup, deletedGroupId);
        deletedGroup.markDeletedWithName("user-1", "삭제자");
        DispatchVehicleGroup activeGroup = DispatchVehicleGroup.create(
                taskId, 2, DispatchVehicleBodyType.WINGBODY, DispatchTonnage.T_5);
        setId(activeGroup, activeGroupId);

        DispatchVehicleGroupSlip deletedMapping =
                DispatchVehicleGroupSlip.create(activeGroupId, deletedSlipId, 1);
        deletedMapping.markDeletedWithName("user-1", "삭제자");
        DispatchVehicleGroupSlip activeMapping =
                DispatchVehicleGroupSlip.create(activeGroupId, activeSlipId, 2);

        Slip activeSlip = org.mockito.Mockito.mock(Slip.class);
        when(activeSlip.getId()).thenReturn(activeSlipId);
        when(activeSlip.getSlipNo()).thenReturn("2026/07/02-SPD-001");
        when(activeSlip.getPartnerCode()).thenReturn("P-001");
        when(activeSlip.getPartnerName()).thenReturn("활성거래처");
        Slip deletedSlip = org.mockito.Mockito.mock(Slip.class);
        when(deletedSlip.getId()).thenReturn(deletedSlipId);
        when(deletedSlip.getSlipNo()).thenReturn("2026/07/02-SPD-002");
        when(deletedSlip.getPartnerCode()).thenReturn("P-002");
        when(deletedSlip.getPartnerName()).thenReturn("삭제거래처");

        when(taskRepo.findById(taskId)).thenReturn(Optional.of(task));
        when(groupRepo.findByDispatchTaskIdInIncludingDeleted(List.of(taskId)))
                .thenReturn(List.of(deletedGroup, activeGroup));
        when(groupSlipRepo.findByVehicleGroupIdInIncludingDeleted(List.of(activeGroupId, deletedGroupId)))
                .thenReturn(List.of(deletedMapping, activeMapping));
        when(slipRepo.findAllByIdInAndIsDeletedFalse(java.util.Set.of(deletedSlipId, activeSlipId)))
                .thenReturn(List.of(deletedSlip, activeSlip));
        when(driverRepo.findByVehicleGroupIdInAndIsDeletedFalse(List.of(activeGroupId, deletedGroupId)))
                .thenReturn(List.of());

        var detail = svc.detail(taskId);

        assertThat(detail.vehicleGroups()).extracting(DispatchTaskDetailResponse.VehicleGroup::id)
                .containsExactly(activeGroupId, deletedGroupId);
        assertThat(detail.vehicleGroups().get(1).isDeleted()).isTrue();
        assertThat(detail.vehicleGroups().get(1).deletedAt()).isNotNull();
        assertThat(detail.vehicleGroups().get(1).deletedByName()).isEqualTo("삭제자");
        assertThat(detail.vehicleGroups().get(0).slips())
                .extracting(DispatchTaskDetailResponse.VehicleGroupSlip::slipId)
                .containsExactly(activeSlipId, deletedSlipId);
        assertThat(detail.vehicleGroups().get(0).slips().get(1).isDeleted()).isTrue();
        assertThat(detail.vehicleGroups().get(0).slips().get(1).deletedAt()).isNotNull();
        assertThat(detail.vehicleGroups().get(0).slips().get(1).deletedByName()).isEqualTo("삭제자");
    }

    @Test
    void detail_does_not_count_deleted_mappings_as_duplicates() throws Exception {
        UUID taskId = UUID.randomUUID();
        UUID groupAId = UUID.randomUUID();
        UUID groupBId = UUID.randomUUID();
        UUID slipId = UUID.randomUUID();

        DispatchTask task = DispatchTask.create("2026/07/02-2", LocalDate.of(2026, 7, 2));
        setId(task, taskId);
        DispatchVehicleGroup groupA = DispatchVehicleGroup.create(
                taskId, 1, DispatchVehicleBodyType.CARGO, DispatchTonnage.T_1);
        setId(groupA, groupAId);
        DispatchVehicleGroup groupB = DispatchVehicleGroup.create(
                taskId, 2, DispatchVehicleBodyType.WINGBODY, DispatchTonnage.T_1);
        setId(groupB, groupBId);
        // 그룹 A 에서 뺀(취소선) 전표를 그룹 B 에 재배정한 정상 상태 — 중복 경고 대상이 아니다.
        DispatchVehicleGroupSlip tombstone = DispatchVehicleGroupSlip.create(groupAId, slipId, 1);
        tombstone.markDeletedWithName("user-1", "삭제자");
        DispatchVehicleGroupSlip active = DispatchVehicleGroupSlip.create(groupBId, slipId, 1);

        Slip slip = org.mockito.Mockito.mock(Slip.class);
        when(slip.getId()).thenReturn(slipId);
        when(slip.getSlipNo()).thenReturn("2026/07/02-SPD-010");
        when(slip.getPartnerCode()).thenReturn("P-010");
        when(slip.getPartnerName()).thenReturn("재배정거래처");

        when(taskRepo.findById(taskId)).thenReturn(Optional.of(task));
        when(groupRepo.findByDispatchTaskIdInIncludingDeleted(List.of(taskId)))
                .thenReturn(List.of(groupA, groupB));
        when(groupSlipRepo.findByVehicleGroupIdInIncludingDeleted(List.of(groupAId, groupBId)))
                .thenReturn(List.of(tombstone, active));
        when(slipRepo.findAllByIdInAndIsDeletedFalse(java.util.Set.of(slipId)))
                .thenReturn(List.of(slip));

        var detail = svc.detail(taskId);

        assertThat(detail.duplicateSlipIds()).isEmpty();
    }

    @Test
    void detail_skips_deleted_mapping_whose_slip_is_gone_instead_of_failing() throws Exception {
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        UUID goneSlipId = UUID.randomUUID();
        UUID activeSlipId = UUID.randomUUID();

        DispatchTask task = DispatchTask.create("2026/07/02-3", LocalDate.of(2026, 7, 2));
        setId(task, taskId);
        DispatchVehicleGroup group = DispatchVehicleGroup.create(
                taskId, 1, DispatchVehicleBodyType.CARGO, DispatchTonnage.T_1);
        setId(group, groupId);
        // 취소선 매핑의 전표가 이후 삭제됨 — 상세 전체가 무너지면 안 되고 해당 행만 생략한다.
        DispatchVehicleGroupSlip tombstone = DispatchVehicleGroupSlip.create(groupId, goneSlipId, 1);
        tombstone.markDeletedWithName("user-1", "삭제자");
        DispatchVehicleGroupSlip active = DispatchVehicleGroupSlip.create(groupId, activeSlipId, 2);

        Slip activeSlip = org.mockito.Mockito.mock(Slip.class);
        when(activeSlip.getId()).thenReturn(activeSlipId);
        when(activeSlip.getSlipNo()).thenReturn("2026/07/02-SPD-011");
        when(activeSlip.getPartnerCode()).thenReturn("P-011");
        when(activeSlip.getPartnerName()).thenReturn("활성거래처");

        when(taskRepo.findById(taskId)).thenReturn(Optional.of(task));
        when(groupRepo.findByDispatchTaskIdInIncludingDeleted(List.of(taskId)))
                .thenReturn(List.of(group));
        when(groupSlipRepo.findByVehicleGroupIdInIncludingDeleted(List.of(groupId)))
                .thenReturn(List.of(tombstone, active));
        when(slipRepo.findAllByIdInAndIsDeletedFalse(java.util.Set.of(goneSlipId, activeSlipId)))
                .thenReturn(List.of(activeSlip));

        var detail = svc.detail(taskId);

        assertThat(detail.vehicleGroups().get(0).slips())
                .extracting(DispatchTaskDetailResponse.VehicleGroupSlip::slipId)
                .containsExactly(activeSlipId);
    }

    @Test
    void list_uses_active_only_queries_for_summary_counts() throws Exception {
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        UUID slipId = UUID.randomUUID();

        DispatchTask task = DispatchTask.create("2026/07/02-4", LocalDate.of(2026, 7, 2));
        setId(task, taskId);
        DispatchVehicleGroup group = DispatchVehicleGroup.create(
                taskId, 1, DispatchVehicleBodyType.CARGO, DispatchTonnage.T_1);
        setId(group, groupId);
        DispatchVehicleGroupSlip mapping = DispatchVehicleGroupSlip.create(groupId, slipId, 1);

        Slip slip = org.mockito.Mockito.mock(Slip.class);
        when(slip.getId()).thenReturn(slipId);
        when(slip.getPartnerName()).thenReturn("거래처A");

        when(taskRepo.findByDispatchDateBetweenAndStatusInAndIsDeletedFalse(
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any()))
                .thenReturn(new org.springframework.data.domain.PageImpl<>(List.of(task)));
        // 목록 summary 는 활성 전용 쿼리를 사용해야 한다 — IncludingDeleted stub 없이 통과해야 함.
        when(groupRepo.findByDispatchTaskIdInAndIsDeletedFalseOrderByDispatchTaskIdAscSequenceAsc(List.of(taskId)))
                .thenReturn(List.of(group));
        when(groupSlipRepo.findByVehicleGroupIdInAndIsDeletedFalseOrderByVehicleGroupIdAscSequenceAsc(List.of(groupId)))
                .thenReturn(List.of(mapping));
        when(slipRepo.findAllByIdInAndIsDeletedFalse(java.util.Set.of(slipId)))
                .thenReturn(List.of(slip));
        when(driverRepo.findByVehicleGroupIdInAndIsDeletedFalse(List.of(groupId)))
                .thenReturn(List.of());

        var page = svc.list(
                LocalDate.of(2026, 7, 1),
                LocalDate.of(2026, 7, 31),
                java.util.Set.of(com.samhanair.logis.slip.domain.dispatch.DispatchTaskStatus.DISPATCHED),
                org.springframework.data.domain.Pageable.unpaged());

        assertThat(page.getContent()).hasSize(1);
        assertThat(page.getContent().get(0).vehicleGroupCount()).isEqualTo(1);
        assertThat(page.getContent().get(0).slipCount()).isEqualTo(1);
    }

    private static void setId(Object entity, UUID id) throws Exception {
        Field f = entity.getClass().getDeclaredField("id");
        f.setAccessible(true);
        f.set(entity, id);
    }
}
