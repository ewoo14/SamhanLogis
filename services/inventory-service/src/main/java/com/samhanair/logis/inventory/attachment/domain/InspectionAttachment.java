package com.samhanair.logis.inventory.attachment.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 입고 검수 사진 첨부 파일 — P1 (검수 사진 첨부).
 *
 * <p>{@link com.samhanair.logis.inventory.domain.InboundInspection} 과 1:N. 실 파일은
 * MinIO (S3 호환) bucket {@code inspection-attachments} 에 저장하고 본 row 는 metadata + EXIF GPS 만 보유.
 *
 * <p>폴더 구조: {@code inspection-attachments/{inspectionId}/{uuid}.{ext}}
 *
 * <p>권한: WAREHOUSE / MANAGER / MASTER 만 업로드 허용 (매뉴얼 §04-사진-첨부.md 검수 권한 매트릭스).
 *
 * <p>Soft-delete: {@code @SQLRestriction("is_deleted = false")} + {@link BaseEntity#markDeleted}.
 * 회계 감사 추적 목적으로 MinIO 객체는 보존.
 *
 * <p>UUID 비공개 가드 (memory feedback_uuid_no_user_visibility) — 사용자 화면 노출은 slipNo / fileName 만.
 */
@Entity
@Getter
@Table(name = "inspection_attachments")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class InspectionAttachment extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /**
     * 소속 InboundInspection FK.
     * {@link com.samhanair.logis.inventory.domain.InboundInspection#getId()} 참조.
     */
    @Column(name = "inspection_id", nullable = false)
    private UUID inspectionId;

    /**
     * 슬립번호 snapshot — UUID 비공개 가드 의무 준수. 사용자 노출용.
     * 예: {@code 2026/01/10-001}
     */
    @Column(name = "slip_no", nullable = false, length = 30)
    private String slipNo;

    /** 원본 파일명. */
    @Column(name = "file_name", nullable = false, length = 200)
    private String fileName;

    /** 바이트 크기. */
    @Column(name = "file_size", nullable = false)
    private Long fileSize;

    /** MIME (image/jpeg / image/png). */
    @Column(name = "content_type", nullable = false, length = 100)
    private String contentType;

    /** MinIO object key (예: "inspection-attachments/{inspectionId}/{uuid}.jpg"). */
    @Column(name = "storage_key", nullable = false, length = 500)
    private String storageKey;

    /** presigned URL 캐시 (만료 가능 — 실 다운로드 시 재발급 권장). */
    @Column(name = "storage_url", length = 1000)
    private String storageUrl;

    /** EXIF GPS 위도 (선택, 모바일 카메라 촬영 시 자동 추출). */
    @Column(name = "exif_gps_lat", precision = 10, scale = 7)
    private BigDecimal exifGpsLat;

    /** EXIF GPS 경도 (선택). */
    @Column(name = "exif_gps_lng", precision = 10, scale = 7)
    private BigDecimal exifGpsLng;

    /** 실 촬영 시각 (선택, EXIF DateTime). */
    @Column(name = "captured_at")
    private LocalDateTime capturedAt;

    /** 업로더 user-id (gateway X-User-Id). */
    @Column(name = "uploaded_by", nullable = false, length = 50)
    private String uploadedBy;

    /** 업로드 시각 — audit createdAt 와 별도 (사용자 화면 노출용). */
    @Column(name = "uploaded_at", nullable = false)
    private LocalDateTime uploadedAt;

    /** 비고 (불량 내용 설명 등). */
    @Column(name = "description", length = 500)
    private String description;

    private InspectionAttachment(UUID inspectionId, String slipNo, String fileName, Long fileSize,
                                  String contentType, String storageKey,
                                  BigDecimal exifGpsLat, BigDecimal exifGpsLng,
                                  LocalDateTime capturedAt, String uploadedBy, String description) {
        if (inspectionId == null) {
            throw new IllegalArgumentException("inspectionId 는 필수입니다");
        }
        if (slipNo == null || slipNo.isBlank()) {
            throw new IllegalArgumentException("slipNo 는 필수입니다");
        }
        if (fileName == null || fileName.isBlank()) {
            throw new IllegalArgumentException("fileName 은 필수입니다");
        }
        if (fileSize == null || fileSize < 0L) {
            throw new IllegalArgumentException("fileSize 는 0 이상이어야 합니다");
        }
        if (contentType == null || contentType.isBlank()) {
            throw new IllegalArgumentException("contentType 은 필수입니다");
        }
        if (storageKey == null || storageKey.isBlank()) {
            throw new IllegalArgumentException("storageKey 는 필수입니다");
        }
        if (uploadedBy == null || uploadedBy.isBlank()) {
            throw new IllegalArgumentException("uploadedBy 는 필수입니다");
        }
        this.inspectionId = inspectionId;
        this.slipNo = slipNo;
        this.fileName = fileName;
        this.fileSize = fileSize;
        this.contentType = contentType;
        this.storageKey = storageKey;
        this.exifGpsLat = exifGpsLat;
        this.exifGpsLng = exifGpsLng;
        this.capturedAt = capturedAt;
        this.uploadedBy = uploadedBy;
        this.description = description;
        this.uploadedAt = LocalDateTime.now();
    }

    /**
     * 신규 검수 사진 첨부 등록 정적 factory.
     *
     * @param inspectionId 소속 InboundInspection UUID
     * @param slipNo       슬립번호 snapshot (UUID 비공개 가드)
     * @param fileName     원본 파일명
     * @param fileSize     바이트 크기
     * @param contentType  MIME 문자열
     * @param storageKey   MinIO object key
     * @param exifGpsLat   EXIF GPS 위도 (선택)
     * @param exifGpsLng   EXIF GPS 경도 (선택)
     * @param capturedAt   EXIF 촬영 시각 (선택)
     * @param uploadedBy   업로더 user-id
     * @param description  비고 (선택 — 불량 내용 설명 등)
     * @return 영속화 전 신규 InspectionAttachment
     */
    public static InspectionAttachment register(UUID inspectionId, String slipNo,
                                                String fileName, Long fileSize,
                                                String contentType, String storageKey,
                                                BigDecimal exifGpsLat, BigDecimal exifGpsLng,
                                                LocalDateTime capturedAt, String uploadedBy,
                                                String description) {
        return new InspectionAttachment(inspectionId, slipNo, fileName, fileSize, contentType,
                storageKey, exifGpsLat, exifGpsLng, capturedAt, uploadedBy, description);
    }

    /**
     * presigned URL 캐시 갱신 (service 계층에서 재발급 후 호출). 영속화는 dirty checking.
     *
     * @param storageUrl 신규 presigned URL
     */
    public void refreshStorageUrl(String storageUrl) {
        this.storageUrl = storageUrl;
    }

    /**
     * Soft-delete. {@link BaseEntity#markDeleted} 위임.
     * MinIO 객체는 감사 추적을 위해 보존.
     *
     * @param deleterUserId 삭제 수행자 user-id
     */
    public void softDelete(String deleterUserId) {
        markDeleted(deleterUserId);
    }
}
