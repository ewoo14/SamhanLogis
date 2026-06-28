package com.samhanair.logis.dashboard.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 앱 팝업공지.
 *
 * <p>인증 후 앱 셸 부팅 시 현재 KST 게시기간 내 활성 공지만 노출한다. BaseEntity 7 audit와
 * soft-delete만 사용하며 물리 삭제하지 않는다.
 */
@Entity
@Getter
@Table(name = "app_notice")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class AppNotice extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "title", nullable = false, columnDefinition = "TEXT")
    private String title;

    @Column(name = "is_active", nullable = false)
    private boolean active;

    @Column(name = "start_at", nullable = false)
    private LocalDateTime startAt;

    @Column(name = "end_at", nullable = false)
    private LocalDateTime endAt;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    private AppNotice(String title, boolean active, LocalDateTime startAt, LocalDateTime endAt, int displayOrder) {
        apply(title, active, startAt, endAt, displayOrder);
    }

    /** 신규 팝업공지 생성. */
    public static AppNotice create(
            String title,
            boolean active,
            LocalDateTime startAt,
            LocalDateTime endAt,
            int displayOrder) {
        return new AppNotice(title, active, startAt, endAt, displayOrder);
    }

    /** 팝업공지 내용/게시기간/노출 순서를 수정한다. */
    public AppNotice update(
            String title,
            boolean active,
            LocalDateTime startAt,
            LocalDateTime endAt,
            int displayOrder) {
        apply(title, active, startAt, endAt, displayOrder);
        return this;
    }

    /** 팝업공지 soft-delete. */
    public AppNotice softDelete(String actor) {
        markDeleted(actor == null || actor.isBlank() ? "system" : actor);
        return this;
    }

    /** 현재 시각 기준 게시 대상 여부. */
    public boolean isActiveAt(LocalDateTime now) {
        return active && !startAt.isAfter(now) && !endAt.isBefore(now);
    }

    private void apply(
            String title,
            boolean active,
            LocalDateTime startAt,
            LocalDateTime endAt,
            int displayOrder) {
        if (title == null || title.isBlank()) {
            throw new IllegalArgumentException("title 필수");
        }
        if (startAt == null) {
            throw new IllegalArgumentException("startAt 필수");
        }
        if (endAt == null) {
            throw new IllegalArgumentException("endAt 필수");
        }
        if (startAt.isAfter(endAt)) {
            throw new IllegalArgumentException("게시 시작일시는 종료일시보다 늦을 수 없습니다.");
        }
        if (displayOrder < 0) {
            throw new IllegalArgumentException("displayOrder 는 0 이상이어야 합니다.");
        }
        this.title = title.trim();
        this.active = active;
        this.startAt = startAt;
        this.endAt = endAt;
        this.displayOrder = displayOrder;
    }
}
