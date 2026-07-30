package com.samhanair.logis.groupware.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.groupware.client.UserClient;
import com.samhanair.logis.groupware.domain.Schedule;
import com.samhanair.logis.groupware.domain.ScheduleStatus;
import com.samhanair.logis.groupware.dto.ScheduleRequest;
import com.samhanair.logis.groupware.repository.ScheduleRepository;
import com.samhanair.logis.notification.publisher.NotificationPublishRequest;
import com.samhanair.logis.notification.publisher.NotificationPublisher;
import com.samhanair.logis.notification.publisher.NotificationPublisherDispatchExecutor;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * 일정 도메인·서비스 단위 테스트:
 * <ol>
 *   <li>확정 대상자 알림의 commit 이후 발행</li>
 *   <li>비확정·롤백 일정의 알림 미발행</li>
 *   <li>수정 신규 대상자 알림 및 중복 방지</li>
 *   <li>일정 도메인 기본 검증·참여자 idempotent·취소</li>
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
class ScheduleServiceTest {

    @Mock
    private ScheduleRepository repository;

    @Mock
    private UserClient userClient;

    @Mock
    private NotificationPublisher notificationPublisher;

    @Mock
    private NotificationPublisherDispatchExecutor notificationPublisherDispatchExecutor;

    @InjectMocks
    private ScheduleService scheduleService;

    @Test
    void create_confirmed_schedule_publishes_to_each_participant_after_commit() {
        UUID owner = UUID.randomUUID();
        UUID participant = UUID.randomUUID();
        UUID scheduleId = UUID.randomUUID();
        LocalDateTime starts = LocalDateTime.now().plusDays(1);
        when(userClient.exists(any(UUID.class))).thenReturn(true);
        when(repository.save(any(Schedule.class))).thenAnswer(invocation -> {
            Schedule saved = invocation.getArgument(0);
            ReflectionTestUtils.setField(saved, "id", scheduleId);
            return saved;
        });
        doAnswer(invocation -> {
            ((Runnable) invocation.getArgument(0)).run();
            return null;
        }).when(notificationPublisherDispatchExecutor).execute(any(Runnable.class));

        TransactionSynchronizationManager.initSynchronization();
        try {
            scheduleService.create(new ScheduleRequest(
                    owner, "확정 회의", "참여자 알림", starts, starts.plusHours(1),
                    ScheduleStatus.CONFIRMED, List.of(participant)), owner);

            verify(notificationPublisher, never()).publish(any(NotificationPublishRequest.class));
            TransactionSynchronizationManager.getSynchronizations()
                    .forEach(TransactionSynchronization::afterCommit);
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }

        ArgumentCaptor<NotificationPublishRequest> captor =
                ArgumentCaptor.forClass(NotificationPublishRequest.class);
        verify(notificationPublisher).publish(captor.capture());
        NotificationPublishRequest request = captor.getValue();
        assertThat(request.channel()).isEqualTo("SCHEDULE");
        assertThat(request.targetRole()).isNull();
        assertThat(request.targetUserId()).isEqualTo(participant);
        assertThat(request.title()).isEqualTo("일정 확정 — 확정 회의");
        assertThat(request.sourceRefId()).isEqualTo(scheduleId + ":" + participant);
    }

