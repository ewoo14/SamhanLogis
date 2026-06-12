package com.samhanair.logis.slip.service.dispatch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.dispatch.DispatchTask;
import com.samhanair.logis.slip.domain.dispatch.DispatchTonnage;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleBodyType;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroup;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroupSlip;
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
        when(groupRepo.findByDispatchTaskIdInAndIsDeletedFalseOrderByDispatchTaskIdAscSequenceAsc(List.of(taskId)))
                .thenReturn(List.of(groupA, groupB));
        when(groupSlipRepo.findByVehicleGroupIdInAndIsDeletedFalseOrderByVehicleGroupIdAscSequenceAsc(List.of(groupAId, groupBId)))
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
        when(groupRepo.findByDispatchTaskIdInAndIsDeletedFalseOrderByDispatchTaskIdAscSequenceAsc(List.of(taskId)))
                .thenReturn(List.of(groupA, groupB));
        when(groupSlipRepo.findByVehicleGroupIdInAndIsDeletedFalseOrderByVehicleGroupIdAscSequenceAsc(List.of(groupAId, groupBId)))
                .thenReturn(List.of(mappingA, mappingB));
        when(slipRepo.findAllByIdInAndIsDeletedFalse(java.util.Set.of(slipAId, slipBId)))
                .thenReturn(List.of(slipA, slipB));
        when(driverRepo.findByVehicleGroupIdInAndIsDeletedFalse(List.of(groupAId, groupBId)))
                .thenReturn(List.of());

        var detail = svc.detail(taskId);

        assertThat(detail.duplicateSlipIds()).isEmpty();
    }

    private static void setId(Object entity, UUID id) throws Exception {
        Field f = entity.getClass().getDeclaredField("id");
        f.setAccessible(true);
        f.set(entity, id);
    }
}
