package com.samhanair.logis.partnerorder.domain;

/**
 * slip-service 발행 상태 (설계서 §3.6 + §6 outbox 흐름).
 *
 * <ul>
 *   <li>{@link #NOT_REQUIRED} — 전표 발행 전 단계. 견적 -> 주문 변환처럼 confirm 전 주문에 사용</li>
 *   <li>{@link #PUBLISHED} — slip-service 200 OK 또는 409 (idempotency duplicate) — slipNo 채워짐</li>
 *   <li>{@link #PENDING_RETRY} — slip-service 5xx → outbox row INSERT (PENDING) — scheduler 재시도</li>
 *   <li>{@link #FAILED_PERMANENT} — outbox max-retry-hours 초과 → alert</li>
 * </ul>
 */
public enum SlipPublishStatus {
    /** 전표 발행 전 단계. */
    NOT_REQUIRED,
    /** 발행 성공 (200 또는 409 idempotency). */
    PUBLISHED,
    /** 5xx → outbox 큐. scheduler 5분 마다 재시도. */
    PENDING_RETRY,
    /** max-retry-hours (기본 24h) 초과 — 운영 alert. */
    FAILED_PERMANENT
}
