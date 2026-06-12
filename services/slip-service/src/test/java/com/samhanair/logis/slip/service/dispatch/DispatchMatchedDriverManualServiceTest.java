package com.samhanair.logis.slip.service.dispatch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroup;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleType;
import com.samhanair.logis.slip.domain.dispatch.MatchedDriver;
import com.samhanair.logis.slip.dto.dispatch.SetMatchedDriverRequest;
import com.samhanair.logis.slip.repository.dispatch.DispatchTaskRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchVehicleGroupRepository;
import com.samhanair.logis.slip.repository.dispatch.MatchedDriverRepository;
import java.lang.reflect.Field;
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
    @Mock MatchedDriverRepository matchedRepo;
    @Mock DispatchTaskHistoryQueryService historyQueryService;

    @Test
    void setMatchedDriver_allows_blank_phone_and_persists_null() throws Exception {
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        DispatchVehicleGroup group = DispatchVehicleGroup.create(taskId, 1, DispatchVehicleType.TONNAGE_1);
        setId(group, groupId);

        when(taskRepo.existsByIdAndIsDeletedFalse(taskId)).thenReturn(true);
        when(groupRepo.findByIdAndIsDeletedFalse(groupId)).thenReturn(Optional.of(group));
        when(matchedRepo.findByVehicleGroupIdAndIsDeletedFalse(groupId)).thenReturn(Optional.empty());

        DispatchMatchedDriverManualService service = new DispatchMatchedDriverManualService(
                taskRepo, groupRepo, matchedRepo, historyQueryService);
        service.setMatchedDriver(taskId, groupId,
                new SetMatchedDriverRequest("Manual Driver", "", "12A3456", "Manual Source"));

        ArgumentCaptor<MatchedDriver> matchedCaptor = ArgumentCaptor.forClass(MatchedDriver.class);
        verify(matchedRepo).saveAndFlush(matchedCaptor.capture());
        assertThat(matchedCaptor.getValue().getDriverPhoneNumber()).isNull();
    }

    @Test
    void setMatchedDriver_ignores_soft_deleted_group() {
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();

        when(taskRepo.existsByIdAndIsDeletedFalse(taskId)).thenReturn(true);
        when(groupRepo.findByIdAndIsDeletedFalse(groupId)).thenReturn(Optional.empty());

        DispatchMatchedDriverManualService service = new DispatchMatchedDriverManualService(
                taskRepo, groupRepo, matchedRepo, historyQueryService);

        assertThatThrownBy(() -> service.setMatchedDriver(taskId, groupId,
                new SetMatchedDriverRequest("Manual Driver", null, "12A3456", "Manual Source")))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.NOT_FOUND));
    }

    @Test
    void setMatchedDriver_create_unique_conflict_returns_business_conflict() throws Exception {
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        DispatchVehicleGroup group = DispatchVehicleGroup.create(taskId, 1, DispatchVehicleType.TONNAGE_1);
        setId(group, groupId);

        when(taskRepo.existsByIdAndIsDeletedFalse(taskId)).thenReturn(true);
        when(groupRepo.findByIdAndIsDeletedFalse(groupId)).thenReturn(Optional.of(group));
        when(matchedRepo.findByVehicleGroupIdAndIsDeletedFalse(groupId)).thenReturn(Optional.empty());
        when(matchedRepo.saveAndFlush(any(MatchedDriver.class)))
                .thenThrow(new DataIntegrityViolationException("uq_matched_driver_group_active"));

        DispatchMatchedDriverManualService service = new DispatchMatchedDriverManualService(
                taskRepo, groupRepo, matchedRepo, historyQueryService);

        assertThatThrownBy(() -> service.setMatchedDriver(taskId, groupId,
                new SetMatchedDriverRequest("Manual Driver", null, "12A3456", "Manual Source")))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
    }

    private static void setId(Object entity, UUID id) throws Exception {
        Field f = entity.getClass().getDeclaredField("id");
        f.setAccessible(true);
        f.set(entity, id);
    }
}
