package com.samhanair.logis.slip.service.dispatch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.shared.realtime.collection.CollectionRealtimePublisher;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.dispatch.DispatchTask;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroup;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroupSlip;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleType;
import com.samhanair.logis.slip.domain.dispatch.MatchedDriver;
import com.samhanair.logis.slip.domain.dispatch.MatchedDriverSource;
import com.samhanair.logis.slip.dto.dispatch.SetMatchedDriverRequest;
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
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;

/**
 * 수동 기사 기입은 연락처를 선택값으로 취급하고 soft-delete/동시성 방어를 서비스에서 보장한다.
 */
@ExtendWith(MockitoExtension.class)
class DispatchMatchedDriverManualServiceTest {

    @Mock DispatchTaskRepository taskRepo;
    @Mock DispatchVehicleGroupRepository groupRepo;
    @Mock DispatchVehicleGroupSlipRepository slipMapRepo;
    @Mock SlipRepository slipRepo;
    @Mock MatchedDriverRepository matchedRepo;
    @Mock DispatchTaskHistoryQueryService historyQueryService;
    @Mock CollectionRealtimePublisher collectionPublisher;

    @Test
    void setMatchedDriver_allows_blank_phone_and_persists_null() throws Exception {
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        DispatchTask task = DispatchTask.create("2099/06/12-1", LocalDate.of(2099, 6, 12));
        setId(task, taskId);
        DispatchVehicleGroup group = DispatchVehicleGroup.create(taskId, 1, DispatchVehicleType.TONNAGE_1);
        setId(group, groupId);

        when(taskRepo.findByIdAndIsDeletedFalse(taskId)).thenReturn(Optional.of(task));
        when(groupRepo.findByIdAndIsDeletedFalse(groupId)).thenReturn(Optional.of(group));
        when(matchedRepo.findByVehicleGroupIdAndIsDeletedFalse(groupId)).thenReturn(Optional.empty());

        DispatchMatchedDriverManualService service = new DispatchMatchedDriverManualService(
                taskRepo, groupRepo, slipMapRepo, slipRepo, matchedRepo, historyQueryService, collectionPublisher);
        service.setMatchedDriver(taskId, groupId,
                new SetMatchedDriverRequest("Manual Driver", "", "12A3456", MatchedDriverSource.OTHER));

        ArgumentCaptor<MatchedDriver> matchedCaptor = ArgumentCaptor.forClass(MatchedDriver.class);
        verify(matchedRepo).saveAndFlush(matchedCaptor.capture());
        assertThat(matchedCaptor.getValue().getDriverPhoneNumber()).isNull();
        verify(collectionPublisher).publishChange(
                eq(DispatchBoardRealtime.CHANNEL_ID),
                eq(DispatchBoardRealtime.EVENT_CHANGED),
                argThat(payload -> hasChangeType(payload, "UPDATED")));
    }

    @Test
    void setMatchedDriver_allows_dispatched_task_history_record() throws Exception {
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        DispatchTask task = DispatchTask.create("2099/06/12-4", LocalDate.of(2099, 6, 12));
        task.markDispatching();
        task.markDispatched(UUID.randomUUID());
        setId(task, taskId);
        DispatchVehicleGroup group = DispatchVehicleGroup.create(taskId, 1, DispatchVehicleType.TONNAGE_1);
        group.markDispatched();
        setId(group, groupId);

        when(taskRepo.findByIdAndIsDeletedFalse(taskId)).thenReturn(Optional.of(task));
        when(groupRepo.findByIdAndIsDeletedFalse(groupId)).thenReturn(Optional.of(group));
        when(matchedRepo.findByVehicleGroupIdAndIsDeletedFalse(groupId)).thenReturn(Optional.empty());

        DispatchMatchedDriverManualService service = new DispatchMatchedDriverManualService(
                taskRepo, groupRepo, slipMapRepo, slipRepo, matchedRepo, historyQueryService, collectionPublisher);
        service.setMatchedDriver(taskId, groupId,
                new SetMatchedDriverRequest("경기기사", "010-1111-2222", "12가3456",
                        MatchedDriverSource.GYEONGGI_QUICK));

        ArgumentCaptor<MatchedDriver> matchedCaptor = ArgumentCaptor.forClass(MatchedDriver.class);
        verify(matchedRepo).saveAndFlush(matchedCaptor.capture());
        assertThat(matchedCaptor.getValue().getDriverSource()).isEqualTo(MatchedDriverSource.GYEONGGI_QUICK);
        assertThat(matchedCaptor.getValue().getDriverName()).isEqualTo("경기기사");
    }

