package com.samhanair.logis.partnerorder.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 게이트 진입 이미지 (legacy getGateImages 7244 → 본 entity). 두 가지 저장 전략 호환:
 * <ul>
 *   <li>{@link #s3Key} — 신규 (S3/MinIO presigned URL 발급)</li>
 *   <li>{@link #base64} — legacy (base64 직접 임베드, 마이그레이션 호환)</li>
 * </ul>
 *
 * <p>둘 중 하나는 채워져야 한다. controller 는 우선 s3Key 가 있으면 presigned URL 로,
 * 없으면 base64 inline 으로 응답.
 */
@Entity
@Getter
@Table(name = "partner_order_gate_images")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class GateImage extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** 이미지 식별 라벨 (gate-1 / gate-2 / gate-3). */
    @Column(name = "label", nullable = false, length = 50, unique = true)
    private String label;

    /** S3/MinIO object key (선택). */
    @Column(name = "s3_key", length = 500)
    private String s3Key;

    /** base64 인코딩 이미지 (선택, legacy 호환). */
    @Lob
    @Column(name = "base64")
    private String base64;

    /** 표시 순서 (오름차순). */
    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    /** MIME (image/png, image/jpeg). */
    @Column(name = "mime_type", nullable = false, length = 30)
    private String mimeType;

    private GateImage(String label, String s3Key, String base64, int displayOrder, String mimeType) {
        if (label == null || label.isBlank()) {
            throw new IllegalArgumentException("label 필수");
        }
        if ((s3Key == null || s3Key.isBlank()) && (base64 == null || base64.isBlank())) {
            throw new IllegalArgumentException("s3Key 또는 base64 중 하나는 필수");
        }
        if (mimeType == null || mimeType.isBlank()) {
            throw new IllegalArgumentException("mimeType 필수");
        }
        this.label = label;
        this.s3Key = s3Key;
        this.base64 = base64;
        this.displayOrder = displayOrder;
        this.mimeType = mimeType;
    }

    /** S3/MinIO 저장 모드 GateImage 생성. */
    public static GateImage ofS3(String label, String s3Key, int displayOrder, String mimeType) {
        return new GateImage(label, s3Key, null, displayOrder, mimeType);
    }

    /** base64 inline 저장 모드 GateImage 생성. */
    public static GateImage ofBase64(String label, String base64, int displayOrder, String mimeType) {
        return new GateImage(label, null, base64, displayOrder, mimeType);
    }
}
