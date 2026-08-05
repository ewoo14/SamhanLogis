package com.samhanair.logis.notification.domain;

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
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

/**
 * 발송 요청 1건 — 채널 / 수신자 / 본문 / 상태.
 *
 * <p>실제 게이트웨이 호출 결과는 {@link NotificationLog} 별도 entity 로 attempt 단위 누적.
 * 본 entity 의 {@link #status} 는 라이프사이클 종합 상태:
 * <ul>
 *   <li>{@link NotificationStatus#PENDING} — 요청 등록 직후.</li>
 *   <li>{@link NotificationStatus#SENT} — 게이트웨이 호출 성공.</li>
 *   <li>{@link NotificationStatus#FAILED} — 재시도 한도 초과 또는 명시 실패.</li>
 *   <li>{@link NotificationStatus#RETRYING} — 실패 후 재시도 진행 중.</li>
 * </ul>
 *
 * <p>UUID 비공개 가드 — recipient_id 같은 UUID 는 외부 사용자 화면에 직접 노출하지 않는다 (관리자
 * panel 한정 + 사용자 표시명은 user-service / partner-service lookup 결과로 매핑).
 *
 * <p>payload 는 PostgreSQL {@code JSONB} (RDS 호환 표준) — H2 PG MODE 에서는 LOB 로 동작 (test 만 영향).
 */
@Entity
@Getter
@Table(name = "notification_requests")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class NotificationRequest extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Enumerated(EnumType.STRING)
    @Column(name = "recipient_type", nullable = false, length = 20, updatable = false)
    private RecipientType recipientType;

    /** USER / PARTNER 인 경우 user-service / partner-service 의 UUID. EXTERNAL_PHONE 인 경우 null. */
    @Column(name = "recipient_id", updatable = false)
    private UUID recipientId;

    /** EXTERNAL_PHONE 인 경우 전화번호, USER/PARTNER 의 보조 채널 주소 (이메일/전화) — 선택. */
    @Column(name = "recipient_address", length = 200)
    private String recipientAddress;

    @Enumerated(EnumType.STRING)
    @Column(name = "channel", nullable = false, length = 20, updatable = false)
    private NotificationChannel channel;

    /** 사전 등록 템플릿 코드 (선택 — 직접 본문 전달 가능). */
    @Column(name = "template_code", length = 50)
    private String templateCode;

    @Column(name = "subject", length = 200)
    private String subject;

    @Column(name = "body", length = 2000)
    private String body;

    /**
     * 추가 메타 / 변수 치환용 페이로드 (JSONB). Postgres native, H2 PG MODE 에서는 LOB.
     * 본 W3 시점 payload 는 raw JSON 문자열로 저장하고 application 에서 파싱 (Jackson Mapper).
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "payload", columnDefinition = "jsonb")
    private String payload;

    @Column(name = "idempotency_key", length = 100, updatable = false)
    private String idempotencyKey;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private NotificationStatus status;

    @Column(name = "last_attempted_at")
    private LocalDateTime lastAttemptedAt;

    @Column(name = "attempt_count", nullable = false)
    private int attemptCount;

    private NotificationRequest(RecipientType recipientType, UUID recipientId, String recipientAddress,
                                NotificationChannel channel, String templateCode,
                                String subject, String body, String payload, String idempotencyKey) {
        if (recipientType == null) {
            throw new IllegalArgumentException("recipientType 필수");
        }
        if (channel == null) {
            throw new IllegalArgumentException("channel 필수");
        }
        if (recipientType == RecipientType.EXTERNAL_PHONE
                && (recipientAddress == null || recipientAddress.isBlank())) {
            throw new IllegalArgumentException("EXTERNAL_PHONE 은 recipientAddress 필수");
        }
        if ((recipientType == RecipientType.USER || recipientType == RecipientType.PARTNER)
                && recipientId == null) {
            throw new IllegalArgumentException("USER / PARTNER 는 recipientId 필수");
        }
        this.recipientType = recipientType;
        this.recipientId = recipientId;
        this.recipientAddress = recipientAddress;
        this.channel = channel;
        this.templateCode = templateCode;
        this.subject = subject;
        this.body = body;
        this.payload = payload;
        this.idempotencyKey = idempotencyKey;
        this.status = NotificationStatus.PENDING;
        this.attemptCount = 0;
    }

    /**
     * 신규 발송 요청 생성. status=PENDING, attemptCount=0.
     */
    public static NotificationRequest open(RecipientType recipientType, UUID recipientId, String recipientAddress,
                                           NotificationChannel channel, String templateCode,
                                           String subject, String body, String payload) {
        return new NotificationRequest(recipientType, recipientId, recipientAddress,
                channel, templateCode, subject, body, payload, null);
    }

    public static NotificationRequest open(RecipientType recipientType, UUID recipientId, String recipientAddress,
                                           NotificationChannel channel, String templateCode,
                                           String subject, String body, String payload, String idempotencyKey) {
        return new NotificationRequest(recipientType, recipientId, recipientAddress,
                channel, templateCode, subject, body, payload, idempotencyKey);
    }

    /**
     * 게이트웨이 호출 성공 처리. status=SENT 종료.
     */
    public void markSent() {
        this.status = NotificationStatus.SENT;
        this.lastAttemptedAt = LocalDateTime.now();
        this.attemptCount = this.attemptCount + 1;
    }

    /**
     * 게이트웨이 호출 실패 처리. retry=true 시 RETRYING (재시도 큐 진입), false 시 FAILED 종료.
     */
    public void markFailed(boolean retryable) {
        this.status = retryable ? NotificationStatus.RETRYING : NotificationStatus.FAILED;
        this.lastAttemptedAt = LocalDateTime.now();
        this.attemptCount = this.attemptCount + 1;
    }

    /**
     * admin 명시 재시도 — FAILED 종료 상태에서만 호출 가능. status 는 RETRYING 으로 전이.
     */
    public void requeueForRetry() {
        if (this.status != NotificationStatus.FAILED && this.status != NotificationStatus.RETRYING) {
            throw new IllegalStateException(NotificationStatus.FAILED.getDisplayName()
                    + " / " + NotificationStatus.RETRYING.getDisplayName()
                    + " 상태에서만 재시도 가능: " + this.status.getDisplayName());
        }
        this.status = NotificationStatus.RETRYING;
    }
}