    @Test
    void setMatchedDriver_rejects_arologis_source_from_manual_path() throws Exception {
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        DispatchTask task = DispatchTask.create("2099/06/12-5", LocalDate.of(2099, 6, 12));
        setId(task, taskId);
        DispatchVehicleGroup group = DispatchVehicleGroup.create(taskId, 1, DispatchVehicleType.TONNAGE_1);
        setId(group, groupId);

        when(taskRepo.findByIdAndIsDeletedFalse(taskId)).thenReturn(Optional.of(task));
        when(groupRepo.findByIdAndIsDeletedFalse(groupId)).thenReturn(Optional.of(group));

        DispatchMatchedDriverManualService service = new DispatchMatchedDriverManualService(
                taskRepo, groupRepo, slipMapRepo, slipRepo, matchedRepo, historyQueryService, collectionPublisher);

        assertThatThrownBy(() -> service.setMatchedDriver(taskId, groupId,
                new SetMatchedDriverRequest("아로로지스 위장", "010-1111-2222", "12가3456",
                        MatchedDriverSource.AROLOGIS)))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
    }

    /**
     * #725 H-1 — recordableTask 위반(작성/발송/완료 외 상태) 메시지는
     * {@link com.samhanair.logis.slip.domain.dispatch.DispatchTaskStatus#getDisplayName()} 한국어
     * 라벨만 사용해야 한다(원어 FAILED 유출 금지). FE {@code dispatchErrorMessage.ts} 가
     * BusinessException message 를 그대로 배너에 노출한다.
     */
    @Test
    void setMatchedDriver_rejects_non_recordable_task_status_with_korean_displayname_only() throws Exception {
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        DispatchTask task = DispatchTask.create("2099/06/12-7", LocalDate.of(2099, 6, 12));
        setId(task, taskId);
        task.markDispatching();
        task.markFailed("가용 기사 0명");
        DispatchVehicleGroup group = DispatchVehicleGroup.create(taskId, 1, DispatchVehicleType.TONNAGE_1);
        setId(group, groupId);

        when(taskRepo.findByIdAndIsDeletedFalse(taskId)).thenReturn(Optional.of(task));
        when(groupRepo.findByIdAndIsDeletedFalse(groupId)).thenReturn(Optional.of(group));

        DispatchMatchedDriverManualService service = new DispatchMatchedDriverManualService(
                taskRepo, groupRepo, slipMapRepo, slipRepo, matchedRepo, historyQueryService, collectionPublisher);

        assertThatThrownBy(() -> service.setMatchedDriver(taskId, groupId,
                new SetMatchedDriverRequest("Manual Driver", null, "12A3456", MatchedDriverSource.OTHER)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("배차 불가")
                .hasMessageNotContaining("FAILED");
    }

    /**
     * #725 H-1 — editableTask 위반(작성 중/발송 중 외 상태) 메시지는
     * {@link com.samhanair.logis.slip.domain.dispatch.DispatchTaskStatus#getDisplayName()} 한국어
     * 라벨만 사용해야 한다(원어 DISPATCHED 유출 금지).
     */
    @Test
    void markManualDispatchComplete_rejects_non_editable_task_status_with_korean_displayname_only() throws Exception {
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        DispatchTask task = DispatchTask.create("2099/06/12-8", LocalDate.of(2099, 6, 12));
        setId(task, taskId);
        task.markDispatching();
        task.markDispatched(UUID.randomUUID());
        DispatchVehicleGroup group = DispatchVehicleGroup.create(taskId, 1, DispatchVehicleType.TONNAGE_1);
        setId(group, groupId);

        when(taskRepo.findByIdAndIsDeletedFalse(taskId)).thenReturn(Optional.of(task));
        when(groupRepo.findByIdAndIsDeletedFalse(groupId)).thenReturn(Optional.of(group));

        DispatchMatchedDriverManualService service = new DispatchMatchedDriverManualService(
                taskRepo, groupRepo, slipMapRepo, slipRepo, matchedRepo, historyQueryService, collectionPublisher);

        assertThatThrownBy(() -> service.markManualDispatchComplete(taskId, groupId))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("배차 완료")
                .hasMessageNotContaining("DISPATCHED");
    }

    @Test
    void setMatchedDriver_ignores_soft_deleted_group() {
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();

        DispatchTask task = DispatchTask.create("2099/06/12-2", LocalDate.of(2099, 6, 12));
        when(taskRepo.findByIdAndIsDeletedFalse(taskId)).thenReturn(Optional.of(task));
        when(groupRepo.findByIdAndIsDeletedFalse(groupId)).thenReturn(Optional.empty());

        DispatchMatchedDriverManualService service = new DispatchMatchedDriverManualService(
                taskRepo, groupRepo, slipMapRepo, slipRepo, matchedRepo, historyQueryService, collectionPublisher);

        assertThatThrownBy(() -> service.setMatchedDriver(taskId, groupId,
                new SetMatchedDriverRequest("Manual Driver", null, "12A3456", MatchedDriverSource.OTHER)))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.NOT_FOUND));
    }

