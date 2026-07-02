package com.samhanair.logis.slip.service.dispatch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.shared.realtime.collection.CollectionRealtimePublisher;
import com.samhanair.logis.slip.client.ArologisDispatchClient;
import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.domain.dispatch.DispatchTask;
import com.samhanair.logis.slip.domain.dispatch.DispatchTaskStatus;
import com.samhanair.logis.slip.dto.dispatch.ArologisCancellationRequest;
import com.samhanair.logis.slip.repository.dispatch.DispatchTaskRepository;
import com.samhanair.logis.slip.realtime.DispatchBoardRealtime;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * {@link DispatchTaskCancellationRequestService} 단위 검증 — Phase C BE Task B4.
 */
@ExtendWith(MockitoExtension.class)
class DispatchTaskCancellationRequestServiceTest {

    @Mock DispatchTaskRepository taskRepo;
    @Mock ArologisDispatchClient arologisClient;
    @Mock NotificationClient notificationClient;
    @Mock CollectionRealtimePublisher collectionPublisher;

    @InjectMocks DispatchTaskCancellationRequestService svc;

    @Test
    void request_marks_CANCEL_REQUESTED_and_calls_arologis() throws Exception {
        UUID taskId = UUID.randomUUID();
        UUID arologisId = UUID.randomUUID();
        DispatchTask task = dispatchedTask(taskId, arologisId);

        when(taskRepo.findById(taskId)).thenReturn(Optional.of(task));

        DispatchTask res = svc.request(taskId, "거래처 일정 변경", "user-a");

        assertThat(res.getStatus()).isEqualTo(DispatchTaskStatus.CANCEL_REQUESTED);
        assertThat(res.getModificationReason()).isEqualTo("거래처 일정 변경");
        verify(arologisClient).requestCancellation(eq(arologisId), any(ArologisCancellationRequest.class));
        verify(collectionPublisher).publishChange(
                eq(DispatchBoardRealtime.CHANNEL_ID),
                eq(DispatchBoardRealtime.EVENT_CHANGED),
                argThat(payload -> hasChangeType(payload, "STATUS_CHANGED")));
    }

    @Test
    void request_from_DRAFT_throws_CONFLICT() throws Exception {
        UUID taskId = UUID.randomUUID();
        DispatchTask task = DispatchTask.create("2026/05/14-1", LocalDate.now());
        setId(task, taskId);
        setArologisDispatchId(task, UUID.randomUUID());

        when(taskRepo.findById(taskId)).thenReturn(Optional.of(task));

        assertThatThrownBy(() -> svc.request(taskId, null, "user-a"))
                .isInstanceOf(BusinessException.class);
        verify(arologisClient, never()).requestCancellation(any(), any());
    }

    @Test
    void request_without_arologis_dispatch_id_throws_CONFLICT() throws Exception {
        UUID taskId = UUID.randomUUID();
        DispatchTask task = DispatchTask.create("2026/05/14-2", LocalDate.now());
        setId(task, taskId);

        when(taskRepo.findById(taskId)).thenReturn(Optional.of(task));

        assertThatThrownBy(() -> svc.request(taskId, null, "user-a"))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void request_not_found_throws_NOT_FOUND() {
        UUID taskId = UUID.randomUUID();
        when(taskRepo.findById(taskId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> svc.request(taskId, null, "user-a"))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void request_with_null_reason_succeeds() throws Exception {
        UUID taskId = UUID.randomUUID();
        UUID arologisId = UUID.randomUUID();
        DispatchTask task = dispatchedTask(taskId, arologisId);
        when(taskRepo.findById(taskId)).thenReturn(Optional.of(task));

        DispatchTask res = svc.request(taskId, null, "user-a");

        assertThat(res.getStatus()).isEqualTo(DispatchTaskStatus.CANCEL_REQUESTED);
        assertThat(res.getModificationReason()).isNull();
    }

    private static DispatchTask dispatchedTask(UUID taskId, UUID arologisId) throws Exception {
        DispatchTask task = DispatchTask.create("2026/05/14-3", LocalDate.now());
        setId(task, taskId);
        task.markDispatching();
        task.markDispatched(arologisId);
        return task;
    }

    private static void setId(Object entity, UUID id) throws Exception {
        Field f = entity.getClass().getDeclaredField("id");
        f.setAccessible(true);
        f.set(entity, id);
    }

    private static void setArologisDispatchId(DispatchTask task, UUID id) throws Exception {
        Field f = DispatchTask.class.getDeclaredField("arologisDispatchId");
        f.setAccessible(true);
        f.set(task, id);
    }

    private static boolean hasChangeType(Map<String, Object> payload, String expected) {
        return expected.equals(payload.get("changeType"));
    }
}
