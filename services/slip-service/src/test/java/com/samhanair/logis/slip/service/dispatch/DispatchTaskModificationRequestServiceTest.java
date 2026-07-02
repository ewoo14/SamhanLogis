package com.samhanair.logis.slip.service.dispatch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.shared.realtime.collection.CollectionRealtimePublisher;
import com.samhanair.logis.slip.client.ArologisDispatchClient;
import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.domain.dispatch.DispatchTask;
import com.samhanair.logis.slip.domain.dispatch.DispatchTaskStatus;
import com.samhanair.logis.slip.dto.dispatch.ArologisModificationRequest;
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
 * {@link DispatchTaskModificationRequestService} 단위 검증 — Phase C BE Task B3.
 */
@ExtendWith(MockitoExtension.class)
class DispatchTaskModificationRequestServiceTest {

    @Mock DispatchTaskRepository taskRepo;
    @Mock ArologisDispatchClient arologisClient;
    @Mock NotificationClient notificationClient;
    @Mock CollectionRealtimePublisher collectionPublisher;

    @InjectMocks DispatchTaskModificationRequestService svc;

    @Test
    void request_marks_MODIFICATION_REQUESTED_and_calls_arologis() throws Exception {
        UUID taskId = UUID.randomUUID();
        UUID arologisId = UUID.randomUUID();
        DispatchTask task = dispatchedTask(taskId, arologisId);

        when(taskRepo.findById(taskId)).thenReturn(Optional.of(task));

        DispatchTask res = svc.request(taskId, "슬립 추가 필요", "user-a");

        assertThat(res.getStatus()).isEqualTo(DispatchTaskStatus.MODIFICATION_REQUESTED);
        assertThat(res.getModificationReason()).isEqualTo("슬립 추가 필요");
        assertThat(res.getModificationRequestedAt()).isNotNull();
        verify(arologisClient).requestModification(eq(arologisId), any(ArologisModificationRequest.class));
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
        // DRAFT 상태 그대로 — markModificationRequested 가 IllegalStateException → CONFLICT 변환

        when(taskRepo.findById(taskId)).thenReturn(Optional.of(task));

        assertThatThrownBy(() -> svc.request(taskId, null, "user-a"))
                .isInstanceOf(BusinessException.class);
        verify(arologisClient, never()).requestModification(any(), any());
    }

    @Test
    void request_without_arologis_dispatch_id_throws_CONFLICT() throws Exception {
        UUID taskId = UUID.randomUUID();
        DispatchTask task = DispatchTask.create("2026/05/14-2", LocalDate.now());
        setId(task, taskId);
        // arologisDispatchId 미설정 — 의도적 invalid 상태

        when(taskRepo.findById(taskId)).thenReturn(Optional.of(task));

        assertThatThrownBy(() -> svc.request(taskId, null, "user-a"))
                .isInstanceOf(BusinessException.class);
        verify(arologisClient, never()).requestModification(any(), any());
    }

    @Test
    void request_not_found_throws_NOT_FOUND() {
        UUID taskId = UUID.randomUUID();
        when(taskRepo.findById(taskId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> svc.request(taskId, null, "user-a"))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void request_notification_failure_is_graceful() throws Exception {
        UUID taskId = UUID.randomUUID();
        UUID arologisId = UUID.randomUUID();
        DispatchTask task = dispatchedTask(taskId, arologisId);
        when(taskRepo.findById(taskId)).thenReturn(Optional.of(task));
        doThrow(new RuntimeException("notification-service down")).when(notificationClient)
                .sendExternalSms(any(), any(), any());

        DispatchTask res = svc.request(taskId, null, "user-a");

        // notification 실패해도 상태 전이는 완료
        assertThat(res.getStatus()).isEqualTo(DispatchTaskStatus.MODIFICATION_REQUESTED);
    }

    // ---------- 헬퍼 ----------

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
