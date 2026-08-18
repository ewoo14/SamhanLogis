package com.samhanair.logis.groupware.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.samhanair.logis.groupware.client.UserClient;
import com.samhanair.logis.groupware.domain.Schedule;
import com.samhanair.logis.groupware.domain.ScheduleStatus;
import com.samhanair.logis.groupware.dto.ScheduleRequest;
import com.samhanair.logis.groupware.dto.ScheduleResponse;
import com.samhanair.logis.groupware.repository.ScheduleRepository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * 일정 도메인·서비스 단위 테스트:
 * <ol>
 *   <li>확정 일정의 알림 callback 미등록</li>
 *   <li>작성자 자동 대상자 포함 및 제거 방어</li>
 *   <li>일정 도메인 기본 검증·참여자 idempotent·취소</li>
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
class ScheduleServiceTest {

    @Mock
    private ScheduleRepository repository;

    @Mock
    private UserClient userClient;

    @InjectMocks
    private ScheduleService scheduleService;

    @Test
    void create_confirmed_schedule_does_not_register_notification_callback() {
        UUID owner = UUID.randomUUID();
        UUID participant = UUID.randomUUID();
        LocalDateTime starts = LocalDateTime.now().plusDays(1);
        when(userClient.exists(any(UUID.class))).thenReturn(true);
        when(repository.save(any(Schedule.class))).thenAnswer(invocation -> invocation.getArgument(0));

        TransactionSynchronizationManager.initSynchronization();
        try {
            scheduleService.create(new ScheduleRequest(
                    owner, "확정 회의", "참여자 알림", starts, starts.plusHours(1),
                    ScheduleStatus.CONFIRMED, List.of(participant)), owner);

            assertThat(TransactionSynchronizationManager.getSynchronizations()).isEmpty();
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    void create_includes_owner_in_response_participants() {
        UUID owner = UUID.randomUUID();
        UUID participant = UUID.randomUUID();
        LocalDateTime starts = LocalDateTime.now().plusDays(1);
        when(userClient.exists(any(UUID.class))).thenReturn(true);
        when(repository.save(any(Schedule.class))).thenAnswer(invocation -> invocation.getArgument(0));

        Schedule created = scheduleService.create(new ScheduleRequest(
                owner, "작성자 포함 일정", null, starts, starts.plusHours(1),
                ScheduleStatus.DRAFT, List.of(participant)), owner);

        assertThat(ScheduleResponse.from(created).scheduleId()).isEqualTo(created.getId());
    }

    @Test
    void response_includes_owner_for_legacy_ownerless_schedule() {
        UUID owner = UUID.randomUUID();
        LocalDateTime starts = LocalDateTime.now().plusDays(1);
        Schedule legacy = Schedule.create(owner, "기존 owner-less 일정", null,
                starts, starts.plusHours(1), ScheduleStatus.DRAFT);

        assertThat(ScheduleResponse.from(legacy).scheduleId()).isEqualTo(legacy.getId());
    }

    @Test
    void owner_cannot_be_removed_from_schedule_participants() {
        UUID owner = UUID.randomUUID();
        LocalDateTime starts = LocalDateTime.now().plusDays(1);
        Schedule schedule = Schedule.create(owner, "작성자 보호 일정", null,
                starts, starts.plusHours(1), ScheduleStatus.DRAFT);
        schedule.addParticipant(owner);

        schedule.removeParticipant(owner, owner.toString());

        assertThat(schedule.getParticipantsView())
                .extracting(p -> p.getParticipantId())
                .containsExactly(owner);
    }

    @Test
    void delete_soft_deletes_all_schedule_participants() {
        UUID owner = UUID.randomUUID();
        UUID participant = UUID.randomUUID();
        LocalDateTime starts = LocalDateTime.now().plusDays(1);
        Schedule schedule = Schedule.create(owner, "대상자 정리 일정", null,
                starts, starts.plusHours(1), ScheduleStatus.DRAFT);
        schedule.addParticipant(owner);
        schedule.addParticipant(participant);
        when(repository.findById(schedule.getId())).thenReturn(java.util.Optional.of(schedule));

        scheduleService.delete(schedule.getId(), owner);

        assertThat(schedule.getParticipants())
                .hasSize(2)
                .allSatisfy(row -> assertThat(row.getIsDeleted()).isTrue());
        assertThat(schedule.getParticipantsView()).isEmpty();
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
