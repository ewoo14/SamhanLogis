package com.samhanair.logis.partnerorder.domain;

/**
 * 거래처 주문 상태 머신 (설계서 §3.6).
 *
 * <pre>
 *   DRAFT → POST /confirm → CONFIRMING (advisory lock)
 *     → DC + reserve + insert + slip 발행
 *     → CONFIRMED (slip 200/409)
 *     → CONFIRMED + slipPublishStatus=PENDING_RETRY (slip 5xx → outbox)
 *   CANCELED — 사용자 취소 (CONFIRMED 후 24h 내, 정책은 슬라이스 외)
 *   DRAFT ↔ ON_HOLD (보류/해제) — Phase 2.5
 * </pre>
 */
public enum PartnerOrderStatus {
    /** 임시저장 (PartnerOrderDraft 와는 별도, confirm 후의 history 표시용). */
    DRAFT,
    /** 보류 — 진행중(DRAFT)에서 멈춘 편집가능 상태 (Phase 2.5). DRAFT ↔ ON_HOLD 양방향. */
    ON_HOLD,
    /** confirm 진행 중 — advisory lock 보유. */
    CONFIRMING,
    /** 확정 — slipNo 발급 시도 (성공 또는 retry 큐). */
    CONFIRMED,
    /** 거래처 취소 또는 admin 반려. */
    CANCELED
}
