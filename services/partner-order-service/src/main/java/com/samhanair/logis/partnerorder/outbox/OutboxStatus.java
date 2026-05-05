package com.samhanair.logis.partnerorder.outbox;

/**
 * SlipPublishOutbox row 상태 (설계서 §6).
 *
 * <pre>
 *   PENDING ──(scheduler pick)──> PROCESSING
 *     ├─ 성공 → COMMITTED
 *     ├─ 5xx → PENDING (retry count++)
 *     └─ max-retry-hours 초과 → FAILED (alert)
 * </pre>
 */
public enum OutboxStatus {
    /** scheduler 가 다음 사이클에 pick 가능. */
    PENDING,
    /** scheduler 가 처리 중 (advisory lock 또는 SELECT FOR UPDATE SKIP LOCKED). */
    PROCESSING,
    /** slip-service 발행 성공 — outbox row 비활성. */
    COMMITTED,
    /** max-retry-hours 초과 — 운영 alert + 수동 조치 필요. */
    FAILED
}
