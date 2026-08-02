package com.samhanair.logis.groupware.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
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

    private ScheduleParticipant(Schedule schedule, UUID participantId) {
        this.schedule = schedule;
        this.participantId = participantId;
    }

    static ScheduleParticipant create(Schedule schedule, UUID participantId) {
        return new ScheduleParticipant(schedule, participantId);
    }

}
