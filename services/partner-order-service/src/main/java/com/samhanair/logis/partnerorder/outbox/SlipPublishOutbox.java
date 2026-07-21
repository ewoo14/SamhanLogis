package com.samhanair.logis.partnerorder.outbox;

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
 * Outbox row — slip-service 발행 5xx/408/429 시 INSERT (PENDING). scheduler 가 5분 마다 claim 후
 * 재시도. 성공 시 COMMITTED, 복구 불가 4xx(INVALID_INPUT/CONFLICT — 408/429 는 제외, 5xx 와 동일하게
 * 재시도 대상) 또는 max-retry-hours (기본 24h) 초과 시 FAILED.
 *
 * <p>claim 은 네이티브 {@code UPDATE ... RETURNING}(FOR UPDATE SKIP LOCKED)으로 PENDING 또는 lease
 * ({@code samhan.outbox.lease-seconds}) 만료 PROCESSING 을 PROCESSING 으로 원자 전이하며, PROCESSING 은
 * DB 에 영속된다. HTTP 발행은 claim/결과 tx 밖에서 수행하고, 결과 tx 는 row 를 비관 락으로 재검해
 * 소유권을 확정한다(lease overlap clobber 차단).
 *
 * <p>설계서 §6 — at-least-once 보장 + Idempotency-Key 로 slip-service 가 중복 발행 차단 (동일 키+본문 재시도 시 200 replay).
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

    /** slip-service POST /from-partner-order 요청 본문 JSON 직렬화 (재시도 시 동일 본문). PostgreSQL TEXT. */
    @Column(name = "request_payload", nullable = false, columnDefinition = "TEXT")
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

    /** 마지막 5xx/408/429 응답 본문 또는 예외 메시지 (운영 진단용). PostgreSQL TEXT. */
    @Column(name = "last_error", columnDefinition = "TEXT")
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
     * 신규 outbox row — 최초 5xx/408/429 발생 시점에 INSERT.
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

    /** slip-service 200 replay/201 신규 → COMMITTED 종결. */
    public void markCommitted() {
        this.status = OutboxStatus.COMMITTED;
        this.lastError = null;
    }

    /** 5xx/408/429 응답 — PENDING 으로 되돌리고 attemptCount++ + nextAttemptAt 갱신. */
    public void markRetry(String error, LocalDateTime nextAttemptAt) {
        this.status = OutboxStatus.PENDING;
        this.attemptCount += 1;
        this.lastAttemptedAt = LocalDateTime.now();
        this.nextAttemptAt = nextAttemptAt;
        this.lastError = error;
    }

    /**
     * 발행 성공 후 결과 tx 실패로 인한 재큐잉 — PENDING 복귀하되 attemptCount 는 증가시키지 않는다.
     *
     * <p>발행(HTTP) 자체는 성공했으므로 결과 영속화 재시도를 발행 재시도로 오분류하면 안 된다.
     * {@code markRetry}(attemptCount++)를 쓰면 결과 저장이 반복 실패할 때 attemptCount 가 부풀려져
     * max-retry-hours 판정이 왜곡되므로, 재시도 카운트를 보존한 채 next-attempt 만 갱신한다.
     */
    public void markRequeue(String error, LocalDateTime nextAttemptAt) {
        this.status = OutboxStatus.PENDING;
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
