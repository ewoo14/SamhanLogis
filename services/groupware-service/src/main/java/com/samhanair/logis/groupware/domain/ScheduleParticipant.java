package com.samhanair.logis.groupware.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.UuidGenerator;

/**
 * 일정 참여자 (1 schedule : N participant).
 *
 * <p>{@link Schedule} 의 cascade ALL + orphanRemoval 로 라이프사이클 동기.
 */
@Entity
@Getter
@Table(name = "schedule_participants")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ScheduleParticipant extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "schedule_id", nullable = false, updatable = false)
    private Schedule schedule;

    @Column(name = "participant_id", nullable = false, updatable = false)
    private UUID participantId;

    /** 알림 발행 요청을 등록한 시각. null이면 확정 시 일정 알림을 아직 요청하지 않은 참여자다. */
    @Column(name = "notification_requested_at")
    private LocalDateTime notificationRequestedAt;

    private ScheduleParticipant(Schedule schedule, UUID participantId) {
        this.schedule = schedule;
        this.participantId = participantId;
    }

    static ScheduleParticipant create(Schedule schedule, UUID participantId) {
        return new ScheduleParticipant(schedule, participantId);
    }

    /**
     * 같은 일정·참여자 조합에 대한 알림 발행 요청을 한 번만 허용한다.
     *
     * @return 이번 호출에서 처음 요청으로 기록했으면 true
     */
    public boolean markNotificationRequested() {
        if (notificationRequestedAt != null) {
            return false;
        }
        notificationRequestedAt = LocalDateTime.now();
        return true;
    }
}