    @Test
    void setMatchedDriver_create_unique_conflict_returns_business_conflict() throws Exception {
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        DispatchTask task = DispatchTask.create("2099/06/12-3", LocalDate.of(2099, 6, 12));
        setId(task, taskId);
        DispatchVehicleGroup group = DispatchVehicleGroup.create(taskId, 1, DispatchVehicleType.TONNAGE_1);
        setId(group, groupId);

        when(taskRepo.findByIdAndIsDeletedFalse(taskId)).thenReturn(Optional.of(task));
        when(groupRepo.findByIdAndIsDeletedFalse(groupId)).thenReturn(Optional.of(group));
        when(matchedRepo.findByVehicleGroupIdAndIsDeletedFalse(groupId)).thenReturn(Optional.empty());
        when(matchedRepo.saveAndFlush(any(MatchedDriver.class)))
                .thenThrow(new DataIntegrityViolationException("uq_matched_driver_group_active"));

        DispatchMatchedDriverManualService service = new DispatchMatchedDriverManualService(
                taskRepo, groupRepo, slipMapRepo, slipRepo, matchedRepo, historyQueryService, collectionPublisher);

        assertThatThrownBy(() -> service.setMatchedDriver(taskId, groupId,
                new SetMatchedDriverRequest("Manual Driver", null, "12A3456", MatchedDriverSource.OTHER)))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
    }

    @Test
    void markManualDispatchComplete_publishes_status_changed_after_group_and_slip_status_update() throws Exception {
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        UUID slipId = UUID.randomUUID();
        DispatchTask task = DispatchTask.create("2099/06/12-6", LocalDate.of(2099, 6, 12));
        setId(task, taskId);
        DispatchVehicleGroup group = DispatchVehicleGroup.create(taskId, 1, DispatchVehicleType.TONNAGE_1);
        setId(group, groupId);
        MatchedDriver matched = MatchedDriver.create(
                groupId, "MANUAL", "수동기사", null, MatchedDriverSource.OTHER, "12가3456");
        DispatchVehicleGroupSlip mapping = DispatchVehicleGroupSlip.create(groupId, slipId, 1);
        Slip slip = org.mockito.Mockito.mock(Slip.class);

        when(taskRepo.findByIdAndIsDeletedFalse(taskId)).thenReturn(Optional.of(task));
        when(groupRepo.findByIdAndIsDeletedFalse(groupId)).thenReturn(Optional.of(group));
        when(matchedRepo.findByVehicleGroupIdAndIsDeletedFalse(groupId)).thenReturn(Optional.of(matched));
        when(slipMapRepo.findByVehicleGroupIdAndIsDeletedFalseOrderBySequenceAsc(groupId))
                .thenReturn(List.of(mapping));
        when(slipRepo.findById(slipId)).thenReturn(Optional.of(slip));
        when(groupRepo.findByDispatchTaskIdAndIsDeletedFalseOrderBySequenceAsc(taskId))
                .thenReturn(List.of(group));

        DispatchMatchedDriverManualService service = new DispatchMatchedDriverManualService(
                taskRepo, groupRepo, slipMapRepo, slipRepo, matchedRepo, historyQueryService, collectionPublisher);

        service.markManualDispatchComplete(taskId, groupId);

        verify(slip).markDispatchConfirmed();
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
