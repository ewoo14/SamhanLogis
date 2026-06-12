package com.samhanair.logis.slip.service.dispatch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
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
import com.samhanair.logis.slip.domain.dispatch.MatchedDriver;
import com.samhanair.logis.slip.dto.dispatch.DispatchTaskConfirmRequest;
import com.samhanair.logis.slip.dto.dispatch.DispatchTaskUnavailableRequest;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchTaskRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchVehicleGroupRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchVehicleGroupSlipRepository;
import com.samhanair.logis.slip.repository.dispatch.MatchedDriverRepository;
import java.lang.reflect.Field;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * {@link DispatchTaskConfirmService} + {@link DispatchTaskUnavailableService} 단위 검증 — BE Task B10.
 */
@ExtendWith(MockitoExtension.class)
class DispatchConfirmAndUnavailableServiceTest {

    @Mock DispatchTaskRepository taskRepo;
    @Mock DispatchVehicleGroupRepository groupRepo;
    @Mock DispatchVehicleGroupSlipRepository slipMapRepo;
    @Mock SlipRepository slipRepo;
    @Mock MatchedDriverRepository matchedRepo;
    @Mock NotificationClient notificationClient;

    @InjectMocks DispatchTaskConfirmService confirmSvc;

    @Test
    void confirm_marks_DISPATCHED_and_saves_matched_driver_and_slip_status() throws Exception {
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        UUID slipId = UUID.randomUUID();

        DispatchTask task = DispatchTask.create("2026/05/14-1", LocalDate.now());
        setId(task, taskId);
        task.markDispatching();

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
        when(matchedRepo.findByVehicleGroupIdAndIsDeletedFalse(groupId)).thenReturn(Optional.empty());

        UUID arologisId = UUID.randomUUID();
        String vehiclePlateNumber = "12가3456";
        DispatchTaskConfirmRequest req = new DispatchTaskConfirmRequest(
                arologisId,
                List.of(new DispatchTaskConfirmRequest.MatchedDriverPayload(
                        1, "TONNAGE_1", "D-001", "홍길동",
                        "010-1234-5678", "EXTERNAL_INSUNG_QUICK",
                        vehiclePlateNumber)),
                Instant.now());

        confirmSvc.confirm(taskId, req);

        assertThat(task.getStatus()).isEqualTo(DispatchTaskStatus.DISPATCHED);
        assertThat(task.getArologisDispatchId()).isEqualTo(arologisId);
        ArgumentCaptor<MatchedDriver> matchedCaptor = ArgumentCaptor.forClass(MatchedDriver.class);
        verify(matchedRepo).save(matchedCaptor.capture());
        assertThat(matchedCaptor.getValue().getVehiclePlateNumber()).isEqualTo(vehiclePlateNumber);
        verify(slip).markDispatchConfirmed();
    }

    @Test
    void confirm_rejects_unknown_vehicleGroupSequence_before_markDispatched() throws Exception {
        UUID taskId = UUID.randomUUID();
        DispatchTask task = DispatchTask.create("2026/05/14-UNKNOWN-SEQ", LocalDate.now());
        setId(task, taskId);
        task.markDispatching();

        DispatchVehicleGroup group = DispatchVehicleGroup.create(taskId, 1, DispatchVehicleType.TONNAGE_1);
        setId(group, UUID.randomUUID());

        when(taskRepo.findById(taskId)).thenReturn(Optional.of(task));
        when(groupRepo.findByDispatchTaskIdAndIsDeletedFalseOrderBySequenceAsc(taskId))
                .thenReturn(List.of(group));

        DispatchTaskConfirmRequest req = new DispatchTaskConfirmRequest(
                UUID.randomUUID(),
                List.of(new DispatchTaskConfirmRequest.MatchedDriverPayload(
                        2, "TONNAGE_1", "D-002", "이몽룡",
                        "010-2222-3333", "EXTERNAL_INSUNG_QUICK", "34나5678")),
                Instant.now());

        assertThatThrownBy(() -> confirmSvc.confirm(taskId, req))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("vehicleGroupSequence 미존재: 2");
        assertThat(task.getStatus()).isEqualTo(DispatchTaskStatus.DISPATCHING);
        verify(taskRepo, never()).save(task);
        verify(matchedRepo, never()).save(any());
    }