    @Test
    void create_non_confirmed_schedule_does_not_publish_notification() {
        UUID owner = UUID.randomUUID();
        UUID participant = UUID.randomUUID();
        when(userClient.exists(any(UUID.class))).thenReturn(true);
        when(repository.save(any(Schedule.class))).thenAnswer(invocation -> invocation.getArgument(0));

        TransactionSynchronizationManager.initSynchronization();
        try {
            scheduleService.create(new ScheduleRequest(
                    owner, "임시 일정", null, LocalDateTime.now().plusDays(1),
                    LocalDateTime.now().plusDays(1).plusHours(1), ScheduleStatus.DRAFT,
                    List.of(participant)), owner);

            verify(notificationPublisher, never()).publish(any(NotificationPublishRequest.class));
            assertThat(TransactionSynchronizationManager.getSynchronizations()).isEmpty();
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    void rolled_back_schedule_does_not_publish_notification_before_commit() {
        UUID owner = UUID.randomUUID();
        UUID participant = UUID.randomUUID();
        UUID scheduleId = UUID.randomUUID();
        when(userClient.exists(any(UUID.class))).thenReturn(true);
        when(repository.save(any(Schedule.class))).thenAnswer(invocation -> {
            Schedule saved = invocation.getArgument(0);
            ReflectionTestUtils.setField(saved, "id", scheduleId);
            return saved;
        });

        TransactionSynchronizationManager.initSynchronization();
        try {
            scheduleService.create(new ScheduleRequest(
                    owner, "롤백 일정", null, LocalDateTime.now().plusDays(1),
                    LocalDateTime.now().plusDays(1).plusHours(1), ScheduleStatus.CONFIRMED,
                    List.of(participant)), owner);

            verify(notificationPublisher, never()).publish(any(NotificationPublishRequest.class));
        } finally {
            // rollback에서는 afterCommit callback을 호출하지 않는다.
            TransactionSynchronizationManager.clearSynchronization();
        }

        verify(notificationPublisher, never()).publish(any(NotificationPublishRequest.class));
    }

    @Test
    void update_confirmed_schedule_publishes_only_new_participant_once() {
        UUID owner = UUID.randomUUID();
        UUID existingParticipant = UUID.randomUUID();
        UUID newParticipant = UUID.randomUUID();
        UUID scheduleId = UUID.randomUUID();
        LocalDateTime starts = LocalDateTime.now().plusDays(1);
        Schedule schedule = Schedule.create(owner, "기존 확정 일정", null,
                starts, starts.plusHours(1), ScheduleStatus.CONFIRMED);
        schedule.addParticipant(existingParticipant);
        schedule.getParticipantsView().get(0).markNotificationRequested();
        ReflectionTestUtils.setField(schedule, "id", scheduleId);
        when(repository.findById(scheduleId)).thenReturn(Optional.of(schedule));
        when(userClient.exists(any(UUID.class))).thenReturn(true);
        executeNotificationsInline();

        TransactionSynchronizationManager.initSynchronization();
        try {
            scheduleService.update(scheduleId, new ScheduleRequest(
                    owner, "수정된 확정 일정", null, starts, starts.plusHours(2),
                    ScheduleStatus.CONFIRMED, List.of(existingParticipant, newParticipant)), owner);

            verify(notificationPublisher, never()).publish(any(NotificationPublishRequest.class));
            TransactionSynchronizationManager.getSynchronizations()
                    .forEach(TransactionSynchronization::afterCommit);
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }

        ArgumentCaptor<NotificationPublishRequest> captor =
                ArgumentCaptor.forClass(NotificationPublishRequest.class);
        verify(notificationPublisher).publish(captor.capture());
        assertThat(captor.getValue().targetUserId()).isEqualTo(newParticipant);

        TransactionSynchronizationManager.initSynchronization();
        try {
            scheduleService.update(scheduleId, new ScheduleRequest(
                    owner, "참여자 제거 후 수정된 확정 일정", null, starts, starts.plusHours(3),
                    ScheduleStatus.CONFIRMED, List.of(existingParticipant)), owner);
            TransactionSynchronizationManager.getSynchronizations()
                    .forEach(TransactionSynchronization::afterCommit);
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }

        TransactionSynchronizationManager.initSynchronization();
        try {
            scheduleService.update(scheduleId, new ScheduleRequest(
                    owner, "참여자 재추가 확정 일정", null, starts, starts.plusHours(4),
                    ScheduleStatus.CONFIRMED, List.of(existingParticipant, newParticipant)), owner);
            TransactionSynchronizationManager.getSynchronizations()
                    .forEach(TransactionSynchronization::afterCommit);
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }

        verify(notificationPublisher, times(1)).publish(any(NotificationPublishRequest.class));
    }

    private void executeNotificationsInline() {
        doAnswer(invocation -> {
            ((Runnable) invocation.getArgument(0)).run();
            return null;
        }).when(notificationPublisherDispatchExecutor).execute(any(Runnable.class));
    }

    @Test
    void create_defaults_to_draft_status_when_status_missing() {
        UUID owner = UUID.randomUUID();
        LocalDateTime starts = LocalDateTime.now().plusDays(1);
        LocalDateTime ends = starts.plusHours(1);

        Schedule s = Schedule.create(owner, "회의", "본문", starts, ends, null);

        assertThat(s.getStatus()).isEqualTo(ScheduleStatus.DRAFT);
        assertThat(s.getStartsAt()).isEqualTo(starts);
        assertThat(s.getEndsAt()).isEqualTo(ends);
    }

    @Test
    void update_rejects_invalid_time_range() {
        UUID owner = UUID.randomUUID();
        LocalDateTime starts = LocalDateTime.now().plusDays(1);
        LocalDateTime ends = starts.plusHours(1);
        Schedule s = Schedule.create(owner, "회의", null, starts, ends, ScheduleStatus.CONFIRMED);

        // endsAt == startsAt → invalid
        assertThatThrownBy(() -> s.update("수정", null, starts, starts, ScheduleStatus.CONFIRMED))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void addParticipant_is_idempotent_for_same_id() {
        UUID owner = UUID.randomUUID();
        UUID p1 = UUID.randomUUID();
        Schedule s = Schedule.create(owner, "회의", null,
                LocalDateTime.now().plusDays(1),
                LocalDateTime.now().plusDays(1).plusHours(1),
                ScheduleStatus.CONFIRMED);

        s.addParticipant(p1);
        s.addParticipant(p1); // idempotent

        assertThat(s.getParticipantsView()).hasSize(1);
        assertThat(s.getParticipantsView().get(0).getParticipantId()).isEqualTo(p1);
    }

    @Test
    void cancel_transitions_status_to_cancelled() {
        UUID owner = UUID.randomUUID();
        Schedule s = Schedule.create(owner, "회의", null,
                LocalDateTime.now().plusDays(1),
                LocalDateTime.now().plusDays(1).plusHours(1),
                ScheduleStatus.CONFIRMED);

        s.cancel();

        assertThat(s.getStatus()).isEqualTo(ScheduleStatus.CANCELLED);
    }
}
