package com.samhanair.logis.partnerorder.outbox;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * Outbox row — slip-service 발행 5xx 시 INSERT (PENDING). scheduler 가 5분 마다 picks 후
 * 재시도. 성공 시 COMMITTED, max-retry-hours (기본 24h) 초과 시 FAILED.
 *
 * <p>설계서 §6 — at-least-once 보장 + Idempotency-Key 로 slip-service 가 중복 차단 (409).
 *
 * <p>{@link #idempotencyKey} 는 PartnerOrder 의 동일 키 ({@code PO-CONF-{draftSeq}}) — 재시도
 * 시 동일 키 재사용으로 slip-service 의 중복 발행을 차단.
 */
@Entity
@Getter
@Table(name = "slip_publish_outbox")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class SlipPublishOutbox extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** 발행 대상 PartnerOrder.id — 재시도 시 join 으로 line 재구성. */
    @Column(name = "partner_order_id", nullable = false, unique = true)
    private UUID partnerOrderId;

    @Column(name = "idempotency_key", nullable = false, length = 80, unique = true)
    private String idempotencyKey;

    /** slip-service POST /from-partner-order 요청 본문 JSON 직렬화 (재시도 시 동일 본문). */
    @Lob
    @Column(name = "request_payload", nullable = false)
    private String requestPayload;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private OutboxStatus status;

    @Column(name = "attempt_count", nullable = false)
    private int attemptCount;

    /** 최초 INSERT 시각 — max-retry-hours 검사 기준점. */
    @Column(name = "first_attempted_at", nullable = false)
    private LocalDateTime firstAttemptedAt;

    @Column(name = "last_attempted_at", nullable = false)
    private LocalDateTime lastAttemptedAt;

    /** scheduler 가 다음 시도할 시점 (jitter 포함). */
    @Column(name = "next_attempt_at", nullable = false)
    private LocalDateTime nextAttemptAt;

    /** 마지막 5xx 응답 본문 또는 예외 메시지 (운영 진단용). */
    @Lob
    @Column(name = "last_error")
    private String lastError;

    private SlipPublishOutbox(UUID partnerOrderId, String idempotencyKey, String requestPayload) {
        if (partnerOrderId == null) {
            throw new IllegalArgumentException("partnerOrderId 필수");
        }
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            throw new IllegalArgumentException("idempotencyKey 필수");
        }
        if (requestPayload == null) {
            throw new IllegalArgumentException("requestPayload 필수");
        }
        LocalDateTime now = LocalDateTime.now();
        this.partnerOrderId = partnerOrderId;
        this.idempotencyKey = idempotencyKey;
        this.requestPayload = requestPayload;
        this.status = OutboxStatus.PENDING;
        this.attemptCount = 1;
        this.firstAttemptedAt = now;
        this.lastAttemptedAt = now;
        this.nextAttemptAt = now.plusMinutes(5);
    }

    /**
     * 신규 outbox row — 최초 5xx 발생 시점에 INSERT.
     *
     * @param partnerOrderId PartnerOrder UUID
     * @param idempotencyKey slip-service Idempotency-Key (재사용)
     * @param requestPayload slip-service POST 본문 JSON 직렬화
     * @return 신규 SlipPublishOutbox (영속화 전)
     */
    public static SlipPublishOutbox queue(UUID partnerOrderId, String idempotencyKey,
                                          String requestPayload) {
        return new SlipPublishOutbox(partnerOrderId, idempotencyKey, requestPayload);
    }

    /** scheduler 가 pick 직후 PROCESSING 으로 전이. */
    public void markProcessing() {
        if (this.status != OutboxStatus.PENDING) {
            throw new IllegalStateException("PENDING 상태에서만 PROCESSING 전이 가능: 현재=" + this.status);
        }
        this.status = OutboxStatus.PROCESSING;
    }

    /** slip-service 200/409 → COMMITTED 종결. */
    public void markCommitted() {
        this.status = OutboxStatus.COMMITTED;
        this.lastError = null;
    }

    /** 5xx 응답 — PENDING 으로 되돌리고 attemptCount++ + nextAttemptAt 갱신. */
    public void markRetry(String error, LocalDateTime nextAttemptAt) {
        this.status = OutboxStatus.PENDING;
        this.attemptCount += 1;
        this.lastAttemptedAt = LocalDateTime.now();
        this.nextAttemptAt = nextAttemptAt;
        this.lastError = error;
    }

    /** max-retry-hours 초과 — FAILED 종결 + 운영 alert. */
    public void markFailed(String error) {
        this.status = OutboxStatus.FAILED;
        this.lastError = error;
        this.lastAttemptedAt = LocalDateTime.now();
    }
}