    @Test
    void confirm_rejects_duplicate_vehicleGroupSequence_before_markDispatched() throws Exception {
        UUID taskId = UUID.randomUUID();
        DispatchTask task = DispatchTask.create("2026/05/14-DUP-SEQ", LocalDate.now());
        setId(task, taskId);
        task.markDispatching();

        DispatchVehicleGroup group = DispatchVehicleGroup.create(taskId, 1, DispatchVehicleType.TONNAGE_1);
        setId(group, UUID.randomUUID());

        when(taskRepo.findById(taskId)).thenReturn(Optional.of(task));
        when(groupRepo.findByDispatchTaskIdAndIsDeletedFalseOrderBySequenceAsc(taskId))
                .thenReturn(List.of(group));

        DispatchTaskConfirmRequest req = new DispatchTaskConfirmRequest(
                UUID.randomUUID(),
                List.of(
                        new DispatchTaskConfirmRequest.MatchedDriverPayload(
                                1, "TONNAGE_1", "D-001", "홍길동",
                                "010-1234-5678", "EXTERNAL_INSUNG_QUICK", "12가3456"),
                        new DispatchTaskConfirmRequest.MatchedDriverPayload(
                                1, "TONNAGE_1", "D-002", "이몽룡",
                                "010-2222-3333", "EXTERNAL_INSUNG_QUICK", "34나5678")),
                Instant.now());

        assertThatThrownBy(() -> confirmSvc.confirm(taskId, req))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("vehicleGroupSequence 중복: 1");
        assertThat(task.getStatus()).isEqualTo(DispatchTaskStatus.DISPATCHING);
        verify(taskRepo, never()).save(task);
        verify(matchedRepo, never()).save(any());
    }

    @Test
    void confirm_from_DRAFT_throws() throws Exception {
        UUID taskId = UUID.randomUUID();
        DispatchTask task = DispatchTask.create("2026/05/14-2", LocalDate.now());
        setId(task, taskId);
        when(taskRepo.findById(taskId)).thenReturn(Optional.of(task));

        DispatchTaskConfirmRequest req = new DispatchTaskConfirmRequest(
                UUID.randomUUID(),
                List.of(new DispatchTaskConfirmRequest.MatchedDriverPayload(
                        1, "TONNAGE_1", "D-001", "홍길동", "010-x", "INTERNAL_APP", null)),
                Instant.now());
        assertThatThrownBy(() -> confirmSvc.confirm(taskId, req))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void unavailable_marks_FAILED_and_returns_slip_to_UNDISPATCHED() throws Exception {
        DispatchTaskUnavailableService unavailSvc = new DispatchTaskUnavailableService(
                taskRepo, groupRepo, slipMapRepo, slipRepo, notificationClient);

        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        UUID slipId = UUID.randomUUID();

        DispatchTask task = DispatchTask.create("2026/05/14-3", LocalDate.now());
        setId(task, taskId);
        task.markDispatching();

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

        DispatchTaskUnavailableRequest req = new DispatchTaskUnavailableRequest(
                UUID.randomUUID(), "가용 기사 0명", List.of(1));

        unavailSvc.unavailable(taskId, req);

        assertThat(task.getStatus()).isEqualTo(DispatchTaskStatus.FAILED);
        assertThat(task.getFailureReason()).isEqualTo("가용 기사 0명");
        verify(slip).markDispatchReleased();
    }

    @Test
    void unavailable_empty_failedGroups_targets_all_groups() throws Exception {
        DispatchTaskUnavailableService unavailSvc = new DispatchTaskUnavailableService(
                taskRepo, groupRepo, slipMapRepo, slipRepo, notificationClient);

        UUID taskId = UUID.randomUUID();
        UUID g1Id = UUID.randomUUID();
        UUID g2Id = UUID.randomUUID();

        DispatchTask task = DispatchTask.create("2026/05/14-4", LocalDate.now());
        setId(task, taskId);
        task.markDispatching();

        DispatchVehicleGroup g1 = DispatchVehicleGroup.create(taskId, 1, DispatchVehicleType.TONNAGE_1);
        DispatchVehicleGroup g2 = DispatchVehicleGroup.create(taskId, 2, DispatchVehicleType.DAMAS);
        setId(g1, g1Id);
        setId(g2, g2Id);

        when(taskRepo.findById(taskId)).thenReturn(Optional.of(task));
        when(groupRepo.findByDispatchTaskIdAndIsDeletedFalseOrderBySequenceAsc(taskId))
                .thenReturn(List.of(g1, g2));
        when(slipMapRepo.findByVehicleGroupIdAndIsDeletedFalseOrderBySequenceAsc(any()))
                .thenReturn(List.of());

        DispatchTaskUnavailableRequest req = new DispatchTaskUnavailableRequest(
                UUID.randomUUID(), "전체 매칭 불가", null);

        unavailSvc.unavailable(taskId, req);

        assertThat(task.getStatus()).isEqualTo(DispatchTaskStatus.FAILED);
    }

    private static void setId(Object entity, UUID id) throws Exception {
        Field f = entity.getClass().getDeclaredField("id");
        f.setAccessible(true);
        f.set(entity, id);
    }
}
