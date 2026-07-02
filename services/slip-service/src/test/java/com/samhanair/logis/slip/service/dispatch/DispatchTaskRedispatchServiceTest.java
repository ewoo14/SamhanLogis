package com.samhanair.logis.slip.service.dispatch;

import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.shared.realtime.collection.CollectionRealtimePublisher;
import com.samhanair.logis.slip.client.ArologisDispatchClient;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.dispatch.DispatchTask;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroup;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroupSlip;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleType;
import com.samhanair.logis.slip.domain.dispatch.MatchedDriver;
import com.samhanair.logis.slip.domain.dispatch.MatchedDriverSource;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchTaskRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchVehicleGroupRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchVehicleGroupSlipRepository;
import com.samhanair.logis.slip.repository.dispatch.MatchedDriverRepository;
import com.samhanair.logis.slip.realtime.DispatchBoardRealtime;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/** 재배차 시작은 보드에 보이는 task/group/slip/driver 상태를 되돌리고 목록 변경을 발화한다. */
@ExtendWith(MockitoExtension.class)
class DispatchTaskRedispatchServiceTest {

    @Mock DispatchTaskRepository taskRepo;
    @Mock DispatchVehicleGroupRepository groupRepo;
    @Mock DispatchVehicleGroupSlipRepository slipMapRepo;
    @Mock SlipRepository slipRepo;
    @Mock MatchedDriverRepository matchedRepo;
    @Mock ArologisDispatchClient arologisDispatchClient;
    @Mock CollectionRealtimePublisher collectionPublisher;

    @Test
    void startRedispatch_publishes_status_changed_after_resetting_visible_board_state() throws Exception {
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        UUID slipId = UUID.randomUUID();
        UUID arologisDispatchId = UUID.randomUUID();

        DispatchTask task = DispatchTask.create("2099/07/02-REDISPATCH", LocalDate.of(2099, 7, 2));
        setId(task, taskId);
        task.markDispatching();
        task.markDispatched(arologisDispatchId);
        task.markModificationRequested("정차 변경");
        task.markModificationAccepted();

        DispatchVehicleGroup group = DispatchVehicleGroup.create(taskId, 1, DispatchVehicleType.TONNAGE_1);
        setId(group, groupId);
        group.markDispatched();
        MatchedDriver matched = MatchedDriver.create(
                groupId, "D-001", "기존기사", "010-0000-0001", MatchedDriverSource.AROLOGIS, "12가3456");
        DispatchVehicleGroupSlip mapping = DispatchVehicleGroupSlip.create(groupId, slipId, 1);
        Slip slip = org.mockito.Mockito.mock(Slip.class);

        when(taskRepo.findByIdAndIsDeletedFalse(taskId)).thenReturn(Optional.of(task));
        when(groupRepo.findByDispatchTaskIdAndIsDeletedFalseOrderBySequenceAsc(taskId))
                .thenReturn(List.of(group));
        when(matchedRepo.findByVehicleGroupIdAndIsDeletedFalse(groupId)).thenReturn(Optional.of(matched));
        when(slipMapRepo.findByVehicleGroupIdAndIsDeletedFalseOrderBySequenceAsc(groupId))
                .thenReturn(List.of(mapping));
        when(slipRepo.findById(slipId)).thenReturn(Optional.of(slip));

        DispatchTaskRedispatchService service = new DispatchTaskRedispatchService(
                taskRepo, groupRepo, slipMapRepo, slipRepo, matchedRepo,
                arologisDispatchClient, collectionPublisher);

        service.startRedispatch(taskId);

        verify(slip).markDispatchCancelled();
        verify(arologisDispatchClient).cancelDispatch(arologisDispatchId);
        verify(collectionPublisher).publishChange(
                eq(DispatchBoardRealtime.CHANNEL_ID),
                eq(DispatchBoardRealtime.EVENT_CHANGED),
                argThat(payload -> hasChangeType(payload, "STATUS_CHANGED")));
    }

    private static void setId(Object entity, UUID id) throws Exception {
        Field f = entity.getClass().getDeclaredField("id");
        f.setAccessible(true);
        f.set(entity, id);
    }

    private static boolean hasChangeType(Map<String, Object> payload, String expected) {
        return expected.equals(payload.get("changeType"));
    }
}
