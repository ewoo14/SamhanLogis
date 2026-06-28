package com.samhanair.logis.dashboard.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 앱 팝업공지 이미지 메타데이터.
 *
 * <p>실제 이미지는 MinIO/S3 object key로 저장하고, 조회 시 service가 presigned URL을 발급한다.
 */
@Entity
@Getter
@Table(name = "app_notice_image")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class AppNoticeImage extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "notice_id", nullable = false)
    private UUID noticeId;

    @Column(name = "image_key", nullable = false, length = 500)
    private String imageKey;

    @Column(name = "original_file_name", nullable = false, length = 255)
    private String originalFileName;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    @Column(name = "caption", columnDefinition = "TEXT")
    private String caption;

    private AppNoticeImage(
            UUID noticeId,
            String imageKey,
            String originalFileName,
            int displayOrder,
            String caption) {
        if (noticeId == null) {
            throw new IllegalArgumentException("noticeId 필수");
        }
        if (imageKey == null || imageKey.isBlank()) {
            throw new IllegalArgumentException("imageKey 필수");
        }
        if (originalFileName == null || originalFileName.isBlank()) {
            throw new IllegalArgumentException("originalFileName 필수");
        }
        if (originalFileName.length() > 255) {
            throw new IllegalArgumentException("originalFileName 은 255자를 초과할 수 없습니다.");
        }
        this.noticeId = noticeId;
        this.imageKey = imageKey;
        this.originalFileName = originalFileName.trim();
        reorder(displayOrder);
        renameCaption(caption);
    }

    /** 신규 이미지 메타 생성. */
    public static AppNoticeImage create(
            UUID noticeId,
            String imageKey,
            String originalFileName,
            int displayOrder,
            String caption) {
        return new AppNoticeImage(noticeId, imageKey, originalFileName, displayOrder, caption);
    }

    /** 이미지 표시 순서 변경. */
    public AppNoticeImage reorder(int displayOrder) {
        if (displayOrder < 0) {
            throw new IllegalArgumentException("displayOrder 는 0 이상이어야 합니다.");
        }
        this.displayOrder = displayOrder;
        return this;
    }

    /** 이미지 캡션 변경. */
    public AppNoticeImage renameCaption(String caption) {
        this.caption = caption == null || caption.isBlank() ? null : caption.trim();
        return this;
    }

    /** 이미지 메타 soft-delete. MinIO 객체는 감사 추적을 위해 보존한다. */
    public AppNoticeImage softDelete(String actor) {
        markDeleted(actor == null || actor.isBlank() ? "system" : actor);
        return this;
    }
}
