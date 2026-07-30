package com.samhanair.logis.groupware.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 일정 1건 — 소유자 / 시작-종료 / 제목 / 참여자 목록.
 *
 * <p>참여자는 {@link ScheduleParticipant} 별도 entity (cascade ALL) 로 보관.
 * 단순 참석 요청만 표현 (참여 응답 acceptance 는 후속 슬라이스).
 */
@Entity
@Getter
@Table(name = "schedules")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class Schedule extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "owner_id", nullable = false, updatable = false)
    private UUID ownerId;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "description", length = 2000)
    private String description;

    @Column(name = "starts_at", nullable = false)
    private LocalDateTime startsAt;

    @Column(name = "ends_at", nullable = false)
    private LocalDateTime endsAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private ScheduleStatus status;

    @OneToMany(mappedBy = "schedule", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<ScheduleParticipant> participants = new ArrayList<>();

    private Schedule(UUID ownerId, String title, String description,
                     LocalDateTime startsAt, LocalDateTime endsAt, ScheduleStatus status) {
        if (ownerId == null) {
            throw new IllegalArgumentException("ownerId 필수");
        }
        if (title == null || title.isBlank()) {
            throw new IllegalArgumentException("title 필수");
        }
        if (startsAt == null || endsAt == null) {
            throw new IllegalArgumentException("startsAt / endsAt 필수");
        }
        if (!endsAt.isAfter(startsAt)) {
            throw new IllegalArgumentException("endsAt 은 startsAt 이후여야 합니다");
        }
        this.ownerId = ownerId;
        this.title = title;
        this.description = description;
        this.startsAt = startsAt;
        this.endsAt = endsAt;
        this.status = status == null ? ScheduleStatus.DRAFT : status;
    }

    /**
     * 신규 일정 등록. status 미지정 시 DRAFT.
     */
    public static Schedule create(UUID ownerId, String title, String description,
                                  LocalDateTime startsAt, LocalDateTime endsAt, ScheduleStatus status) {
        return new Schedule(ownerId, title, description, startsAt, endsAt, status);
    }

    /** 일정 정보 수정. status / 시간 / 제목 / 본문 모두 갱신. ownerId 는 변경 불가. */
    public void update(String title, String description,
                       LocalDateTime startsAt, LocalDateTime endsAt, ScheduleStatus status) {
        if (title == null || title.isBlank()) {
            throw new IllegalArgumentException("title 필수");
        }
        if (startsAt == null || endsAt == null || !endsAt.isAfter(startsAt)) {
            throw new IllegalArgumentException("startsAt < endsAt 필수");
        }
        this.title = title;
        this.description = description;
        this.startsAt = startsAt;
        this.endsAt = endsAt;
        if (status != null) {
            this.status = status;
        }
    }

    /**
     * 참여자 추가. 중복 추가 시 idempotent (no-op).
     *
     * @param participantId 참여자 user UUID
     */
    public void addParticipant(UUID participantId) {
        if (participantId == null) {
            throw new IllegalArgumentException("participantId 필수");
        }
        ScheduleParticipant existing = this.participants.stream()
                .filter(p -> p.getParticipantId().equals(participantId))
                .findFirst()
                .orElse(null);
        if (existing != null) {
            if (Boolean.TRUE.equals(existing.getIsDeleted())) {
                existing.markRestored();
            }
            return;
        }
        this.participants.add(ScheduleParticipant.create(this, participantId));
    }

    /** 참여자 제거. 미존재 시 no-op. */
    public void removeParticipant(UUID participantId) {
        removeParticipant(participantId, "system");
    }

    /** 참여자 soft-delete. 알림 발행 이력은 재추가 시 중복 발행 방지를 위해 보존한다. */
    public void removeParticipant(UUID participantId, String deletedBy) {
        this.participants.stream()
                .filter(p -> p.getParticipantId().equals(participantId))
                .findFirst()
                .ifPresent(p -> p.markDeleted(deletedBy));
    }

    /** 일정 취소 — status=CANCELLED. */
    public void cancel() {
        this.status = ScheduleStatus.CANCELLED;
    }

    public List<ScheduleParticipant> getParticipantsView() {
        return this.participants.stream()
                .filter(p -> !Boolean.TRUE.equals(p.getIsDeleted()))
                .toList();
    }
}
