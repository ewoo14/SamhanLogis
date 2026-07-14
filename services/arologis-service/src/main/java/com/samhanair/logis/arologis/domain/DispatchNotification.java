package com.samhanair.logis.arologis.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
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
 * 배차 차량별 알림 발송이력.
 *
 * <p>notification-service 를 배차 도메인에 결합하지 않기 위해, 배차 상세 화면에 필요한
 * 발송 결과 스냅샷은 arologis 로컬 테이블에 저장한다. UUID 는 API 응답에 직접 노출하지 않고
 * {@code DispatchNotificationAssembler} 가 차량별 표시 DTO 로 변환한다.
 *
 * <p>BaseEntity 7 audit + Soft Delete (`@SQLRestriction`) 의무.
 */
@Entity
@Getter
@Table(name = "dispatch_notifications")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class DispatchNotification extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "dispatch_id", nullable = false)
    private UUID dispatchId;

    @Column(name = "vehicle_id", nullable = false)
    private UUID vehicleId;

    @Enumerated(EnumType.STRING)
    @Column(name = "channel", nullable = false, length = 30)
    private ArologisNotifyChannel channel;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private ArologisNotifyStatus status;

    @Column(name = "sent_at", nullable = false)
    private LocalDateTime sentAt;

    @Column(name = "recipient_phone", length = 20)
    private String recipientPhone;

    @Column(name = "error_code", length = 100)
    private String errorCode;

    private DispatchNotification(UUID dispatchId, UUID vehicleId, ArologisNotifyChannel channel,
                                 ArologisNotifyStatus status, LocalDateTime sentAt,
                                 String recipientPhone, String errorCode) {
        if (dispatchId == null) {
            throw new IllegalArgumentException("dispatchId 필수");
        }
        if (vehicleId == null) {
            throw new IllegalArgumentException("vehicleId 필수");
        }
        if (channel == null) {
            throw new IllegalArgumentException("channel 필수");
        }
        if (status == null) {
            throw new IllegalArgumentException("status 필수");
        }
        if (sentAt == null) {
            throw new IllegalArgumentException("sentAt 필수");
        }
        this.dispatchId = dispatchId;
        this.vehicleId = vehicleId;
        this.channel = channel;
        this.status = status;
        this.sentAt = sentAt;
        this.recipientPhone = normalizeLength(recipientPhone, 20);
        this.errorCode = normalizeLength(errorCode, 100);
    }

    /**
     * 신규 배차 알림 발송이력을 생성한다.
     *
     * @param dispatchId 배차 UUID
     * @param vehicleId 차량 UUID
     * @param channel 아로로지스 알림 채널
     * @param status 발송 상태
     * @param sentAt 발송 시각
     * @param recipientPhone 수신자 전화번호 스냅샷
     * @param errorCode 실패 코드. 성공 시 null
     * @return 영속화 전 알림 발송이력
     */
    public static DispatchNotification of(UUID dispatchId, UUID vehicleId, ArologisNotifyChannel channel,
                                          ArologisNotifyStatus status, LocalDateTime sentAt,
                                          String recipientPhone, String errorCode) {
        return new DispatchNotification(dispatchId, vehicleId, channel, status, sentAt, recipientPhone, errorCode);
    }

    private static String normalizeLength(String value, int maxLength) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String normalized = value.trim();
        return normalized.length() <= maxLength ? normalized : normalized.substring(0, maxLength);
    }
}
