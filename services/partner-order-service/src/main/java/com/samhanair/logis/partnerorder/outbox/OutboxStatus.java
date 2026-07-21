package com.samhanair.logis.partnerorder.outbox;

/**
 * SlipPublishOutbox row 상태 (설계서 §6).
 *
 * <pre>
 *   PENDING ──(claim: UPDATE ... RETURNING, FOR UPDATE SKIP LOCKED)──> PROCESSING
 *     ├─ 발행 성공(200 replay/201 신규) → COMMITTED
 *     ├─ 복구 불가 4xx(INVALID_INPUT·CONFLICT) → 즉시 FAILED (max-retry 대기 없음)
 *     ├─ 그 외 오류/5xx → PENDING (attemptCount++, 지수 백오프)
 *     └─ max-retry-hours 초과 → FAILED (운영 alert)
 * </pre>
 *
 * <p>PROCESSING 은 claim tx 에서 DB 에 영속된다. 결과 tx 종료 전 프로세스가 죽으면 lease
 * ({@code samhan.outbox.lease-seconds}) 만료 후 다른 worker 가 stale PROCESSING 을 재점유한다.
 */
public enum OutboxStatus {
    /** scheduler 가 다음 claim 사이클에 pick 가능. */
    PENDING,
    /**
     * claim 되어 처리 중 — 네이티브 {@code UPDATE ... FOR UPDATE SKIP LOCKED} 로 점유하고 영속한다.
     * lease 만료 시 다른 worker 가 재점유하며, 결과 tx 는 row 를 비관 락으로 재검해 소유권을 확정한다.
     */
    PROCESSING,
    /** slip-service 발행 성공 — outbox row 비활성. */
    COMMITTED,
    /** 복구 불가 4xx(INVALID_INPUT/CONFLICT) 또는 max-retry-hours 초과 — 운영 alert + 수동 조치 필요. */
    FAILED
}
