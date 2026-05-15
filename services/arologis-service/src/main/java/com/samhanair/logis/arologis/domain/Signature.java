package com.samhanair.logis.arologis.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
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
 * 전자서명 — Phase 10 W10-1.
 *
 * <p>slip-service 와의 통합은 W10-4 시점. 본 PR 은 entity + 저장 endpoint (driver-app POST) 만.
 *
 * <p>source = LINK (외부 기사 링크 서명) 또는 APP (본 어플 서명). APP 일 때 GPS 캡처 (capturedLatitude/Longitude).
 * imageRef 는 S3 또는 file-server 의 reference (실 저장은 W10-4 통합 시점).
 */
@Entity
@Getter
@Table(name = "signatures")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class Signature extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "stop_id", nullable = false)
    private UUID stopId;

    @Enumerated(EnumType.STRING)
    @Column(name = "source", nullable = false, length = 20)
    private SignatureSource source;

    @Column(name = "image_ref", length = 500)
    private String imageRef;

    @Column(name = "captured_at", nullable = false)
    private LocalDateTime capturedAt;

    /** GPS 위도 (NUMERIC(10,7) — 약 1cm 정확도). APP 일 때만 의미. */
    @Column(name = "captured_latitude", precision = 10, scale = 7)
    private BigDecimal capturedLatitude;

    @Column(name = "captured_longitude", precision = 10, scale = 7)
    private BigDecimal capturedLongitude;

    /**
     * 사본 PNG download 시각 — Phase F (D-DF-04). NULL = 호출 OK, NOT NULL = 409 가드.
     */
    @Column(name = "copy_sent_at")
    private LocalDateTime copySentAt;

    /** Tx2 c/d 단계 fail 카운트 — Phase F (모니터링 alert). */
    @Column(name = "copy_send_failure_count", nullable = false)
    private int copySendFailureCount = 0;

    /** 디스크 저장 경로 — Phase F (D-DF-10). Phase 11 S3 cutover. */
    @Column(name = "copy_image_path", length = 255)
    private String copyImagePath;

    /** 발송 시점 인수자 번호 스냅샷 — Phase F (D-DF-09, 풀 번호). */
    @Column(name = "copy_recipient_phone", length = 20)
    private String copyRecipientPhone;

    private Signature(UUID stopId, SignatureSource source, String imageRef,
                      LocalDateTime capturedAt, BigDecimal lat, BigDecimal lng) {
        if (stopId == null) {
            throw new IllegalArgumentException("stopId 필수");
        }
        if (source == null) {
            throw new IllegalArgumentException("source 필수");
        }
        if (capturedAt == null) {
            throw new IllegalArgumentException("capturedAt 필수");
        }
        this.stopId = stopId;
        this.source = source;
        this.imageRef = imageRef;
        this.capturedAt = capturedAt;
        this.capturedLatitude = lat;
        this.capturedLongitude = lng;
    }

    /**
     * 신규 Signature 생성.
     *
     * @param stopId 정차 UUID
     * @param source 서명 소스 (LINK / APP)
     * @param imageRef 이미지 reference (W10-4 통합 시점 file-server 경로)
     * @param capturedAt 서명 시각
     * @param lat GPS 위도 (APP 일 때)
     * @param lng GPS 경도 (APP 일 때)
     */
    public static Signature of(UUID stopId, SignatureSource source, String imageRef,
                               LocalDateTime capturedAt, BigDecimal lat, BigDecimal lng) {
        return new Signature(stopId, source, imageRef, capturedAt, lat, lng);
    }

    /**
     * 사본 PNG download 직전 호출 — 성공 1회 가드 set. Phase F (D-DF-04).
     *
     * @param imagePath 디스크 path (절대 경로)
     * @param recipientPhone 발송 시점 인수자 번호 스냅샷 (풀 번호)
     * @throws IllegalStateException 이미 copySentAt set (중복 호출)
     * @throws IllegalArgumentException imagePath 누락
     */
    public void markCopySent(String imagePath, String recipientPhone) {
        if (this.copySentAt != null) {
            throw new IllegalStateException("이미 사본 발송 완료 — copySentAt=" + this.copySentAt);
        }
        if (imagePath == null || imagePath.isBlank()) {
            throw new IllegalArgumentException("imagePath 필수");
        }
        this.copySentAt = LocalDateTime.now();
        this.copyImagePath = imagePath;
        this.copyRecipientPhone = recipientPhone;
    }

    /** Tx2 c/d 단계 fail 시 카운트 증분 (copySentAt 미설정 — 재시도 가능). Phase F. */
    public void markCopyFailure() {
        this.copySendFailureCount++;
    }

    /** 1회 가드 readonly check. Phase F (D-DF-04). */
    public boolean isCopySent() {
        return this.copySentAt != null;
    }
}
